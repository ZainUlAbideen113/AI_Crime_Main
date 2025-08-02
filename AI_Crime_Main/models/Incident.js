const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: false,
    default: null
  },
  incidentType: {
    type: String,
    required: true,
    trim: true,
    enum: [
      'theft', 'burglary', 'robbery', 'assault', 'battery', 'homicide',
      'vandalism', 'fraud', 'cybercrime', 'drug_offense', 'traffic_violation',
      'domestic_violence', 'public_disturbance', 'weapon_offense', 'arson',
      'kidnapping', 'sexual_assault', 'harassment', 'trespassing', 'other'
    ]
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
    },
    landmark: {
      type: String,
      trim: true
    }
  },
  dateTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  witnesses: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    contact: {
      phone: String,
      email: String
    },
    statement: String,
    isReliable: {
      type: Boolean,
      default: true
    }
  }],
  suspects: [{
    name: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    age: {
      type: Number,
      min: 0,
      max: 150
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'unknown']
    },
    height: String,
    weight: String,
    distinguishingMarks: String,
    lastSeenLocation: String,
    isIdentified: {
      type: Boolean,
      default: false
    }
  }],
  evidence: [{
    type: {
      type: String,
      enum: ['document', 'photo', 'video', 'audio', 'physical', 'digital', 'forensic']
    },
    description: {
      type: String,
      required: true
    },
    location: String, // Where evidence was found
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    collectedAt: {
      type: Date,
      default: Date.now
    },
    chainOfCustody: [{
      handedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      handedAt: {
        type: Date,
        default: Date.now
      },
      purpose: String
    }],
    filename: String,
    isProcessed: {
      type: Boolean,
      default: false
    }
  }],
  vehicles: [{
    make: String,
    model: String,
    year: Number,
    color: String,
    licensePlate: String,
    vin: String,
    description: String,
    involvement: {
      type: String,
      enum: ['suspect_vehicle', 'victim_vehicle', 'witness_vehicle', 'evidence']
    }
  }],
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'serious', 'critical'],
    default: 'moderate'
  },
  status: {
    type: String,
    enum: ['reported', 'investigating', 'evidence_collected', 'completed'],
    default: 'reported'
  },
  officerNotes: [{
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
    isConfidential: {
      type: Boolean,
      default: false
    }
  }],
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date
  },
  followUpNotes: String,
  relatedIncidents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident'
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isPublic: {
    type: Boolean,
    default: false // Most incidents are confidential
  }
}, {
  timestamps: true
});

// Indexes for better performance
incidentSchema.index({ caseId: 1 });
incidentSchema.index({ incidentType: 1 });
incidentSchema.index({ dateTime: -1 });
incidentSchema.index({ reportedBy: 1 });
incidentSchema.index({ status: 1 });
incidentSchema.index({ severity: 1 });
incidentSchema.index({ 'location.coordinates': '2dsphere' });
incidentSchema.index({ tags: 1 });
incidentSchema.index({ createdAt: -1 });

// Compound indexes
incidentSchema.index({ caseId: 1, dateTime: -1 });
incidentSchema.index({ incidentType: 1, dateTime: -1 });
incidentSchema.index({ status: 1, severity: 1 });

// Instance method to add witness
incidentSchema.methods.addWitness = function(witnessData) {
  this.witnesses.push(witnessData);
  return this.save();
};

// Instance method to add suspect
incidentSchema.methods.addSuspect = function(suspectData) {
  this.suspects.push(suspectData);
  return this.save();
};

// Instance method to add evidence
incidentSchema.methods.addEvidence = function(evidenceData, collectedBy) {
  this.evidence.push({
    ...evidenceData,
    collectedBy
  });
  return this.save();
};

// Instance method to add officer note
incidentSchema.methods.addOfficerNote = function(content, authorId, isConfidential = false) {
  this.officerNotes.push({
    content,
    author: authorId,
    isConfidential
  });
  return this.save();
};

