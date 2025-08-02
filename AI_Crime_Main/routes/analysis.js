const express = require('express');
const router = express.Router();
const Case = require('../models/Case');
const Incident = require('../models/Incident');
const CrimePattern = require('../models/CrimePattern');
const { isAuthenticated } = require('../middleware/auth');

// GET /analysis - Analysis dashboard
router.get('/', isAuthenticated, async (req, res) => {
  try {
    console.log('=== ANALYSIS DASHBOARD ===');
    
    // Get recent patterns
    const recentPatterns = await CrimePattern.find()
      .sort({ createdAt: -1 })
      .limit(5);

    // Get analysis statistics
    const stats = {
      totalCases: await Case.countDocuments(),
      totalIncidents: await Incident.countDocuments(),
      activeCases: await Case.countDocuments({ status: 'open' }),
      highPriorityCases: await Case.countDocuments({ priority: { $gte: 8 } }),
      patternsFound: await CrimePattern.countDocuments(),
      hotspots: await CrimePattern.countDocuments({
        $or: [
          { patternType: 'spatial' },
          { locationCluster: { $exists: true } },
          { tags: 'hotspot' }
        ]
      })
    };

    console.log('Dashboard stats:', stats);

    res.render('analysis/index', {
      title: 'Crime Analysis - Crime Analysis Dashboard',
      user: req.user,
      recentPatterns,
      stats
    });
  } catch (error) {
    console.error('Error loading analysis dashboard:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load analysis dashboard'
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  console.log('=== TEST ENDPOINT HIT ===');
  res.json({ success: true, message: 'Test endpoint working' });
});

// POST /analysis/run - Run AI analysis
router.post('/run', isAuthenticated, async (req, res) => {
  try {
    console.log('=== ANALYSIS RUN ENDPOINT HIT ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Body:', req.body);
    console.log('User:', req.user ? req.user.username : 'No user');
    
    const { analysisType, timeRange, location, crimeTypes, minConfidence } = req.body;
    
    console.log('Analysis parameters:', {
      analysisType,
      timeRange,
      location,
      crimeTypes,
      minConfidence
    });
    
    // Simple test response
    res.json({
      success: true,
      message: 'Analysis endpoint working',
      patterns: [],
      savedCount: 0,
      analysisTime: '0ms'
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during analysis',
      details: error.message
    });
  }
});

// GET /analysis/patterns - View all patterns
router.get('/patterns', isAuthenticated, async (req, res) => {
  try {
    const patterns = await CrimePattern.find().sort({ createdAt: -1 });
    res.render('analysis/patterns', {
      title: 'Crime Patterns',
      user: req.user,
      patterns
    });
  } catch (error) {
    console.error('Error loading patterns:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load patterns'
    });
  }
});

// GET /analysis/hotspots - View hotspots
router.get('/hotspots', isAuthenticated, async (req, res) => {
  try {
    const hotspots = await CrimePattern.find({
      $or: [
        { patternType: 'spatial' },
        { locationCluster: { $exists: true } },
        { tags: 'hotspot' }
      ]
    }).sort({ createdAt: -1 });
    
    res.render('analysis/hotspots', {
      title: 'Crime Hotspots',
      user: req.user,
      hotspots
    });
  } catch (error) {
    console.error('Error loading hotspots:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load hotspots'
    });
  }
});

// GET /analysis/patterns/:id - View specific pattern
router.get('/patterns/:id', isAuthenticated, async (req, res) => {
  try {
    const pattern = await CrimePattern.findById(req.params.id)
      .populate('relatedIncidents');
    
    if (!pattern) {
      return res.status(404).render('error', {
        title: 'Pattern Not Found',
        user: req.user,
        error: 'Pattern not found'
      });
    }
    
    res.render('analysis/pattern-detail', {
      title: `Pattern: ${pattern.patternName}`,
      user: req.user,
      pattern
    });
  } catch (error) {
    console.error('Error loading pattern detail:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load pattern details'
    });
  }
});

module.exports = router;
