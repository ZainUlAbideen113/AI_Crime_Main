const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const { 
  generateToken, 
  isAuthenticated, 
  isNotAuthenticated, 
  logAuthEvent 
} = require('../middleware/auth');
const config = require('../config/config');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  body('badgeNumber')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('Badge number must be between 1 and 20 characters'),
  body('department')
    .isLength({ min: 1, max: 100 })
    .withMessage('Department is required and must be less than 100 characters')
];

const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// GET /auth/login - Show login page
router.get('/login', isNotAuthenticated, (req, res) => {
  const error = req.query.error;
  const timeout = req.query.timeout === 'true';
  
  res.render('auth/login', {
    title: 'Login - Crime Analysis Dashboard',
    error: error || (timeout ? 'Your session has expired. Please log in again.' : null),
    googleClientId: config.GOOGLE_CLIENT_ID
  });
});

// POST /auth/login - Handle login
router.post('/login', authLimiter, loginValidation, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', {
      title: 'Login - Crime Analysis Dashboard',
      error: errors.array()[0].msg,
      googleClientId: config.GOOGLE_CLIENT_ID
    });
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logAuthEvent('login_error', req, user);
      return next(err);
    }
    
    if (!user) {
      logAuthEvent('login_failed', req);
      return res.render('auth/login', {
        title: 'Login - Crime Analysis Dashboard',
        error: info.message || 'Invalid credentials',
        googleClientId: config.GOOGLE_CLIENT_ID
      });
    }
    
    req.logIn(user, (err) => {
      if (err) {
        logAuthEvent('login_error', req, user);
        return next(err);
      }
      
      logAuthEvent('login_success', req, user);
      
      // For API requests, return JWT token
      if (req.accepts('json') && !req.accepts('html')) {
        const token = generateToken(user);
        return res.json({
          success: true,
          token,
          user: user.getPublicProfile()
        });
      }
      
      // For web requests, redirect to dashboard
      const redirectTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      return res.redirect(redirectTo);
    });
  })(req, res, next);
});

// GET /auth/register - Show registration page
router.get('/register', isNotAuthenticated, (req, res) => {
  res.render('auth/register', {
    title: 'Register - Crime Analysis Dashboard',
    error: null,
    formData: {}
  });
});

// POST /auth/register - Handle registration
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/register', {
      title: 'Register - Crime Analysis Dashboard',
      error: errors.array()[0].msg,
      formData: req.body
    });
  }

  try {
    const { username, email, password, badgeNumber, department, role } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      return res.render('auth/register', {
        title: 'Register - Crime Analysis Dashboard',
        error: 'Username or email already exists',
        formData: req.body
      });
    }
    
    // Check if badge number already exists (if provided)
    if (badgeNumber) {
      const existingBadge = await User.findOne({ badgeNumber });
      if (existingBadge) {
        return res.render('auth/register', {
          title: 'Register - Crime Analysis Dashboard',
          error: 'Badge number already exists',
          formData: req.body
        });
      }
    }
    
    // Create new user
    const newUser = new User({
      username,
      email,
      passwordHash: password, // Will be hashed by pre-save middleware
      badgeNumber: badgeNumber || undefined,
      department,
      role: role || 'officer' // Default role
    });
    
    await newUser.save();
    
    logAuthEvent('user_registered', req, newUser);
    
    // Auto-login the user
    req.logIn(newUser, (err) => {
      if (err) {
        logAuthEvent('auto_login_error', req, newUser);
        return res.redirect('/auth/login?error=Registration successful, please log in');
      }
      
      logAuthEvent('auto_login_success', req, newUser);
      
      // For API requests, return JWT token
      if (req.accepts('json') && !req.accepts('html')) {
        const token = generateToken(newUser);
        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          token,
          user: newUser.getPublicProfile()
        });
      }
      
      // For web requests, redirect to dashboard
      return res.redirect('/dashboard');
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    logAuthEvent('registration_error', req);
    
    return res.render('auth/register', {
      title: 'Register - Crime Analysis Dashboard',
      error: 'An error occurred during registration. Please try again.',
      formData: req.body
    });
  }
});

// GET /auth/logout - Handle logout
router.get('/logout', isAuthenticated, (req, res) => {
  const user = req.user;
  
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      logAuthEvent('logout_error', req, user);
      return res.redirect('/dashboard');
    }
    
    logAuthEvent('logout_success', req, user);
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      
      // For API requests
      if (req.accepts('json') && !req.accepts('html')) {
        return res.json({ success: true, message: 'Logged out successfully' });
      }
      
      // For web requests
      return res.redirect('/auth/login');
    });
  });
});

// Google OAuth routes
if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  // GET /auth/google - Start Google OAuth
  router.get('/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );
  
  // GET /auth/google/callback - Handle Google OAuth callback
  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/auth/login?error=Google authentication failed' }),
    (req, res) => {
      logAuthEvent('google_login_success', req, req.user);
      
      // For API requests, return JWT token
      if (req.accepts('json') && !req.accepts('html')) {
        const token = generateToken(req.user);
        return res.json({
          success: true,
          token,
          user: req.user.getPublicProfile()
        });
      }
      
      // For web requests, redirect to dashboard
      const redirectTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      return res.redirect(redirectTo);
    }
  );
}

// GET /auth/profile - Get user profile
router.get('/profile', isAuthenticated, (req, res) => {
  if (req.accepts('json') && !req.accepts('html')) {
    return res.json({
      success: true,
      user: req.user.getPublicProfile()
    });
  }
  
  res.render('auth/profile', {
    title: 'Profile - Crime Analysis Dashboard',
    user: req.user
  });
});

// PUT /auth/profile - Update user profile
router.put('/profile', isAuthenticated, [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('badgeNumber')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('Badge number must be between 1 and 20 characters'),
  body('department')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Department must be less than 100 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const { email, badgeNumber, department } = req.body;
    const user = req.user;
    
    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
      user.email = email;
    }
    
    // Check if badge number is already taken by another user
    if (badgeNumber && badgeNumber !== user.badgeNumber) {
      const existingBadge = await User.findOne({ badgeNumber, _id: { $ne: user._id } });
      if (existingBadge) {
        return res.status(400).json({
          success: false,
          error: 'Badge number already exists'
        });
      }
      user.badgeNumber = badgeNumber;
    }
    
    if (department) {
      user.department = department;
    }
    
    await user.save();
    
    logAuthEvent('profile_updated', req, user);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    logAuthEvent('profile_update_error', req, req.user);
    
    res.status(500).json({
      success: false,
      error: 'An error occurred while updating profile'
    });
  }
});

// POST /auth/change-password - Change password
router.post('/change-password', isAuthenticated, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.passwordHash = newPassword; // Will be hashed by pre-save middleware
    await user.save();
    
    logAuthEvent('password_changed', req, user);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Password change error:', error);
    logAuthEvent('password_change_error', req, req.user);
    
    res.status(500).json({
      success: false,
      error: 'An error occurred while changing password'
    });
  }
});

// GET /auth/check - Check authentication status
router.get('/check', (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({
      authenticated: true,
      user: req.user.getPublicProfile()
    });
  }
  
  res.json({
    authenticated: false
  });
});

module.exports = router;