// Instance method to update evidence chain of custody
incidentSchema.methods.updateEvidenceChain = function(evidenceId, handedTo, purpose) {
  const evidence = this.evidence.id(evidenceId);
  if (evidence) {
    evidence.chainOfCustody.push({
      handedTo,
      purpose
    });
    return this.save();
  }
  throw new Error('Evidence not found');
};

// Instance method to set follow-up
incidentSchema.methods.setFollowUp = function(date, notes) {
  this.followUpRequired = true;
  this.followUpDate = date;
  this.followUpNotes = notes;
  return this.save();
};

// Static method to find incidents by location
incidentSchema.statics.findByLocation = function(coordinates, radiusKm = 5) {
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

// Static method to find incidents by date range
incidentSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    dateTime: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ dateTime: -1 });
};

// Static method to search incidents
incidentSchema.statics.searchIncidents = function(searchTerm, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const regex = new RegExp(searchTerm, 'i');
  
  return this.find({
    $or: [
      { title: regex },
      { description: regex },
      { incidentType: regex },
      { 'location.address': regex },
      { 'location.district': regex },
      { 'witnesses.name': regex },
      { 'suspects.name': regex },
      { tags: regex }
    ]
  })
  .populate('caseId', 'caseNumber title')
  .populate('reportedBy', 'username badgeNumber')
  .skip(skip)
  .limit(limit)
  .sort({ dateTime: -1 });
};

// Static method to get incidents by case
incidentSchema.statics.getIncidentsByCase = function(caseId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({ caseId })
    .populate('reportedBy', 'username badgeNumber')
    .skip(skip)
    .limit(limit)
    .sort({ dateTime: -1 });
};

// Static method to get recent incidents
incidentSchema.statics.getRecentIncidents = function(days = 7, limit = 20) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    dateTime: { $gte: startDate }
  })
  .populate('caseId', 'caseNumber title')
  .populate('reportedBy', 'username badgeNumber')
  .sort({ dateTime: -1 })
  .limit(limit);
};

// Static method to get incident statistics
incidentSchema.statics.getIncidentStats = async function() {
  const totalIncidents = await this.countDocuments();
  
  const incidentsByType = await this.aggregate([
    {
      $group: {
        _id: '$incidentType',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  const incidentsBySeverity = await this.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const incidentsByStatus = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Incidents by day of week
  const incidentsByDayOfWeek = await this.aggregate([
    {
      $group: {
        _id: { $dayOfWeek: '$dateTime' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
  
  // Incidents by hour of day
  const incidentsByHour = await this.aggregate([
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
  
  return {
    totalIncidents,
    incidentsByType,
    incidentsBySeverity,
    incidentsByStatus,
    incidentsByDayOfWeek,
    incidentsByHour
  };
};

// Static method to get hotspot data
incidentSchema.statics.getHotspotData = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        dateTime: { $gte: startDate },
        'location.coordinates': { $exists: true, $ne: [] }
      }
    },
    {
      $group: {
        _id: {
          lat: { $arrayElemAt: ['$location.coordinates', 1] },
          lng: { $arrayElemAt: ['$location.coordinates', 0] }
        },
        count: { $sum: 1 },
        incidents: { $push: '$_id' },
        types: { $addToSet: '$incidentType' }
      }
    },
    {
      $match: {
        count: { $gte: 2 } // Only show areas with 2+ incidents
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Virtual for evidence count
incidentSchema.virtual('evidenceCount').get(function() {
  return this.evidence.length;
});

// Virtual for witness count
incidentSchema.virtual('witnessCount').get(function() {
  return this.witnesses.length;
});

// Virtual for suspect count
incidentSchema.virtual('suspectCount').get(function() {
  return this.suspects.length;
});

// Ensure virtual fields are serialized
incidentSchema.set('toJSON', { virtuals: true });
incidentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Incident', incidentSchema);

