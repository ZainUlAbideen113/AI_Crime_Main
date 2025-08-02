const express = require('express');
const router = express.Router();
const Incident = require('../models/Incident');
const Case = require('../models/Case');
const { isAuthenticated } = require('../middleware/auth');

// GET /incidents - List all incidents
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      filter.$or = [
        { description: { $regex: req.query.search, $options: 'i' } },
        { location: { $regex: req.query.search, $options: 'i' } },
        { incidentNumber: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const incidents = await Incident.find(filter)
      .populate('reportedBy', 'username badgeNumber')
      .populate('caseId', 'caseNumber title')
      .sort({ dateTime: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Incident.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.render('incidents/index', {
      title: 'Incidents - Crime Analysis Dashboard',
      user: req.user,
      incidents,
      pagination: {
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      },
      filters: req.query
    });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch incidents'
    });
  }
});

// GET /incidents/new - Show new incident form
router.get('/new', isAuthenticated, async (req, res) => {
  try {
    // Get open cases for linking
    const openCases = await Case.find({ status: 'open' })
      .select('caseNumber title')
      .sort({ createdAt: -1 });

    res.render('incidents/new', {
      title: 'Report Incident - Crime Analysis Dashboard',
      user: req.user,
      error: null,
      formData: {},
      openCases
    });
  } catch (error) {
    console.error('Error loading new incident form:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to load incident form'
    });
  }
});

// POST /incidents - Create new incident
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const {
      type,
      description,
      location,
      dateTime,
      severity,
      witnesses,
      evidence,
      caseId
    } = req.body;

    // Map severity values from form to model enum
    const severityMap = {
      'low': 'minor',
      'medium': 'moderate', 
      'high': 'serious',
      'critical': 'critical'
    };

    // Generate incident number
    const incidentCount = await Incident.countDocuments();
    const incidentNumber = `INC-${new Date().getFullYear()}-${String(incidentCount + 1).padStart(6, '0')}`;

    // Generate title from type if not provided
    const title = `${type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Incident`;

    // Handle witnesses and evidence arrays (convert empty strings to empty arrays)
    const witnessesArray = witnesses && witnesses.trim() ? [] : [];
    const evidenceArray = evidence && evidence.trim() ? [] : [];

    const newIncident = new Incident({
      incidentNumber,
      incidentType: type, // Map type to incidentType
      title: title,
      description,
      location: {
        address: location
      },
      dateTime: new Date(dateTime),
      severity: severityMap[severity] || 'moderate',
      witnesses: witnessesArray,
      evidence: evidenceArray,
      reportedBy: req.user._id,
      caseId: (caseId && caseId.trim() !== '') ? caseId : null
    });

    await newIncident.save();

    res.redirect(`/incidents/${newIncident._id}`);
  } catch (error) {
    console.error('Error creating incident:', error);
    const openCases = await Case.find({ status: 'open' })
      .select('caseNumber title')
      .sort({ createdAt: -1 });

    res.render('incidents/new', {
      title: 'Report Incident - Crime Analysis Dashboard',
      user: req.user,
      error: 'Failed to create incident. Please try again.',
      formData: req.body,
      openCases
    });
  }
});

// GET /incidents/:id - View incident details
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('reportedBy', 'username badgeNumber department')
      .populate('caseId', 'caseNumber title status');

    if (!incident) {
      return res.status(404).render('error', {
        title: 'Incident Not Found',
        user: req.user,
        error: 'The requested incident could not be found.'
      });
    }

    res.render('incidents/detail', {
      title: `${incident.incidentNumber} - Crime Analysis Dashboard`,
      user: req.user,
      incident
    });
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch incident details'
    });
  }
});

// GET /incidents/:id/edit - Show edit incident form
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    const openCases = await Case.find({ status: 'open' })
      .select('caseNumber title')
      .sort({ createdAt: -1 });

    if (!incident) {
      return res.status(404).render('error', {
        title: 'Incident Not Found',
        user: req.user,
        error: 'The requested incident could not be found.'
      });
    }

    res.render('incidents/edit', {
      title: `Edit ${incident.incidentNumber} - Crime Analysis Dashboard`,
      user: req.user,
      incident,
      openCases,
      error: null
    });
  } catch (error) {
    console.error('Error fetching incident for edit:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch incident for editing'
    });
  }
});

// PUT /incidents/:id - Update incident
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const {
      type,
      description,
      location,
      dateTime,
      severity,
      witnesses,
      evidence,
      caseId
    } = req.body;

    const oldIncident = await Incident.findById(req.params.id);
    
    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        type,
        description,
        location,
        dateTime: new Date(dateTime),
        severity,
        witnesses,
        evidence,
        caseId: caseId || null,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!incident) {
      return res.status(404).render('error', {
        title: 'Incident Not Found',
        user: req.user,
        error: 'The requested incident could not be found.'
      });
    }

    // Update case associations
    if (oldIncident.caseId && oldIncident.caseId.toString() !== caseId) {
      // Remove from old case
      await Case.findByIdAndUpdate(oldIncident.caseId, {
        $pull: { incidents: incident._id }
      });
    }

    if (caseId && oldIncident.caseId?.toString() !== caseId) {
      // Add to new case
      await Case.findByIdAndUpdate(caseId, {
        $push: { incidents: incident._id }
      });
    }

    res.redirect(`/incidents/${incident._id}`);
  } catch (error) {
    console.error('Error updating incident:', error);
    const incident = await Incident.findById(req.params.id);
    const openCases = await Case.find({ status: 'open' })
      .select('caseNumber title')
      .sort({ createdAt: -1 });

    res.render('incidents/edit', {
      title: `Edit ${incident.incidentNumber} - Crime Analysis Dashboard`,
      user: req.user,
      incident,
      openCases,
      error: 'Failed to update incident. Please try again.'
    });
  }
});

// DELETE /incidents/:id - Delete incident
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndDelete(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Remove from associated case
    if (incident.caseId) {
      await Case.findByIdAndUpdate(incident.caseId, {
        $pull: { incidents: incident._id }
      });
    }

    res.json({ success: true, message: 'Incident deleted successfully' });
  } catch (error) {
    console.error('Error deleting incident:', error);
    res.status(500).json({ error: 'Failed to delete incident' });
  }
});

module.exports = router;

