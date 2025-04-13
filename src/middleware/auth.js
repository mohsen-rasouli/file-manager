// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).render('error', { 
      message: 'شما دسترسی به این بخش را ندارید',
      error: { status: 403 }
    });
  }
  next();
};

module.exports = {
  isAuthenticated,
  isAdmin
}; 