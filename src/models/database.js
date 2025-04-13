const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Create db directory if it doesn't exist
const dbDir = path.join(__dirname, '../../db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to database
const db = new sqlite3.Database(path.join(dbDir, 'filemanager.db'));

// Initialize database tables
function initDatabase() {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      isAdmin INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create login_logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      loginAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      ipAddress TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Create folders table
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      userId INTEGER NOT NULL,
      parentId INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (parentId) REFERENCES folders(id)
    )
  `);

  // Create files table
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      originalName TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mimeType TEXT NOT NULL,
      folderId INTEGER,
      userId INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folderId) REFERENCES folders(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Create file_operations table
  db.run(`
    CREATE TABLE IF NOT EXISTS file_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileId INTEGER,
      folderId INTEGER,
      userId INTEGER NOT NULL,
      operation TEXT NOT NULL,
      details TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fileId) REFERENCES files(id),
      FOREIGN KEY (folderId) REFERENCES folders(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Create default admin user if it doesn't exist
  createDefaultAdmin();
}

// Create default admin user
function createDefaultAdmin() {
  const adminUser = {
    name: 'Admin',
    phone: '09123456789',
    password: 'admin123',
    isAdmin: 1
  };

  db.get('SELECT * FROM users WHERE phone = ?', [adminUser.phone], (err, user) => {
    if (err) {
      console.error('Error checking for admin user:', err);
      return;
    }

    if (!user) {
      bcrypt.hash(adminUser.password, 10, (err, hash) => {
        if (err) {
          console.error('Error hashing password:', err);
          return;
        }

        db.run(
          'INSERT INTO users (name, phone, password, isAdmin) VALUES (?, ?, ?, ?)',
          [adminUser.name, adminUser.phone, hash, adminUser.isAdmin],
          function(err) {
            if (err) {
              console.error('Error creating admin user:', err);
              return;
            }
            console.log('Default admin user created with ID:', this.lastID);
          }
        );
      });
    }
  });
}

module.exports = {
  db,
  initDatabase
}; 