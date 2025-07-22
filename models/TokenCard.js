const mongoose = require('mongoose');

const tokenCardSchema = new mongoose.Schema({
  cardNumber: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Active', 'Inactive', 'Lost'], default: 'Active' },
  plant: { type: String, required: true },
  reportedDate: { type: String },
  reportedBy: { type: String },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('TokenCard', tokenCardSchema);
