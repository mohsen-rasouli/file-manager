const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../models/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { formatBytes } = require('../utils/helpers');

const router = express.Router();

// Apply middleware to all routes
router.use(isAuthenticated);
router.use(isAdmin);

// List all users
router.get('/', (req, res) => {
  db.all('SELECT id, name, phone, isAdmin, createdAt FROM users ORDER BY id', (err, users) => {
    if (err) {
      console.error('Error getting users:', err);
      return res.status(500).render('error', { 
        message: 'خطا در دریافت اطلاعات کاربران',
        error: { status: 500 }
      });
    }
    
    res.render('users', {
      user: req.session.user,
      users,
      error: null,
      success: null
    });
  });
});

// User create form
router.get('/create', (req, res) => {
  res.render('user-form', {
    user: req.session.user,
    userData: {},
    error: null,
    isEdit: false
  });
});

// User edit form
router.get('/edit/:id', (req, res) => {
  const userId = req.params.id;
  
  db.get('SELECT id, name, phone, isAdmin FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err) {
      console.error('Error getting user:', err);
      return res.status(500).render('error', { 
        message: 'خطا در دریافت اطلاعات کاربر',
        error: { status: 500 }
      });
    }
    
    if (!userData) {
      return res.status(404).render('error', { 
        message: 'کاربر مورد نظر یافت نشد',
        error: { status: 404 }
      });
    }
    
    res.render('user-form', {
      user: req.session.user,
      userData,
      error: null,
      isEdit: true
    });
  });
});

// Create user
router.post('/create', (req, res) => {
  const { name, phone, password, confirmPassword, isAdmin } = req.body;
  
  // Validate form data
  if (!name || !phone || !password) {
    return res.render('user-form', {
      user: req.session.user,
      userData: req.body,
      error: 'تمام فیلدها الزامی هستند',
      isEdit: false
    });
  }
  
  if (password !== confirmPassword) {
    return res.render('user-form', {
      user: req.session.user,
      userData: req.body,
      error: 'رمز عبور و تکرار آن باید یکسان باشند',
      isEdit: false
    });
  }
  
  // Check if user with phone number already exists
  db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, existingUser) => {
    if (err) {
      console.error(err);
      return res.status(500).render('error', { 
        message: 'خطا در ایجاد کاربر',
        error: { status: 500 }
      });
    }
    
    if (existingUser) {
      return res.render('user-form', {
        user: req.session.user,
        userData: req.body,
        error: 'این شماره تلفن قبلا ثبت شده است',
        isEdit: false
      });
    }
    
    // Hash the password
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.error(err);
        return res.status(500).render('error', { 
          message: 'خطا در ایجاد کاربر',
          error: { status: 500 }
        });
      }
      
      // Insert new user
      db.run(
        'INSERT INTO users (name, phone, password, isAdmin) VALUES (?, ?, ?, ?)',
        [name, phone, hash, isAdmin ? 1 : 0],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).render('error', { 
              message: 'خطا در ایجاد کاربر',
              error: { status: 500 }
            });
          }
          
          res.redirect('/users?success=created');
        }
      );
    });
  });
});

