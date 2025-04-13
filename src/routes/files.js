const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');
const { formatBytes } = require('../utils/helpers');

const router = express.Router();

// Configure storage for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine target user for path construction
    let uploadUserId = req.session.user.id;
    if (req.session.user.isAdmin && req.body.userId) {
      const parsedUserId = parseInt(req.body.userId, 10);
      if (!isNaN(parsedUserId)) {
        uploadUserId = parsedUserId;
      }
    }
    const uploadPath = path.join(__dirname, '../../public/uploads', uploadUserId.toString());
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
  const loggedInUser = req.session.user;
  const targetUserIdQuery = req.query.userId;
  let isAdminView = loggedInUser.isAdmin;
  let viewingUserId = loggedInUser.id;
  let selectedUser = null;

  if (isAdminView) {
    if (targetUserIdQuery) {
      // Admin is viewing a specific user's files
      viewingUserId = parseInt(targetUserIdQuery, 10);
      if (isNaN(viewingUserId)) {
        return res.status(400).render('error', { message: 'شناسه کاربر نامعتبر است', error: { status: 400 } });
      }
      // Fetch the selected user's info for display
      db.get('SELECT id, name, phone FROM users WHERE id = ?', [viewingUserId], (err, user) => {
        if (err || !user) {
          console.error('Error getting selected user:', err);
          return res.status(404).render('error', { message: 'کاربر مورد نظر یافت نشد', error: { status: 404 } });
        }
        selectedUser = user;
        fetchFilesAndFolders(); // Proceed to fetch files for this user
      });
    } else {
      // Admin's initial view: Show user list
      db.all('SELECT id, name, phone FROM users ORDER BY name', (err, users) => {
        if (err) {
          console.error('Error getting user list:', err);
          return res.status(500).render('error', { message: 'خطا در دریافت لیست کاربران', error: { status: 500 } });
        }
        res.render('files', {
          user: loggedInUser,
          isAdminView: true,
          users: users, // Pass user list
          selectedUser: null,
          folderPath: [],
          folders: [],
          files: [],
          parentId: null,
          currentFolder: {},
          formatBytes
        });
      });
      // Return here to prevent executing fetchFilesAndFolders for the admin's initial view
      return; 
    }
  } else {
    // Regular user view: Fetch their own files
    fetchFilesAndFolders();
  }

  // Function to fetch files and folders for the 'viewingUserId'
  function fetchFilesAndFolders() {
    const folderId = req.query.folderId || null;
    let folderPath = [];
    let currentFolder = {};

    // Get current folder info (using viewingUserId)
    const getCurrentFolder = (callback) => {
      if (!folderId) return callback();
      db.get(
        'SELECT * FROM folders WHERE id = ? AND userId = ?',
        [folderId, viewingUserId],
        (err, folder) => {
          if (err) return callback(err);
          if (!folder) return callback(new Error('Folder not found'));
          currentFolder = folder;
          callback();
        }
      );
    };

    // Get folder path (adjusted to use viewingUserId for permission check if needed, though path itself is hierarchy based)
    const getFolderPath = (callback) => {
      if (!folderId) return callback();
      const pathList = [];
      const getParent = (id) => {
        db.get('SELECT * FROM folders WHERE id = ?', [id], (err, folder) => {
          if (err || !folder) return callback(err); // Error or folder disappeared
          // Security check: Ensure folder belongs to the user being viewed (important if folder IDs could be guessed)
          if (folder.userId !== viewingUserId && folder.parentId) { // Don't check root folders if parentId is null
            return callback(new Error('Permission Denied'));
          }
          pathList.push(folder);
          if (folder.parentId) {
            getParent(folder.parentId);
          } else {
            callback(null, pathList.reverse());
          }
        });
      };
      getParent(folderId);
    };

    // Get folders (using viewingUserId)
    const getFolders = (callback) => {
      db.all(
        'SELECT * FROM folders WHERE userId = ? AND parentId IS ? ORDER BY name',
        [viewingUserId, folderId],
        (err, folders) => callback(err, folders)
      );
    };

    // Get files (using viewingUserId)
    const getFiles = (callback) => {
      db.all(
        'SELECT * FROM files WHERE userId = ? AND folderId IS ? ORDER BY name',
        [viewingUserId, folderId],
        (err, files) => callback(err, files)
      );
    };

    // Run all operations
    getCurrentFolder((err) => {
      if (err) return res.status(404).render('error', { message: 'پوشه مورد نظر یافت نشد یا به آن دسترسی ندارید', error: { status: 404 } });
      
      getFolderPath((err, path) => {
        if (err) return res.status(500).render('error', { message: 'خطا در پردازش مسیر پوشه', error: { status: 500 } });
        folderPath = path || [];

        getFolders((err, folders) => {
          if (err) return res.status(500).render('error', { message: 'خطا در دریافت اطلاعات پوشه ها', error: { status: 500 } });

          getFiles((err, files) => {
            if (err) return res.status(500).render('error', { message: 'خطا در دریافت اطلاعات فایل ها', error: { status: 500 } });
            
            res.render('files', {
              user: loggedInUser, // The logged-in user (admin or regular)
              isAdminView, // Is the admin interface active?
              selectedUser, // Which user's files are being viewed (null if admin initial view or regular user)
              currentFolder,
              folderPath,
              folders,
              files,
              parentId: folderId,
              formatBytes
            });
          });
        });
      });
    });
  }
});

