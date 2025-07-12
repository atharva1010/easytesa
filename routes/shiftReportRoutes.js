const express = require('express');
const router = express.Router();
const ShiftReport = require('../models/ShiftReport');

// GET all shift reports
router.get('/', async (req, res) => {
  try {
    const reports = await ShiftReport.find().sort({ date: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching shift reports' });
  }
});

// POST new shift report
router.post('/', async (req, res) => {
  try {
    const report = new ShiftReport(req.body);
    await report.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

module.exports = router;
