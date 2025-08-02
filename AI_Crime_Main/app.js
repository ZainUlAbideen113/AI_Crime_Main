const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const methodOverride = require('method-override');
const path = require('path');

// Import configuration
const config = require('./config/config');

// Import routes
const authRoutes = require('./routes/auth');
const caseRoutes = require('./routes/cases');
const incidentRoutes = require('./routes/incidents');
const analysisRoutes = require('./routes/analysis');
const dashboardRoutes = require('./routes/dashboard');

// Import passport configuration
require('./config/passport');

// Create Express app
const app = express();

// Trust proxy for deployment
app.set('trust proxy', 1);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Logging
if (config.isDevelopment()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Method override for PUT and DELETE requests
app.use(methodOverride('_method'));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`=== ALL REQUESTS ===`);
  console.log(`${req.method} ${req.path}`);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  console.log('=====================');
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
mongoose.connect(config.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Session configuration
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: config.MONGODB_URI,
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: {
    secure: config.isProduction(), // HTTPS only in production
    httpOnly: true,
    maxAge: config.SESSION_MAX_AGE
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Global middleware to pass user to all views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
});

// Home route
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('index', {
    title: 'Crime Analysis Dashboard',
    user: req.user
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/cases', caseRoutes);
app.use('/incidents', incidentRoutes);
app.use('/analysis', analysisRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    user: req.user,
    error: 'The page you are looking for does not exist.'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  // Don't leak error details in production
  const isDev = config.isDevelopment();
  
  res.status(error.status || 500).render('error', {
    title: 'Error',
    user: req.user,
    error: isDev ? error.message : 'Something went wrong!'
  });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Crime Analysis Dashboard running on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Database: ${config.MONGODB_URI}`);
});

module.exports = app;

