const express = require('express');
const session = require('express-session');
const SqliteStore = require('connect-sqlite3')(session);
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const profileRoutes = require('./routes/profile');

// Import database initialization
const db = require('./models/database');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure session
app.use(
  session({
    store: new SqliteStore({
      db: 'sessions.db',
      dir: './db'
    }),
    secret: 'file-manager-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
  })
);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize database
db.initDatabase();

// Routes
app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/users', userRoutes);
app.use('/profile', profileRoutes);

// Home route
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  res.redirect('/files');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 