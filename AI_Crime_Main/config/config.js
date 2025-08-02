require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/crime_analysis_db',
  
  // Authentication Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'crime-analysis-jwt-secret-2024',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  SESSION_SECRET: process.env.SESSION_SECRET || 'crime-analysis-session-secret-2024',
  
  // Google OAuth Configuration
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  
  // Security Configuration
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  
  // AI Analysis Configuration
  AI_PATTERN_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_PATTERN_CONFIDENCE_THRESHOLD) || 0.7,
  AI_HOTSPOT_RADIUS_KM: parseFloat(process.env.AI_HOTSPOT_RADIUS_KM) || 2.0,
  AI_TIME_WINDOW_DAYS: parseInt(process.env.AI_TIME_WINDOW_DAYS) || 30,
  
  // Pagination
  CASES_PER_PAGE: parseInt(process.env.CASES_PER_PAGE) || 20,
  INCIDENTS_PER_PAGE: parseInt(process.env.INCIDENTS_PER_PAGE) || 50,
  
  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 16 * 1024 * 1024, // 16MB
  UPLOAD_PATH: process.env.UPLOAD_PATH || './uploads',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  
  // Session Configuration
  SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
  
  // Development/Production specific settings
  isDevelopment: () => config.NODE_ENV === 'development',
  isProduction: () => config.NODE_ENV === 'production',
  isTesting: () => config.NODE_ENV === 'test'
};

module.exports = config;

