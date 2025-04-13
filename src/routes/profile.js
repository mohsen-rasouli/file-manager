const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all routes
router.use(isAuthenticated);

// View profile
router.get('/', (req, res) => {
  const userId = req.session.user.id;
  
  db.get('SELECT name, phone, createdAt FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err) {
      console.error('Error getting user profile:', err);
      return res.status(500).render('error', { 
        message: 'خطا در دریافت اطلاعات پروفایل',
        error: { status: 500 }
      });
    }
    
    if (!userData) {
      return res.status(404).render('error', { 
        message: 'کاربر یافت نشد',
        error: { status: 404 }
      });
    }
    
    // Get login history
    db.all(
      'SELECT * FROM login_logs WHERE userId = ? ORDER BY loginAt DESC LIMIT 10',
      [userId],
      (err, loginLogs) => {
        if (err) {
          console.error('Error getting login logs:', err);
          return res.status(500).render('error', { 
            message: 'خطا در دریافت تاریخچه ورود',
            error: { status: 500 }
          });
        }
        
        // Get file operations
        db.all(
          'SELECT * FROM file_operations WHERE userId = ? ORDER BY createdAt DESC LIMIT 10',
          [userId],
          (err, fileOps) => {
            if (err) {
              console.error('Error getting file operations:', err);
              return res.status(500).render('error', { 
                message: 'خطا در دریافت تاریخچه عملیات',
                error: { status: 500 }
              });
            }
            
            // Get storage usage
            db.get(
              'SELECT SUM(size) as totalSize FROM files WHERE userId = ?',
              [userId],
              (err, storage) => {
                if (err) {
                  console.error('Error getting storage usage:', err);
                  return res.status(500).render('error', { 
                    message: 'خطا در دریافت اطلاعات فضای ذخیره سازی',
                    error: { status: 500 }
                  });
                }
                
                res.render('profile', {
                  user: req.session.user,
                  userData,
                  loginLogs,
                  fileOps,
                  storage: {
                    used: storage ? storage.totalSize || 0 : 0,
                    formatted: formatBytes(storage ? storage.totalSize || 0 : 0)
                  },
                  success: req.query.success || null,
                  error: null
                });
              }
            );
          }
        );
      }
    );
  });
});

// Edit profile form
router.get('/edit', (req, res) => {
  const userId = req.session.user.id;
  
  db.get('SELECT name, phone FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err) {
      console.error('Error getting user profile:', err);
      return res.status(500).render('error', { 
        message: 'خطا در دریافت اطلاعات پروفایل',
        error: { status: 500 }
      });
    }
    
    if (!userData) {
      return res.status(404).render('error', { 
        message: 'کاربر یافت نشد',
        error: { status: 404 }
      });
    }
    
    res.render('profile-edit', {
      user: req.session.user,
      userData,
      error: null
    });
  });
});

// Update profile
router.post('/edit', (req, res) => {
  const userId = req.session.user.id;
  const { name, phone, currentPassword, newPassword, confirmPassword } = req.body;
  
  // Validate form data
  if (!name || !phone) {
    return res.render('profile-edit', {
      user: req.session.user,
      userData: req.body,
      error: 'نام و شماره تلفن الزامی هستند'
    });
  }
  
  // Get current user data
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err) {
      console.error('Error getting user data:', err);
      return res.status(500).render('error', { 
        message: 'خطا در بروزرسانی پروفایل',
        error: { status: 500 }
      });
    }
    
    if (!userData) {
      return res.status(404).render('error', { 
        message: 'کاربر یافت نشد',
        error: { status: 404 }
      });
    }
    
    // Check if phone number is already in use by another user
    db.get('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId], (err, existingUser) => {
      if (err) {
        console.error('Error checking phone number:', err);
        return res.status(500).render('error', { 
          message: 'خطا در بروزرسانی پروفایل',
          error: { status: 500 }
        });
      }
      
      if (existingUser) {
        return res.render('profile-edit', {
          user: req.session.user,
          userData: req.body,
          error: 'این شماره تلفن قبلا ثبت شده است'
        });
      }
      
      // Handle password update if requested
      if (newPassword) {
        if (!currentPassword) {
          return res.render('profile-edit', {
            user: req.session.user,
            userData: req.body,
            error: 'برای تغییر رمز عبور، وارد کردن رمز عبور فعلی الزامی است'
          });
        }
        
        if (newPassword !== confirmPassword) {
          return res.render('profile-edit', {
            user: req.session.user,
            userData: req.body,
            error: 'رمز عبور جدید و تکرار آن باید یکسان باشند'
          });
        }
        
        // Verify current password
        bcrypt.compare(currentPassword, userData.password, (err, result) => {
          if (err) {
            console.error('Error comparing passwords:', err);
            return res.status(500).render('error', { 
              message: 'خطا در بروزرسانی پروفایل',
              error: { status: 500 }
            });
          }
          
          if (!result) {
            return res.render('profile-edit', {
              user: req.session.user,
              userData: req.body,
              error: 'رمز عبور فعلی اشتباه است'
            });
          }
          
          // Hash new password
          bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) {
              console.error('Error hashing password:', err);
              return res.status(500).render('error', { 
                message: 'خطا در بروزرسانی پروفایل',
                error: { status: 500 }
              });
            }
            
            // Update user with new password
            db.run(
              'UPDATE users SET name = ?, phone = ?, password = ? WHERE id = ?',
              [name, phone, hash, userId],
              (err) => {
                if (err) {
                  console.error('Error updating profile:', err);
                  return res.status(500).render('error', { 
                    message: 'خطا در بروزرسانی پروفایل',
                    error: { status: 500 }
                  });
                }
                
                // Update session data
                req.session.user.name = name;
                req.session.user.phone = phone;
                
                res.redirect('/profile?success=updated');
              }
            );
          });
        });
      } else {
        // Update user without changing password
        db.run(
          'UPDATE users SET name = ?, phone = ? WHERE id = ?',
          [name, phone, userId],
          (err) => {
            if (err) {
              console.error('Error updating profile:', err);
              return res.status(500).render('error', { 
                message: 'خطا در بروزرسانی پروفایل',
                error: { status: 500 }
              });
            }
            
            // Update session data
            req.session.user.name = name;
            req.session.user.phone = phone;
            
            res.redirect('/profile?success=updated');
          }
        );
      }
    });
  });
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = router; 