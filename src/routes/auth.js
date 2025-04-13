const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../models/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Login page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Register page
router.get('/register', isAuthenticated, isAdmin, (req, res) => {
  res.render('register', { error: null });
});

// Login process
router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  
  if (!phone || !password) {
    return res.render('login', { error: 'شماره تلفن و رمز عبور الزامی است' });
  }
  
  db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    
    if (!user) {
      return res.render('login', { error: 'شماره تلفن یا رمز عبور اشتباه است' });
    }
    
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Authentication error');
      }
      
      if (!result) {
        return res.render('login', { error: 'شماره تلفن یا رمز عبور اشتباه است' });
      }
      
      // Set user session
      req.session.user = {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isAdmin: user.isAdmin === 1
      };
      
      // Log login
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      db.run(
        'INSERT INTO login_logs (userId, ipAddress) VALUES (?, ?)',
        [user.id, ipAddress],
        (err) => {
          if (err) {
            console.error('Error logging login:', err);
          }
        }
      );
      
      res.redirect('/');
    });
  });
});

// Register process
router.post('/register', isAuthenticated, isAdmin, (req, res) => {
  const { name, phone, password, confirmPassword } = req.body;
  
  // Validate form data
  if (!name || !phone || !password) {
    return res.render('register', { error: 'تمام فیلدها الزامی هستند' });
  }
  
  if (password !== confirmPassword) {
    return res.render('register', { error: 'رمز عبور و تکرار آن باید یکسان باشند' });
  }
  
  // Check if user with phone number already exists
  db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, existingUser) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    
    if (existingUser) {
      return res.render('register', { error: 'این شماره تلفن قبلا ثبت شده است' });
    }
    
    // Hash the password
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Password hashing error');
      }
      
      // Create new user
      const isAdmin = req.session.user ? 0 : 1; // First user is admin
      
      db.run(
        'INSERT INTO users (name, phone, password, isAdmin) VALUES (?, ?, ?, ?)',
        [name, phone, hash, isAdmin],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).send('Error creating user');
          }
          
          if (!req.session.user) {
            // If no user is logged in, log in the new user
            req.session.user = {
              id: this.lastID,
              name,
              phone,
              isAdmin: isAdmin === 1
            };
            
            // Log login
            const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            db.run(
              'INSERT INTO login_logs (userId, ipAddress) VALUES (?, ?)',
              [this.lastID, ipAddress]
            );
          }
          
          res.redirect('/');
        }
      );
    });
  });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

module.exports = router; 