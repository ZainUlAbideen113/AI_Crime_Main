const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/config');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check for JWT token in header
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  
  // For web requests, redirect to login
  if (req.accepts('html')) {
    return res.redirect('/auth/login');
  }
  
  // For API requests, return 401
  return res.status(401).json({ error: 'Authentication required' });
};

// Middleware to check if user is not authenticated (for login/register pages)
const isNotAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  
  // If already authenticated, redirect to dashboard
  return res.redirect('/dashboard');
};

// Middleware to check user role
const hasRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRoles = Array.isArray(roles) ? roles : [roles];
    
    if (userRoles.includes(req.user.role)) {
      return next();
    }
    
    // For web requests, render error page
    if (req.accepts('html')) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        error: {
          status: 403,
          message: 'You do not have permission to access this resource.'
        }
      });
    }
    
    // For API requests, return 403
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

// Middleware to check if user is admin
const isAdmin = hasRole('admin');

// Middleware to check if user is detective or admin
const isDetectiveOrAdmin = hasRole(['detective', 'admin']);

// Middleware to check if user owns the resource or is admin
const isOwnerOrAdmin = (getOwnerId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }
    
    try {
      const ownerId = await getOwnerId(req);
      
      if (req.user._id.toString() === ownerId.toString()) {
        return next();
      }
      
      return res.status(403).json({ error: 'Access denied' });
    } catch (error) {
      return res.status(500).json({ error: 'Error checking permissions' });
    }
  };
};

// Middleware to generate JWT token
const generateToken = (user) => {
  const payload = {
    _id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    badgeNumber: user.badgeNumber,
    department: user.department
  };
  
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN
  });
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded._id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token or user inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check API key (for external integrations)
const checkApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  // In a real application, you would validate the API key against a database
  // For now, we'll use a simple check
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Middleware to log authentication events
const logAuthEvent = (event, req, user = null) => {
  const logData = {
    event,
    timestamp: new Date(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: user ? {
      id: user._id,
      username: user.username,
      role: user.role
    } : null
  };
  
  console.log('Auth Event:', JSON.stringify(logData));
  
  // In a real application, you might want to store this in a separate audit log collection
};

// Middleware to handle session timeout
const checkSessionTimeout = (req, res, next) => {
  if (req.session && req.session.lastActivity) {
    const now = Date.now();
    const lastActivity = req.session.lastActivity;
    const sessionTimeout = config.SESSION_MAX_AGE;
    
    if (now - lastActivity > sessionTimeout) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });
      
      if (req.accepts('html')) {
        return res.redirect('/auth/login?timeout=true');
      }
      
      return res.status(401).json({ error: 'Session expired' });
    }
  }
  
  // Update last activity
  if (req.session) {
    req.session.lastActivity = Date.now();
  }
  
  next();
};

// Middleware to validate user account status
const validateUserStatus = async (req, res, next) => {
  if (req.user && req.user._id) {
    try {
      const user = await User.findById(req.user._id);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is inactive' });
      }
      
      // Update user object with latest data
      req.user = user;
      next();
    } catch (error) {
      return res.status(500).json({ error: 'Error validating user status' });
    }
  } else {
    next();
  }
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  hasRole,
  isAdmin,
  isDetectiveOrAdmin,
  isOwnerOrAdmin,
  generateToken,
  verifyToken,
  checkApiKey,
  logAuthEvent,
  checkSessionTimeout,
  validateUserStatus
};

