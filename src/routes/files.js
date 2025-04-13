const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Configure storage for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../public/uploads', req.session.user.id.toString());
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Apply middleware to all routes
router.use(isAuthenticated);

// Get folders and files
router.get('/', (req, res) => {
  const folderId = req.query.folderId || null;
  const userId = req.session.user.id;
  
  let folderPath = [];
  let currentFolder = {};
  
  // Get current folder info
  const getCurrentFolder = (callback) => {
    if (!folderId) {
      return callback();
    }
    
    db.get(
      'SELECT * FROM folders WHERE id = ? AND userId = ?',
      [folderId, userId],
      (err, folder) => {
        if (err) {
          console.error('Error getting folder:', err);
          return callback(err);
        }
        
        if (!folder) {
          return callback(new Error('Folder not found'));
        }
        
        currentFolder = folder;
        callback();
      }
    );
  };
  
  // Get folder path
  const getFolderPath = (callback) => {
    if (!folderId) {
      return callback();
    }
    
    const getParentFolders = (id, path = []) => {
      db.get('SELECT * FROM folders WHERE id = ?', [id], (err, folder) => {
        if (err) {
          console.error('Error getting parent folder:', err);
          return callback(err);
        }
        
        if (!folder) {
          return callback(null, path.reverse());
        }
        
        path.push(folder);
        
        if (folder.parentId) {
          getParentFolders(folder.parentId, path);
        } else {
          callback(null, path.reverse());
        }
      });
    };
    
    getParentFolders(folderId);
  };
  
  // Get folders
  const getFolders = (callback) => {
    db.all(
      'SELECT * FROM folders WHERE userId = ? AND parentId IS ? ORDER BY name',
      [userId, folderId],
      (err, folders) => {
        if (err) {
          console.error('Error getting folders:', err);
          return callback(err);
        }
        
        callback(null, folders);
      }
    );
  };
  
  // Get files
  const getFiles = (callback) => {
    db.all(
      'SELECT * FROM files WHERE userId = ? AND folderId IS ? ORDER BY name',
      [userId, folderId],
      (err, files) => {
        if (err) {
          console.error('Error getting files:', err);
          return callback(err);
        }
        
        callback(null, files);
      }
    );
  };
  
  // Run all operations
  getCurrentFolder((err) => {
    if (err) {
      return res.status(404).render('error', { 
        message: 'پوشه مورد نظر یافت نشد',
        error: { status: 404 }
      });
    }
    
    getFolderPath((err, path) => {
      if (err) {
        console.error('Error getting folder path:', err);
        folderPath = [];
      } else {
        folderPath = path || [];
      }
      
      getFolders((err, folders) => {
        if (err) {
          return res.status(500).render('error', { 
            message: 'خطا در دریافت اطلاعات پوشه ها',
            error: { status: 500 }
          });
        }
        
        getFiles((err, files) => {
          if (err) {
            return res.status(500).render('error', { 
              message: 'خطا در دریافت اطلاعات فایل ها',
              error: { status: 500 }
            });
          }
          
          res.render('files', {
            user: req.session.user,
            currentFolder,
            folderPath,
            folders,
            files,
            parentId: folderId
          });
        });
      });
    });
  });
});

// Create folder
router.post('/folder', (req, res) => {
  const { name, parentId } = req.body;
  const userId = req.session.user.id;
  
  if (!name) {
    return res.status(400).send('نام پوشه الزامی است');
  }
  
  // Construct folder path
  let folderPath = '';
  
  const createFolder = () => {
    if (parentId) {
      db.get(
        'SELECT path FROM folders WHERE id = ?',
        [parentId],
        (err, folder) => {
          if (err) {
            console.error('Error getting parent folder:', err);
            return res.status(500).send('خطا در ایجاد پوشه');
          }
          
          if (!folder) {
            return res.status(404).send('پوشه والد یافت نشد');
          }
          
          folderPath = folder.path + '/' + name;
          insertFolder();
        }
      );
    } else {
      folderPath = `/${userId}/${name}`;
      insertFolder();
    }
  };
  
  const insertFolder = () => {
    db.run(
      'INSERT INTO folders (name, path, userId, parentId) VALUES (?, ?, ?, ?)',
      [name, folderPath, userId, parentId],
      function(err) {
        if (err) {
          console.error('Error creating folder:', err);
          return res.status(500).send('خطا در ایجاد پوشه');
        }
        
        // Log operation
        db.run(
          'INSERT INTO file_operations (userId, folderId, operation, details) VALUES (?, ?, ?, ?)',
          [userId, this.lastID, 'CREATE_FOLDER', JSON.stringify({ name, path: folderPath })]
        );
        
        res.redirect(parentId ? `/files?folderId=${parentId}` : '/files');
      }
    );
  };
  
  createFolder();
});