// Create folder
router.post('/folder', (req, res) => {
  const { name, parentId } = req.body;
  const loggedInUser = req.session.user;
  
  // Determine the target user ID
  let targetUserId = loggedInUser.id;
  if (loggedInUser.isAdmin && req.body.userId) {
    const parsedUserId = parseInt(req.body.userId, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      console.warn('Admin submitted create folder with invalid userId:', req.body.userId);
      // Optionally return an error, or default to admin's own ID
    }
  }
  
  if (!name) {
    return res.status(400).send('نام پوشه الزامی است');
  }
  
  // Construct folder path
  let folderPath = '';
  
  const createFolder = () => {
    // Get parent folder path (if applicable) using targetUserId for validation
    if (parentId) {
      db.get(
        'SELECT path FROM folders WHERE id = ? AND userId = ?', // Ensure parent belongs to target user
        [parentId, targetUserId],
        (err, folder) => {
          if (err) {
            console.error('Error getting parent folder:', err);
            return res.status(500).send('خطا در ایجاد پوشه');
          }
          if (!folder) {
            return res.status(404).send('پوشه والد یافت نشد یا به کاربر تعلق ندارد');
          }
          folderPath = folder.path + '/' + name;
          insertFolder();
        }
      );
    } else {
      folderPath = `/${targetUserId}/${name}`; // Path based on target user
      insertFolder();
    }
  };
  
  const insertFolder = () => {
    db.run(
      'INSERT INTO folders (name, path, userId, parentId) VALUES (?, ?, ?, ?)',
      [name, folderPath, targetUserId, parentId || null], // Use targetUserId
      function(err) {
        if (err) {
          console.error('Error creating folder:', err);
          return res.status(500).send('خطا در ایجاد پوشه'); 
        }
        
        // Log operation (using admin's ID as the actor)
        db.run(
          'INSERT INTO file_operations (userId, folderId, operation, details) VALUES (?, ?, ?, ?)',
          [loggedInUser.id, this.lastID, 'CREATE_FOLDER', JSON.stringify({ name, path: folderPath, targetUserId })]
        );
        
        // Redirect back to the correct user's view
        const redirectUrl = targetUserId === loggedInUser.id ? 
                            (parentId ? `/files?folderId=${parentId}` : '/files') :
                            `/files?userId=${targetUserId}${parentId ? '&folderId=' + parentId : ''}`;
        res.redirect(redirectUrl);
      }
    );
  };
  
  createFolder();
});

