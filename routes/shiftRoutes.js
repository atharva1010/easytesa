const express = require('express');
const ShiftReport = require('../models/ShiftReport');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Utility: Map "06:00-09:00" stays as is, A/B/C preserved; helper for ordering
const shiftOrder = ['A', 'B', 'C'];
const getShiftCode = (s) => {
  if (s === '06:00-14:00') return 'A';
  if (s === '14:00-22:00') return 'B';
  if (s === '22:00-06:00') return 'C';
  return s; // already A/B/C or custom like 06:00-09:00
};

const previousShift = (code) => {
  const c = getShiftCode(code);
  if (!shiftOrder.includes(c)) return c; // for special like 06:00-09:00, just return itself
  const idx = shiftOrder.indexOf(c);
  return shiftOrder[(idx + shiftOrder.length - 1) % shiftOrder.length];
};

// --- PUBLIC: Get previous pending values for a plant/shift/date
// Frontend calls this WITHOUT Authorization header.
router.post('/previous-pending', async (req, res) => {
  try {
    const { plant, shift, date } = req.body || {};
    if (!plant || !shift || !date) {
      return res.status(400).json({ success: false, message: 'plant, shift, date required' });
    }

    const shiftCode = getShiftCode(shift);
    const prevCode = previousShift(shiftCode);

    // If previous is C and current is A, we should look at previous DATE (simple approach)
    // We will search latest document for same plant with (date <= current date) and shift = prevCode
    const doc = await ShiftReport
      .find({ plant, shift: prevCode, date: { $lte: date } })
      .sort({ date: -1, createdAt: -1 })
      .limit(1);

    const latest = doc[0];

    const pending = {
      woodPending: latest?.woodPending || 0,
      storePending: latest?.storePending || 0,
      dispatchPending: latest?.dispatchPending || 0
    };

    return res.json({ success: true, pending });
  } catch (err) {
    console.error('previous-pending error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- PROTECTED: Save shift report
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('📦 Received Shift Report Body:', req.body);

    const payload = req.body || {};
    const required = ['date', 'shift', 'plant'];
    for (const f of required) {
      if (!payload[f]) {
        return res.status(400).json({ success: false, message: `${f} is required` });
      }
    }

    // Normalize shift for storage: keep exact value from frontend (A/B/C or 06:00-09:00)
    const data = {
      ...payload,
      shift: payload.shift,
      createdBy: req.user?.id || null
    };

    const report = await ShiftReport.create(data);
    res.json({ success: true, report });
  } catch (err) {
    console.error('❌ Error saving shift report:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
