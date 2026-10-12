/**
 * Authentication and Role-Based Authorization Middleware
 */
const { query } = require('../config/db');

// Ensure user is authenticated via session
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in to access this resource.',
      code: 'UNAUTHENTICATED'
    });
  }

  if (req.session.user.status === 'suspended') {
    req.session.destroy();
    return res.status(403).json({
      success: false,
      error: 'Your account has been suspended by an administrator. Please contact support.',
      code: 'ACCOUNT_SUSPENDED'
    });
  }

  next();
}

// Ensure user is an authorized administrator
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Administrator login is required.',
      code: 'UNAUTHENTICATED'
    });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have administrator permissions.',
      code: 'FORBIDDEN'
    });
  }

  if (req.session.user.status === 'suspended') {
    req.session.destroy();
    return res.status(403).json({
      success: false,
      error: 'Administrator account suspended.',
      code: 'ACCOUNT_SUSPENDED'
    });
  }

  next();
}

// Optional Auth (for public endpoints where logged-in users have extra context like favourites)
function optionalAuth(req, res, next) {
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  optionalAuth
};