// Delete folder
router.get('/folder/delete/:id', (req, res) => {
  const folderId = req.params.id;
  const loggedInUser = req.session.user;

  // Determine the target user ID from query param if admin
  let targetUserId = loggedInUser.id;
  if (loggedInUser.isAdmin && req.query.userId) {
    const parsedUserId = parseInt(req.query.userId, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      return res.status(400).send('شناسه کاربر نامعتبر در درخواست حذف پوشه');
    }
  }
  
  // Check if folder exists and belongs to the target user
  db.get(
    'SELECT * FROM folders WHERE id = ? AND userId = ?',
    [folderId, targetUserId],
    (err, folder) => {
      if (err) {
        console.error('Error getting folder:', err);
        return res.status(500).send('خطا در حذف پوشه');
      }
      if (!folder) {
        return res.status(404).send('پوشه مورد نظر یافت نشد یا به کاربر تعلق ندارد');
      }
      
      // Check if folder has subfolders (belonging to the target user)
      db.get(
        'SELECT COUNT(*) as count FROM folders WHERE parentId = ? AND userId = ?', 
        [folderId, targetUserId],
        (err, result) => {
          if (err) {
            console.error('Error checking subfolders:', err);
            return res.status(500).send('خطا در حذف پوشه');
          }
          if (result.count > 0) {
            // Redirect back with error message
            const redirectUrl = targetUserId === loggedInUser.id ? 
                                (folder.parentId ? `/files?folderId=${folder.parentId}` : '/files') :
                                `/files?userId=${targetUserId}${folder.parentId ? '&folderId=' + folder.parentId : ''}`;
            // TODO: Pass an error message via query param or flash message for better UX
            console.warn(`Attempt to delete non-empty folder ${folderId} by admin ${loggedInUser.id} for user ${targetUserId}`);
            return res.status(400).redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=folderNotEmpty'); 
          }
          
          // Get files in folder (belonging to the target user)
          db.all(
            'SELECT * FROM files WHERE folderId = ? AND userId = ?',
            [folderId, targetUserId],
            (err, files) => {
              if (err) {
                console.error('Error getting folder files:', err);
                return res.status(500).send('خطا در حذف پوشه');
              }
              
              // Delete files from storage
              files.forEach(file => {
                try {
                  // Construct path relative to the project root, assuming 'public' is at the root
                  const filePath = path.join(__dirname, '../../public', file.path);
                  if (fs.existsSync(filePath)) {
                      fs.unlinkSync(filePath);
                  } else {
                      console.warn(`File not found for deletion: ${filePath}`);
                  }
                } catch (unlinkErr) {
                  console.error('Error deleting file from storage:', unlinkErr);
                  // Decide if you want to stop the whole process or just log the error
                }
              });
              
              // Delete files from database (belonging to the target user)
              db.run(
                'DELETE FROM files WHERE folderId = ? AND userId = ?',
                [folderId, targetUserId],
                (err) => {
                  if (err) {
                    console.error('Error deleting folder files from database:', err);
                    return res.status(500).send('خطا در حذف پوشه');
                  }
                  
                  // Delete folder from database (belonging to the target user)
                  db.run(
                    'DELETE FROM folders WHERE id = ? AND userId = ?',
                    [folderId, targetUserId],
                    (err) => {
                      if (err) {
                        console.error('Error deleting folder:', err);
                        return res.status(500).send('خطا در حذف پوشه');
                      }
                      
                      // Log operation (using admin's ID as the actor)
                      db.run(
                        'INSERT INTO file_operations (userId, operation, details) VALUES (?, ?, ?)',
                        [loggedInUser.id, 'DELETE_FOLDER', JSON.stringify({ ...folder, targetUserId })] // Log admin action and target user
                      );
                      
                      // Redirect back to the correct user's view
                      const redirectUrl = targetUserId === loggedInUser.id ? 
                                          (folder.parentId ? `/files?folderId=${folder.parentId}` : '/files') :
                                          `/files?userId=${targetUserId}${folder.parentId ? '&folderId=' + folder.parentId : ''}`;
                      res.redirect(redirectUrl);
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
  
  const loggedInUser = req.session.user;
  const folderId = req.body.folderId || null;
  
  // Determine the target user ID
  let targetUserId = loggedInUser.id;
  if (loggedInUser.isAdmin && req.body.userId) {
    const parsedUserId = parseInt(req.body.userId, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      console.warn('Admin submitted upload with invalid userId:', req.body.userId);
    }
  }

  // Validate folderId if provided (ensure it belongs to targetUser)
  const validateFolderAndInsert = () => {
    if (folderId) {
      db.get('SELECT id FROM folders WHERE id = ? AND userId = ?', [folderId, targetUserId], (err, folder) => {
        if (err || !folder) {
          console.error('Invalid folderId provided for upload:', folderId, 'for user', targetUserId, 'Error:', err);
          // Delete the physically uploaded file as the DB entry will fail
          try { fs.unlinkSync(req.file.path); } catch (e) { console.error('Failed to delete orphaned upload:', e); }
          return res.status(400).send('پوشه مقصد نامعتبر است یا به کاربر تعلق ندارد');
        }
        insertFileRecord(); // Folder is valid, proceed
      });
    } else {
      insertFileRecord(); // Uploading to root, no folder validation needed
    }
  };
  
  const insertFileRecord = () => {
    // Save file information to database
    // Path needs to be relative to the 'public' directory and use targetUserId
    const relativePath = `/uploads/${targetUserId}/${req.file.filename}`;
    
    db.run(
      'INSERT INTO files (name, originalName, path, size, mimeType, folderId, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req.file.filename,
        req.file.originalname,
        relativePath, // Use relative path
        req.file.size,
        req.file.mimetype,
        folderId, // This is already null if not provided
        targetUserId // Use targetUserId
      ],
      function(err) {
        if (err) {
          console.error('Error saving file to database:', err);
          // Try to delete the uploaded file as DB entry failed
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkErr) {
            console.error('Error deleting file after database error:', unlinkErr);
          }
          return res.status(500).send('خطا در آپلود فایل');
        }
        
        // Log operation (using admin's ID as the actor)
        db.run(
          'INSERT INTO file_operations (userId, fileId, operation, details) VALUES (?, ?, ?, ?)',
          [
            loggedInUser.id,
            this.lastID,
            'UPLOAD_FILE',
            JSON.stringify({
              name: req.file.originalname,
              size: req.file.size,
              type: req.file.mimetype,
              targetUserId
            })
          ]
        );
        
        // Redirect back to the correct user's view
        const redirectUrl = targetUserId === loggedInUser.id ? 
                            (folderId ? `/files?folderId=${folderId}` : '/files') :
                            `/files?userId=${targetUserId}${folderId ? '&folderId=' + folderId : ''}`;
        res.redirect(redirectUrl);
      }
    );
  };
  
  validateFolderAndInsert(); // Start the process
});

// Delete file
router.get('/delete/:id', (req, res) => {
  const fileId = req.params.id;
  const loggedInUser = req.session.user;

  // Determine the target user ID from query param if admin
  let targetUserId = loggedInUser.id;
  if (loggedInUser.isAdmin && req.query.userId) {
    const parsedUserId = parseInt(req.query.userId, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      return res.status(400).send('شناسه کاربر نامعتبر در درخواست حذف فایل');
    }
  }
  
  // Check if file exists and belongs to the target user
  db.get(
    'SELECT * FROM files WHERE id = ? AND userId = ?',
    [fileId, targetUserId],
    (err, file) => {
      if (err) {
        console.error('Error getting file:', err);
        return res.status(500).send('خطا در حذف فایل');
      }
      if (!file) {
        return res.status(404).send('فایل مورد نظر یافت نشد یا به کاربر تعلق ندارد');
      }
      
      // Delete file from storage
      try {
        const filePath = path.join(__dirname, '../../public', file.path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        } else {
            console.warn(`File not found for deletion: ${filePath}`);
        }
      } catch (unlinkErr) {
        console.error('Error deleting file from storage:', unlinkErr);
        // Consider if this should prevent DB deletion
      }
      
      // Delete file from database (belonging to the target user)
      db.run(
        'DELETE FROM files WHERE id = ? AND userId = ?',
        [fileId, targetUserId],
        (err) => {
          if (err) {
            console.error('Error deleting file from database:', err);
            return res.status(500).send('خطا در حذف فایل');
          }
          
          // Log operation (using admin's ID as the actor)
          db.run(
            'INSERT INTO file_operations (userId, operation, details) VALUES (?, ?, ?)',
            [loggedInUser.id, 'DELETE_FILE', JSON.stringify({ ...file, targetUserId })]
          );
          
          // Redirect back to the correct user's view
          const redirectUrl = targetUserId === loggedInUser.id ? 
                              (file.folderId ? `/files?folderId=${file.folderId}` : '/files') :
                              `/files?userId=${targetUserId}${file.folderId ? '&folderId=' + file.folderId : ''}`;
          res.redirect(redirectUrl);
        }
      );
    }
  );
});

// Rename file
router.post('/rename/:id', (req, res) => {
  const fileId = req.params.id;
  const { newName } = req.body;
  const loggedInUser = req.session.user;

  // Determine the target user ID from query param or body if admin
  let targetUserId = loggedInUser.id;
  const userIdSource = req.query.userId || req.body.userId;
  if (loggedInUser.isAdmin && userIdSource) {
    const parsedUserId = parseInt(userIdSource, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      return res.status(400).send('شناسه کاربر نامعتبر در درخواست تغییر نام فایل');
    }
  }
  
  if (!newName) {
    return res.status(400).send('نام جدید فایل الزامی است');
  }

  // Check if file exists and belongs to the target user
  db.get(
    'SELECT * FROM files WHERE id = ? AND userId = ?',
    [fileId, targetUserId],
    (err, file) => {
      if (err) {
        console.error('Error getting file for rename:', err);
        return res.status(500).send('خطا در تغییر نام فایل');
      }
      if (!file) {
        return res.status(404).send('فایل مورد نظر یافت نشد یا به کاربر تعلق ندارد');
      }

      // Keep the original extension
      const oldExt = path.extname(file.originalName);
      const newOriginalName = newName.endsWith(oldExt) ? newName : newName + oldExt;

      // Update the database (only originalName)
      db.run(
        'UPDATE files SET originalName = ? WHERE id = ? AND userId = ?',
        [newOriginalName, fileId, targetUserId],
        (err) => {
          if (err) {
            console.error('Error renaming file in database:', err);
            return res.status(500).send('خطا در تغییر نام فایل');
          }

          // Log operation (using admin's ID as the actor)
          db.run(
            'INSERT INTO file_operations (userId, fileId, operation, details) VALUES (?, ?, ?, ?)',
            [
              loggedInUser.id,
              fileId,
              'RENAME_FILE',
              JSON.stringify({ oldName: file.originalName, newName: newOriginalName, targetUserId })
            ]
          );

          // Redirect back to the correct user's view
          const redirectUrl = targetUserId === loggedInUser.id ? 
                              (file.folderId ? `/files?folderId=${file.folderId}` : '/files') :
                              `/files?userId=${targetUserId}${file.folderId ? '&folderId=' + file.folderId : ''}`;
          res.redirect(redirectUrl);
        }
      );
    }
  );
});

// Rename folder
router.post('/folder/rename/:id', (req, res) => {
  const folderId = parseInt(req.params.id, 10);
  const { newFolderName } = req.body;
  const loggedInUser = req.session.user;

  // Determine the target user ID
  let targetUserId = loggedInUser.id;
  const userIdSource = req.query.userId || req.body.userId;
  if (loggedInUser.isAdmin && userIdSource) {
    const parsedUserId = parseInt(userIdSource, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      return res.status(400).send('شناسه کاربر نامعتبر در درخواست تغییر نام پوشه');
    }
  }

  if (!newFolderName || isNaN(folderId)) {
    return res.status(400).send('درخواست نامعتبر است');
  }

  db.serialize(() => {
    db.get(
      'SELECT * FROM folders WHERE id = ? AND userId = ?',
      [folderId, targetUserId],
      (err, folderToRename) => {
        if (err) {
          console.error('Error finding folder to rename:', err);
          return res.status(500).send('خطا در تغییر نام پوشه');
        }
        if (!folderToRename) {
          return res.status(404).send('پوشه مورد نظر یافت نشد یا به کاربر تعلق ندارد');
        }

        const oldName = folderToRename.name;
        const oldPath = folderToRename.path;
        // Construct new path based on parent
        const pathSegments = oldPath.split('/');
        pathSegments.pop(); // Remove old name
        pathSegments.push(newFolderName); // Add new name
        const newPath = pathSegments.join('/');

        // Start transaction
        db.run('BEGIN TRANSACTION;');

        // 1. Update the target folder's name and path
        db.run(
          'UPDATE folders SET name = ?, path = ? WHERE id = ?',
          [newFolderName, newPath, folderId],
          function(err) {
            if (err) {
              console.error('Error renaming target folder:', err);
              db.run('ROLLBACK;');
              return res.status(500).send('خطا در به‌روزرسانی نام پوشه');
            }

            // 2. Update paths of all descendants
            // Use SQLite's replace function for simplicity. 
            // WARNING: This assumes folder names don't contain patterns that could conflict.
            // A more robust solution might involve fetching all descendants and updating them individually.
            const oldPathPrefix = oldPath + '/';
            const newPathPrefix = newPath + '/';
            db.run(
              "UPDATE folders SET path = replace(path, ?, ?) WHERE path LIKE ? AND userId = ?",
              [oldPathPrefix, newPathPrefix, oldPathPrefix + '%', targetUserId],
              function(err) {
                if (err) {
                  console.error('Error updating descendant folder paths:', err);
                  db.run('ROLLBACK;');
                  return res.status(500).send('خطا در به‌روزرسانی مسیر زیرپوشه‌ها');
                }

                // Commit transaction
                db.run('COMMIT;', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    // Rollback might have already happened or might fail, but try anyway
                    db.run('ROLLBACK;'); 
                    return res.status(500).send('خطای پایگاه داده هنگام ذخیره تغییرات');
                  }

                  // Log operation
                  db.run(
                    'INSERT INTO file_operations (userId, folderId, operation, details) VALUES (?, ?, ?, ?)',
                    [
                      loggedInUser.id,
                      folderId,
                      'RENAME_FOLDER',
                      JSON.stringify({ oldName, newName: newFolderName, oldPath, newPath, targetUserId })
                    ]
                  );

                  // Redirect back to the parent folder view
                  const redirectUrl = targetUserId === loggedInUser.id ? 
                                      (folderToRename.parentId ? `/files?folderId=${folderToRename.parentId}` : '/files') :
                                      `/files?userId=${targetUserId}${folderToRename.parentId ? '&folderId=' + folderToRename.parentId : ''}`;
                  res.redirect(redirectUrl);
                }); // End COMMIT callback
              } // End descendant UPDATE callback
            ); // End descendant UPDATE run
          } // End target UPDATE callback
        ); // End target UPDATE run
      } // End GET folder callback
    ); // End GET folder run
  }); // End serialize
});

// Download file
router.get('/download/:id', (req, res) => {
  const fileId = req.params.id;
  const loggedInUser = req.session.user;

  // Determine the target user ID from query param if admin
  let targetUserId = loggedInUser.id;
  if (loggedInUser.isAdmin && req.query.userId) {
    const parsedUserId = parseInt(req.query.userId, 10);
    if (!isNaN(parsedUserId)) {
      targetUserId = parsedUserId;
    } else {
      return res.status(400).send('شناسه کاربر نامعتبر در درخواست دانلود');
    }
  }

  // Get file information
  db.get(
    'SELECT * FROM files WHERE id = ? AND userId = ?',
    [fileId, targetUserId],
    (err, file) => {
      if (err) {
        console.error('Error getting file for download:', err);
        return res.status(500).send('خطا در دانلود فایل');
      }
      if (!file) {
        return res.status(404).send('فایل مورد نظر یافت نشد یا به کاربر تعلق ندارد');
      }

      // Construct the absolute path to the file on the server
      // Assuming file.path is like '/uploads/USER_ID/filename.ext'
      const absoluteFilePath = path.join(__dirname, '../../public', file.path);

      // Check if file exists physically
      if (!fs.existsSync(absoluteFilePath)) {
        console.error(`File not found at path for download: ${absoluteFilePath}`);
        return res.status(404).send('فایل روی سرور یافت نشد. ممکن است حذف شده باشد.');
      }

      // Use res.download to send the file
      // It sets Content-Disposition header for download prompt
      // The third argument sets the filename the user will see
      res.download(absoluteFilePath, file.originalName, (downloadErr) => {
        if (downloadErr) {
          // Handle errors that occur after headers may have been sent
          // For example, if the connection is lost mid-download
          console.error('Error during file download transmission:', downloadErr);
          // Cannot send new headers if some were already sent
          if (!res.headersSent) {
            res.status(500).send('خطایی هنگام ارسال فایل رخ داد.');
          }
        }
        // Optionally log the download operation here if needed
        // db.run('INSERT INTO file_operations...')
      });
    }
  );
});

module.exports = router; 