const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  caseNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'investigating', 'closed', 'cold'],
    default: 'open'
  },
  assignedOfficer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    address: {
      type: String,
      trim: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    district: {
      type: String,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  linkedCases: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case'
  }],
  aiAnalysis: {
    patternScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    hotspotProbability: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    suggestedLinks: [{
      caseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Case'
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1
      },
      reason: String
    }],
    lastAnalyzed: {
      type: Date
    }
  },
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  evidence: [{
    type: {
      type: String,
      enum: ['document', 'photo', 'video', 'audio', 'physical', 'digital']
    },
    description: String,
    filename: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: [{
    content: {
      type: String,
      required: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isPrivate: {
      type: Boolean,
      default: false
    }
  }],
  closedAt: {
    type: Date
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closureReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
caseSchema.index({ caseNumber: 1 });
caseSchema.index({ status: 1 });
caseSchema.index({ severity: 1 });
caseSchema.index({ assignedOfficer: 1 });
caseSchema.index({ createdAt: -1 });
caseSchema.index({ 'location.coordinates': '2dsphere' });
caseSchema.index({ tags: 1 });
caseSchema.index({ priority: -1 });
caseSchema.index({ 'aiAnalysis.patternScore': -1 });

// Compound indexes
caseSchema.index({ status: 1, severity: 1 });
caseSchema.index({ assignedOfficer: 1, status: 1 });

// Pre-save middleware to generate case number
caseSchema.pre('save', async function(next) {
  if (this.isNew && !this.caseNumber) {
    try {
      const year = new Date().getFullYear();
      const count = await this.constructor.countDocuments({
        caseNumber: new RegExp(`^CASE-${year}-`)
      });
      this.caseNumber = `CASE-${year}-${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Pre-save middleware to update closure fields
caseSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'closed' && !this.closedAt) {
    this.closedAt = new Date();
  }
  next();
});

// Instance method to add note
caseSchema.methods.addNote = function(content, authorId, isPrivate = false) {
  this.notes.push({
    content,
    author: authorId,
    isPrivate
  });
  return this.save();
};

// Instance method to add evidence
caseSchema.methods.addEvidence = function(evidenceData, uploadedBy) {
  this.evidence.push({
    ...evidenceData,
    uploadedBy
  });
  return this.save();
};

// Instance method to link case
caseSchema.methods.linkCase = function(caseId) {
  if (!this.linkedCases.includes(caseId)) {
    this.linkedCases.push(caseId);
  }
  return this.save();
};

// Instance method to update AI analysis
caseSchema.methods.updateAIAnalysis = function(analysisData) {
  this.aiAnalysis = {
    ...this.aiAnalysis,
    ...analysisData,
    lastAnalyzed: new Date()
  };
  return this.save();
};

// Instance method to close case
caseSchema.methods.closeCase = function(closedBy, reason) {
  this.status = 'closed';
  this.closedAt = new Date();
  this.closedBy = closedBy;
  this.closureReason = reason;
  return this.save();
};

// Static method to find cases by location
caseSchema.statics.findByLocation = function(coordinates, radiusKm = 5) {
  const radiusMeters = radiusKm * 1000;
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: radiusMeters
      }
    }
  });
};

// Static method to search cases
caseSchema.statics.searchCases = function(searchTerm, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const regex = new RegExp(searchTerm, 'i');
  
  return this.find({
    $or: [
      { title: regex },
      { description: regex },
      { caseNumber: regex },
      { tags: regex },
      { 'location.address': regex },
      { 'location.district': regex }
    ]
  })
  .populate('assignedOfficer', 'username badgeNumber')
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });
};

// Static method to get cases by officer
caseSchema.statics.getCasesByOfficer = function(officerId, status = null, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const query = { assignedOfficer: officerId };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('assignedOfficer', 'username badgeNumber')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });
};

// Static method to get high priority cases
caseSchema.statics.getHighPriorityCases = function(limit = 10) {
  return this.find({ status: { $ne: 'closed' } })
    .populate('assignedOfficer', 'username badgeNumber')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

// Static method to get case statistics
caseSchema.statics.getCaseStats = async function() {
  const totalCases = await this.countDocuments();
  const openCases = await this.countDocuments({ status: 'open' });
  const investigatingCases = await this.countDocuments({ status: 'investigating' });
  const closedCases = await this.countDocuments({ status: 'closed' });
  
  const casesBySeverity = await this.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const casesByMonth = await this.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': -1, '_id.month': -1 }
    },
    {
      $limit: 12
    }
  ]);
  
  return {
    totalCases,
    openCases,
    investigatingCases,
    closedCases,
    casesBySeverity,
    casesByMonth
  };
};

// Virtual for incident count
caseSchema.virtual('incidentCount', {
  ref: 'Incident',
  localField: '_id',
  foreignField: 'caseId',
  count: true
});

// Ensure virtual fields are serialized
caseSchema.set('toJSON', { virtuals: true });
caseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Case', caseSchema);

