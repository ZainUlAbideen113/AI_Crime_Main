const mongoose = require('mongoose');

const crimePatternSchema = new mongoose.Schema({
  patternName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  patternType: {
    type: String,
    enum: ['temporal', 'spatial', 'modus_operandi', 'suspect_profile', 'victim_profile', 'mixed'],
    required: true
  },
  confidenceScore: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  cases: [{
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 1
    }
  }],
  incidents: [{
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: true
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 1
    }
  }],
  locationCluster: {
    center: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    radiusKm: {
      type: Number,
      min: 0
    },
    hotspots: [{
      coordinates: {
        type: [Number] // [longitude, latitude]
      },
      intensity: {
        type: Number,
        min: 0,
        max: 1
      },
      incidentCount: {
        type: Number,
        default: 0
      }
    }]
  },
  timePattern: {
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    }],
    hoursOfDay: [{
      type: Number,
      min: 0,
      max: 23
    }],
    monthsOfYear: [{
      type: Number,
      min: 1,
      max: 12
    }],
    seasonality: {
      type: String,
      enum: ['spring', 'summer', 'fall', 'winter', 'none']
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'seasonal', 'irregular']
    }
  },
  modusOperandi: {
    commonMethods: [String],
    targetTypes: [String],
    entryMethods: [String],
    weaponsUsed: [String],
    evidencePatterns: [String]
  },
  suspectProfile: {
    ageRange: {
      min: Number,
      max: Number
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'mixed', 'unknown']
    },
    physicalDescription: [String],
    behaviorPatterns: [String],
    vehicleDescriptions: [String]
  },
  victimProfile: {
    ageRange: {
      min: Number,
      max: Number
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'mixed', 'unknown']
    },
    demographics: [String],
    commonCharacteristics: [String],
    vulnerabilityFactors: [String]
  },
  predictions: {
    nextLikelyLocation: {
      coordinates: [Number],
      confidence: {
        type: Number,
        min: 0,
        max: 1
      }
    },
    nextLikelyTime: {
      dateRange: {
        start: Date,
        end: Date
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1
      }
    },
    escalationRisk: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    recommendedActions: [String]
  },
  analysisMetadata: {
    algorithm: {
      type: String,
      required: true
    },
    version: {
      type: String,
      required: true
    },
    parameters: mongoose.Schema.Types.Mixed,
    processingTime: Number, // milliseconds
    dataQuality: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  status: {
    type: String,
    enum: ['active', 'monitoring', 'resolved', 'false_positive'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  assignedAnalyst: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
crimePatternSchema.index({ patternType: 1 });
crimePatternSchema.index({ confidenceScore: -1 });
crimePatternSchema.index({ status: 1 });
crimePatternSchema.index({ priority: 1 });
crimePatternSchema.index({ assignedAnalyst: 1 });
crimePatternSchema.index({ 'locationCluster.center': '2dsphere' });
crimePatternSchema.index({ createdAt: -1 });
crimePatternSchema.index({ lastUpdated: -1 });
crimePatternSchema.index({ tags: 1 });

// Compound indexes
crimePatternSchema.index({ status: 1, priority: 1 });
crimePatternSchema.index({ patternType: 1, confidenceScore: -1 });

// Pre-save middleware to update lastUpdated
crimePatternSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Instance method to add case
crimePatternSchema.methods.addCase = function(caseId, relevanceScore = 1) {
  const existingCase = this.cases.find(c => c.caseId.toString() === caseId.toString());
  if (!existingCase) {
    this.cases.push({ caseId, relevanceScore });
  }
  return this.save();
};

// Instance method to add incident
crimePatternSchema.methods.addIncident = function(incidentId, relevanceScore = 1) {
  const existingIncident = this.incidents.find(i => i.incidentId.toString() === incidentId.toString());
  if (!existingIncident) {
    this.incidents.push({ incidentId, relevanceScore });
  }
  return this.save();
};

// Instance method to update predictions
crimePatternSchema.methods.updatePredictions = function(predictions) {
  this.predictions = { ...this.predictions, ...predictions };
  return this.save();
};

// Instance method to mark as reviewed
crimePatternSchema.methods.markAsReviewed = function(reviewedBy, notes) {
  this.reviewedBy = reviewedBy;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  return this.save();
};

// Static method to find patterns by location
crimePatternSchema.statics.findByLocation = function(coordinates, radiusKm = 10) {
  const radiusMeters = radiusKm * 1000;
  return this.find({
    'locationCluster.center': {
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

// Static method to find active patterns
crimePatternSchema.statics.findActivePatterns = function(limit = 20) {
  return this.find({ status: 'active' })
    .populate('assignedAnalyst', 'username')
    .sort({ confidenceScore: -1, priority: 1 })
    .limit(limit);
};

// Static method to find high confidence patterns
crimePatternSchema.statics.findHighConfidencePatterns = function(threshold = 0.8) {
  return this.find({
    confidenceScore: { $gte: threshold },
    status: 'active'
  })
  .populate('assignedAnalyst', 'username')
  .sort({ confidenceScore: -1 });
};

// Static method to search patterns
crimePatternSchema.statics.searchPatterns = function(searchTerm, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const regex = new RegExp(searchTerm, 'i');
  
  return this.find({
    $or: [
      { patternName: regex },
      { description: regex },
      { patternType: regex },
      { tags: regex },
      { 'modusOperandi.commonMethods': regex },
      { 'predictions.recommendedActions': regex }
    ]
  })
  .populate('assignedAnalyst', 'username')
  .skip(skip)
  .limit(limit)
  .sort({ confidenceScore: -1 });
};

// Static method to get pattern statistics
crimePatternSchema.statics.getPatternStats = async function() {
  const totalPatterns = await this.countDocuments();
  const activePatterns = await this.countDocuments({ status: 'active' });
  const highConfidencePatterns = await this.countDocuments({ 
    confidenceScore: { $gte: 0.8 },
    status: 'active'
  });
  
  const patternsByType = await this.aggregate([
    {
      $group: {
        _id: '$patternType',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidenceScore' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  const patternsByPriority = await this.aggregate([
    {
      $match: { status: 'active' }
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);
  
  return {
    totalPatterns,
    activePatterns,
    highConfidencePatterns,
    patternsByType,
    patternsByPriority
  };
};

// Static method to get hotspot analysis
crimePatternSchema.statics.getHotspotAnalysis = async function() {
  return this.aggregate([
    {
      $match: {
        status: 'active',
        'locationCluster.center': { $exists: true }
      }
    },
    {
      $unwind: '$locationCluster.hotspots'
    },
    {
      $group: {
        _id: {
          lat: { $arrayElemAt: ['$locationCluster.hotspots.coordinates', 1] },
          lng: { $arrayElemAt: ['$locationCluster.hotspots.coordinates', 0] }
        },
        totalIntensity: { $sum: '$locationCluster.hotspots.intensity' },
        incidentCount: { $sum: '$locationCluster.hotspots.incidentCount' },
        patternCount: { $sum: 1 },
        patterns: { $push: '$_id' }
      }
    },
    {
      $sort: { totalIntensity: -1 }
    },
    {
      $limit: 50
    }
  ]);
};

// Virtual for case count
crimePatternSchema.virtual('caseCount').get(function() {
  return this.cases.length;
});

// Virtual for incident count
crimePatternSchema.virtual('incidentCount').get(function() {
  return this.incidents.length;
});

// Virtual for average relevance score
crimePatternSchema.virtual('avgRelevanceScore').get(function() {
  const allScores = [
    ...this.cases.map(c => c.relevanceScore),
    ...this.incidents.map(i => i.relevanceScore)
  ];
  return allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
});

// Ensure virtual fields are serialized
crimePatternSchema.set('toJSON', { virtuals: true });
crimePatternSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CrimePattern', crimePatternSchema);

