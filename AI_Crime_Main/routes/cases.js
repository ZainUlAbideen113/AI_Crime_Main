const express = require('express');
const router = express.Router();
const Case = require('../models/Case');
const Incident = require('../models/Incident');
const { isAuthenticated } = require('../middleware/auth');

// GET /cases - List all cases
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { caseNumber: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const cases = await Case.find(filter)
      .populate('assignedOfficer', 'username badgeNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Case.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.render('cases/index', {
      title: 'Cases - Crime Analysis Dashboard',
      user: req.user,
      cases,
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
    console.error('Error fetching cases:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch cases'
    });
  }
});

// GET /cases/new - Show new case form
router.get('/new', isAuthenticated, (req, res) => {
  res.render('cases/new', {
    title: 'New Case - Crime Analysis Dashboard',
    user: req.user,
    error: null,
    formData: {}
  });
});

// POST /cases - Create new case
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      category,
      location,
      suspectInfo,
      evidenceNotes
    } = req.body;

    // Validate required fields
    if (!title || !description || !priority || !category || !location) {
      return res.render('cases/new', {
        title: 'New Case - Crime Analysis Dashboard',
        user: req.user,
        error: 'Please fill in all required fields.',
        formData: req.body
      });
    }

    // Generate case number
    const caseCount = await Case.countDocuments();
    const caseNumber = `CASE-${new Date().getFullYear()}-${String(caseCount + 1).padStart(6, '0')}`;

    // Map priority string to number
    const priorityMap = {
      'low': 2,
      'medium': 5,
      'high': 8,
      'critical': 10
    };

    // Map priority string to severity
    const severityMap = {
      'low': 'low',
      'medium': 'medium', 
      'high': 'high',
      'critical': 'critical'
    };

    const newCase = new Case({
      caseNumber,
      title: title.trim(),
      description: description.trim(),
      priority: priorityMap[priority] || 5,
      severity: severityMap[priority] || 'medium',
      location: {
        address: location.trim()
      },
      tags: [category],
      assignedOfficer: req.user._id,
      status: 'open'
    });

    // Add initial notes if provided
    if (suspectInfo && suspectInfo.trim()) {
      newCase.notes.push({
        content: `Suspect Information: ${suspectInfo.trim()}`,
        author: req.user._id,
        isPrivate: false
      });
    }

    if (evidenceNotes && evidenceNotes.trim()) {
      newCase.notes.push({
        content: `Evidence Notes: ${evidenceNotes.trim()}`,
        author: req.user._id,
        isPrivate: false
      });
    }

    await newCase.save();
    res.redirect(`/cases/${newCase._id}`);
  } catch (error) {
    console.error('Error creating case:', error);
    res.render('cases/new', {
      title: 'New Case - Crime Analysis Dashboard',
      user: req.user,
      error: 'Failed to create case. Please check all fields and try again.',
      formData: req.body
    });
  }
});

// GET /cases/:id - View case details
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const caseData = await Case.findById(req.params.id)
      .populate('assignedOfficer', 'username badgeNumber department');

    if (!caseData) {
      return res.status(404).render('error', {
        title: 'Case Not Found',
        user: req.user,
        error: 'The requested case could not be found.'
      });
    }

    // Get incidents associated with this case
    const incidents = await Incident.find({ caseId: req.params.id })
      .sort({ dateTime: -1 });

    res.render('cases/detail', {
      title: `${caseData.caseNumber} - Crime Analysis Dashboard`,
      user: req.user,
      caseData: caseData,
      incidents: incidents
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch case details'
    });
  }
});

// GET /cases/:id/edit - Show edit case form
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const caseData = await Case.findById(req.params.id);

    if (!caseData) {
      return res.status(404).render('error', {
        title: 'Case Not Found',
        user: req.user,
        error: 'The requested case could not be found.'
      });
    }

    res.render('cases/edit', {
      title: `Edit ${caseData.caseNumber} - Crime Analysis Dashboard`,
      user: req.user,
      caseData: caseData,
      error: null
    });
  } catch (error) {
    console.error('Error fetching case for edit:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.user,
      error: 'Failed to fetch case for editing'
    });
  }
});

// PUT /cases/:id - Update case
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      category,
      status,
      location
    } = req.body;

    // Validate required fields
    if (!title || !description || !priority || !category || !status || !location) {
      const caseData = await Case.findById(req.params.id);
      return res.render('cases/edit', {
        title: `Edit ${caseData.caseNumber} - Crime Analysis Dashboard`,
        user: req.user,
        caseData: caseData,
        error: 'Please fill in all required fields.'
      });
    }

    // Map priority string to number
    const priorityMap = {
      'low': 2,
      'medium': 5,
      'high': 8,
      'critical': 10
    };

    // Map priority string to severity
    const severityMap = {
      'low': 'low',
      'medium': 'medium', 
      'high': 'high',
      'critical': 'critical'
    };

    const updateData = {
      title: title.trim(),
      description: description.trim(),
      priority: priorityMap[priority] || 5,
      severity: severityMap[priority] || 'medium',
      status,
      location: {
        address: location.trim()
      },
      tags: [category],
      updatedAt: new Date()
    };

    const caseData = await Case.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!caseData) {
      return res.status(404).render('error', {
        title: 'Case Not Found',
        user: req.user,
        error: 'The requested case could not be found.'
      });
    }

    res.redirect(`/cases/${caseData._id}`);
  } catch (error) {
    console.error('Error updating case:', error);
    const caseData = await Case.findById(req.params.id);
    res.render('cases/edit', {
      title: `Edit ${caseData ? caseData.caseNumber : 'Unknown'} - Crime Analysis Dashboard`,
      user: req.user,
      caseData: caseData,
      error: 'Failed to update case. Please check all fields and try again.'
    });
  }
});

// DELETE /cases/:id - Delete case
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const caseData = await Case.findByIdAndDelete(req.params.id);

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Also delete associated incidents
    await Incident.deleteMany({ caseId: req.params.id });

    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error) {
    console.error('Error deleting case:', error);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

module.exports = router;

