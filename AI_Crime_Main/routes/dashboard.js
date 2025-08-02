const express = require('express');
const router = express.Router();
const Case = require('../models/Case');
const Incident = require('../models/Incident');
const CrimePattern = require('../models/CrimePattern');
const { isAuthenticated } = require('../middleware/auth');

// GET /dashboard - Main dashboard
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get dashboard statistics
    const stats = await getDashboardStats();
    
    // Get recent activity
    const recentCases = await Case.find()
      .populate('assignedOfficer', 'username')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentIncidents = await Incident.find()
      .populate('reportedBy', 'username')
      .sort({ dateTime: -1 })
      .limit(5);

    const recentPatterns = await CrimePattern.find()
      .sort({ createdAt: -1 })
      .limit(3);

    // Get chart data for the last 30 days
    const chartData = await getChartData();

    res.render('dashboard/index', {
      title: 'Dashboard - Crime Analysis System',
      user: req.user,
      stats,
      recentCases,
      recentIncidents,
      recentPatterns,
      chartData
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load dashboard'
    });
  }
});

// GET /dashboard/stats - Get dashboard statistics (API)
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /dashboard/chart-data - Get chart data (API)
router.get('/chart-data', isAuthenticated, async (req, res) => {
  try {
    const chartData = await getChartData();
    res.json(chartData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// GET /dashboard/api/activity - Get recent activity (API)
router.get('/api/activity', isAuthenticated, async (req, res) => {
  try {
    const recentCases = await Case.find()
      .populate('assignedOfficer', 'username')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentIncidents = await Incident.find()
      .populate('reportedBy', 'username')
      .sort({ dateTime: -1 })
      .limit(5);

    const recentPatterns = await CrimePattern.find()
      .sort({ createdAt: -1 })
      .limit(3);

    res.json({
      success: true,
      data: {
        recentCases,
        recentIncidents,
        recentPatterns
      }
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent activity'
    });
  }
});

// Helper function to get dashboard statistics
async function getDashboardStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Basic counts
  const totalCases = await Case.countDocuments();
  const activeCases = await Case.countDocuments({ status: 'open' });
  const totalIncidents = await Incident.countDocuments();
  const recentIncidents = await Incident.countDocuments({ 
    dateTime: { $gte: sevenDaysAgo } 
  });
  const patternsFound = await CrimePattern.countDocuments();
  // Count high priority cases (priority >= 8 out of 10)
  const highPriorityCases = await Case.countDocuments({ priority: { $gte: 8 } });

  // Trend calculations
  const casesLastMonth = await Case.countDocuments({ 
    createdAt: { $gte: thirtyDaysAgo } 
  });
  const incidentsLastMonth = await Incident.countDocuments({ 
    dateTime: { $gte: thirtyDaysAgo } 
  });

  // Calculate trends (simplified)
  const casesTrend = casesLastMonth > 0 ? '+' + casesLastMonth : '0';
  const incidentsTrend = incidentsLastMonth > 0 ? '+' + incidentsLastMonth : '0';

  // Priority distribution
  const priorityStats = await Case.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);

  // Status distribution
  const statusStats = await Case.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Crime type distribution
  const crimeTypeStats = await Incident.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  return {
    totalCases,
    activeCases,
    totalIncidents,
    recentIncidents,
    patternsFound,
    highPriorityCases,
    trends: {
      cases: casesTrend,
      incidents: incidentsTrend
    },
    distributions: {
      priority: priorityStats,
      status: statusStats,
      crimeTypes: crimeTypeStats
    }
  };
}

// Helper function to get chart data
async function getChartData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Daily incident counts for the last 30 days
  const dailyIncidents = await Incident.aggregate([
    {
      $match: {
        dateTime: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$dateTime' },
          month: { $month: '$dateTime' },
          day: { $dayOfMonth: '$dateTime' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);

  // Daily case counts for the last 30 days
  const dailyCases = await Case.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);

  // Crime severity distribution
  const severityDistribution = await Incident.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 }
      }
    }
  ]);

  // Hourly incident distribution
  const hourlyDistribution = await Incident.aggregate([
    {
      $group: {
        _id: { $hour: '$dateTime' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);

  // Format data for charts
  const labels = [];
  const incidentData = [];
  const caseData = [];

  // Create labels for the last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    // Find data for this date
    const dateKey = {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };

    const incidentCount = dailyIncidents.find(d => 
      d._id.year === dateKey.year && 
      d._id.month === dateKey.month && 
      d._id.day === dateKey.day
    )?.count || 0;

    const caseCount = dailyCases.find(d => 
      d._id.year === dateKey.year && 
      d._id.month === dateKey.month && 
      d._id.day === dateKey.day
    )?.count || 0;

    incidentData.push(incidentCount);
    caseData.push(caseCount);
  }

  return {
    timeline: {
      labels,
      incidents: incidentData,
      cases: caseData
    },
    severity: severityDistribution.map(item => ({
      label: item._id || 'Unknown',
      value: item.count
    })),
    hourly: hourlyDistribution.map(item => ({
      hour: item._id,
      count: item.count
    }))
  };
}

module.exports = router;

