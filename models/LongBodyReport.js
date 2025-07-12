const mongoose = require('mongoose');

const longBodySchema = new mongoose.Schema({
  date: { type: String, required: true },
  vehicle: { type: String, required: true },
  material: { type: String, required: true },
  outsideWeight: { type: String, required: true },
  old80: { type: String, required: true },
  new80: { type: String, required: true },
  difference: { type: String, required: true },
  name: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('LongBodyReport', longBodySchema);