// Update user
router.post('/edit/:id', (req, res) => {
  const userId = req.params.id;
  const { name, phone, password, confirmPassword, isAdmin } = req.body;
  
  // Validate form data
  if (!name || !phone) {
    return res.render('user-form', {
      user: req.session.user,
      userData: { id: userId, ...req.body },
      error: 'نام و شماره تلفن الزامی هستند',
      isEdit: true
    });
  }
  
  // Check if user exists
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err) {
      console.error(err);
      return res.status(500).render('error', { 
        message: 'خطا در ویرایش کاربر',
        error: { status: 500 }
      });
    }
    
    if (!userData) {
      return res.status(404).render('error', { 
        message: 'کاربر مورد نظر یافت نشد',
        error: { status: 404 }
      });
    }
    
    // Check if phone number exists for another user
    db.get('SELECT * FROM users WHERE phone = ? AND id != ?', [phone, userId], (err, existingUser) => {
      if (err) {
        console.error(err);
        return res.status(500).render('error', { 
          message: 'خطا در ویرایش کاربر',
          error: { status: 500 }
        });
      }
      
      if (existingUser) {
        return res.render('user-form', {
          user: req.session.user,
          userData: { id: userId, ...req.body },
          error: 'این شماره تلفن قبلا ثبت شده است',
          isEdit: true
        });
      }
      
      // Update user
      if (password && password === confirmPassword) {
        // Update with new password
        bcrypt.hash(password, 10, (err, hash) => {
          if (err) {
            console.error(err);
            return res.status(500).render('error', { 
              message: 'خطا در ویرایش کاربر',
              error: { status: 500 }
            });
          }
          
          db.run(
            'UPDATE users SET name = ?, phone = ?, password = ?, isAdmin = ? WHERE id = ?',
            [name, phone, hash, isAdmin ? 1 : 0, userId],
            (err) => {
              if (err) {
                console.error(err);
                return res.status(500).render('error', { 
                  message: 'خطا در ویرایش کاربر',
                  error: { status: 500 }
                });
              }
              
              res.redirect('/users?success=updated');
            }
          );
        });
      } else if (!password) {
        // Update without changing password
        db.run(
          'UPDATE users SET name = ?, phone = ?, isAdmin = ? WHERE id = ?',
          [name, phone, isAdmin ? 1 : 0, userId],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).render('error', { 
                message: 'خطا در ویرایش کاربر',
                error: { status: 500 }
              });
            }
            
            res.redirect('/users?success=updated');
          }
        );
      } else {
        // Password and confirmation don't match
        return res.render('user-form', {
          user: req.session.user,
          userData: { id: userId, ...req.body },
          error: 'رمز عبور و تکرار آن باید یکسان باشند',
          isEdit: true
        });
      }
    });
  });
});

// Delete user
router.get('/delete/:id', (req, res) => {
  const userId = req.params.id;
  
  // Don't allow deleting yourself
  if (parseInt(userId) === req.session.user.id) {
    return res.status(400).render('error', { 
      message: 'شما نمی‌توانید حساب کاربری خود را حذف کنید',
      error: { status: 400 }
    });
  }
  
  // Check if user exists
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).render('error', { 
        message: 'خطا در حذف کاربر',
        error: { status: 500 }
      });
    }
    
    if (!user) {
      return res.status(404).render('error', { 
        message: 'کاربر مورد نظر یافت نشد',
        error: { status: 404 }
      });
    }
    
    // Delete user
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).render('error', { 
          message: 'خطا در حذف کاربر',
          error: { status: 500 }
        });
      }
      
      res.redirect('/users?success=deleted');
    });
  });
});

// View user logs
router.get('/logs/:id', (req, res) => {
  const userId = req.params.id;
  
  // Get user data
  db.get('SELECT id, name, phone FROM users WHERE id = ?', [userId], (err, userData) => {
    if (err || !userData) {
      console.error('Error getting user data for logs:', err);
      return res.status(404).render('error', { message: 'کاربر مورد نظر یافت نشد', error: { status: 404 } });
    }

    // Get login logs
    db.all('SELECT * FROM login_logs WHERE userId = ? ORDER BY loginAt DESC', [userId], (err, loginLogs) => {
      if (err) console.error('Error getting login logs for user:', err);

      // Get file operation logs
      db.all('SELECT * FROM file_operations WHERE userId = ? ORDER BY createdAt DESC', [userId], (err, fileOps) => {
        if (err) console.error('Error getting file operations for user:', err);

        res.render('user-logs', {
          user: req.session.user,
          userData,
          loginLogs: loginLogs || [],
          fileOps: fileOps || [],
          formatBytes
        });
      });
    });
  });
});

module.exports = router; 