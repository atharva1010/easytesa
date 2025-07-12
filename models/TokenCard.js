const mongoose = require('mongoose');

const tokenCardSchema = new mongoose.Schema({
  tokenNumber: {
    type: String,
    required: true,
    unique: true
  },
  plant: {
    type: String,
    required: true,
    enum: ['C34A', 'C2', 'C3']
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'lost', 'damaged', 'issued'],
    default: 'active'
  },
  assignedTo: {
    type: String,
    default: ''
  },
  lastShiftReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftReport'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

tokenCardSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Add index for better performance
tokenCardSchema.index({ plant: 1, status: 1 });

module.exports = mongoose.model('TokenCard', tokenCardSchema);