// Delete folder
router.get('/folder/delete/:id', (req, res) => {
  const folderId = req.params.id;
  const userId = req.session.user.id;
  
  // Check if folder exists and belongs to user
  db.get(
    'SELECT * FROM folders WHERE id = ? AND userId = ?',
    [folderId, userId],
    (err, folder) => {
      if (err) {
        console.error('Error getting folder:', err);
        return res.status(500).send('خطا در حذف پوشه');
      }
      
      if (!folder) {
        return res.status(404).send('پوشه مورد نظر یافت نشد');
      }
      
      // Check if folder has subfolders
      db.get(
        'SELECT COUNT(*) as count FROM folders WHERE parentId = ?',
        [folderId],
        (err, result) => {
          if (err) {
            console.error('Error checking subfolders:', err);
            return res.status(500).send('خطا در حذف پوشه');
          }
          
          if (result.count > 0) {
            return res.status(400).send('ابتدا باید زیرپوشه ها را حذف کنید');
          }
          
          // Get files in folder
          db.all(
            'SELECT * FROM files WHERE folderId = ?',
            [folderId],
            (err, files) => {
              if (err) {
                console.error('Error getting folder files:', err);
                return res.status(500).send('خطا در حذف پوشه');
              }
              
              // Delete files from storage
              files.forEach(file => {
                try {
                  fs.unlinkSync(path.join(__dirname, '../../public', file.path));
                } catch (err) {
                  console.error('Error deleting file from storage:', err);
                }
              });
              
              // Delete files from database
              db.run(
                'DELETE FROM files WHERE folderId = ?',
                [folderId],
                (err) => {
                  if (err) {
                    console.error('Error deleting folder files from database:', err);
                    return res.status(500).send('خطا در حذف پوشه');
                  }
                  
                  // Delete folder
                  db.run(
                    'DELETE FROM folders WHERE id = ?',
                    [folderId],
                    (err) => {
                      if (err) {
                        console.error('Error deleting folder:', err);
                        return res.status(500).send('خطا در حذف پوشه');
                      }
                      
                      // Log operation
                      db.run(
                        'INSERT INTO file_operations (userId, operation, details) VALUES (?, ?, ?)',
                        [userId, 'DELETE_FOLDER', JSON.stringify(folder)]
                      );
                      
                      res.redirect(`/files${folder.parentId ? `?folderId=${folder.parentId}` : ''}`);
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// Upload file
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('هیچ فایلی آپلود نشده است');
  }
  
  const userId = req.session.user.id;
  const folderId = req.body.folderId || null;
  
  // Save file information to database
  const filePath = `/uploads/${userId}/${req.file.filename}`;
  
  db.run(
    'INSERT INTO files (name, originalName, path, size, mimeType, folderId, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      req.file.filename,
      req.file.originalname,
      filePath,
      req.file.size,
      req.file.mimetype,
      folderId,
      userId
    ],
    function(err) {
      if (err) {
        console.error('Error saving file to database:', err);
        // Try to delete the uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Error deleting file after database error:', err);
        }
        return res.status(500).send('خطا در آپلود فایل');
      }
      
      // Log operation
      db.run(
        'INSERT INTO file_operations (userId, fileId, operation, details) VALUES (?, ?, ?, ?)',
        [
          userId,
          this.lastID,
          'UPLOAD_FILE',
          JSON.stringify({
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype
          })
        ]
      );
      
      res.redirect(`/files${folderId ? `?folderId=${folderId}` : ''}`);
    }
  );
});

// Delete file
router.get('/delete/:id', (req, res) => {
  const fileId = req.params.id;
  const userId = req.session.user.id;
  
  // Check if file exists and belongs to user
  db.get(
    'SELECT * FROM files WHERE id = ? AND userId = ?',
    [fileId, userId],
    (err, file) => {
      if (err) {
        console.error('Error getting file:', err);
        return res.status(500).send('خطا در حذف فایل');
      }
      
      if (!file) {
        return res.status(404).send('فایل مورد نظر یافت نشد');
      }
      
      // Delete file from storage
      try {
        fs.unlinkSync(path.join(__dirname, '../../public', file.path));
      } catch (err) {
        console.error('Error deleting file from storage:', err);
      }
      
      // Delete file from database
      db.run(
        'DELETE FROM files WHERE id = ?',
        [fileId],
        (err) => {
          if (err) {
            console.error('Error deleting file from database:', err);
            return res.status(500).send('خطا در حذف فایل');
          }
          
          // Log operation
          db.run(
            'INSERT INTO file_operations (userId, operation, details) VALUES (?, ?, ?)',
            [userId, 'DELETE_FILE', JSON.stringify(file)]
          );
          
          res.redirect(`/files${file.folderId ? `?folderId=${file.folderId}` : ''}`);
        }
      );
    }
  );
});

// Rename file
router.post('/rename/:id', (req, res) => {
  const fileId = req.params.id;
  const { newName } = req.body;
  const userId = req.session.user.id;
  
  if (!newName) {
    return res.status(400).send('نام جدید الزامی است');
  }
  
  // Check if file exists and belongs to user
  db.get(
    'SELECT * FROM files WHERE id = ? AND userId = ?',
    [fileId, userId],
    (err, file) => {
      if (err) {
        console.error('Error getting file:', err);
        return res.status(500).send('خطا در تغییر نام فایل');
      }
      
      if (!file) {
        return res.status(404).send('فایل مورد نظر یافت نشد');
      }
      
      // Update file
      db.run(
        'UPDATE files SET originalName = ? WHERE id = ?',
        [newName, fileId],
        (err) => {
          if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('خطا در تغییر نام فایل');
          }
          
          // Log operation
          db.run(
            'INSERT INTO file_operations (userId, fileId, operation, details) VALUES (?, ?, ?, ?)',
            [
              userId,
              fileId,
              'RENAME_FILE',
              JSON.stringify({
                oldName: file.originalName,
                newName
              })
            ]
          );
          
          res.redirect(`/files${file.folderId ? `?folderId=${file.folderId}` : ''}`);
        }
      );
    }
  );
});

module.exports = router; 