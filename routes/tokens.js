const express = require('express');
const router = express.Router();
const TokenCard = require('../models/TokenCard');
const ShiftReport = require('../models/ShiftReport');

// Get token counts by plant and status
router.get('/api/tokens/counts', async (req, res) => {
  try {
    const counts = await TokenCard.aggregate([
      {
        $group: {
          _id: {
            plant: "$plant",
            status: "$status"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.plant",
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count"
            }
          },
          total: { $sum: "$count" }
        }
      }
    ]);
    
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Other existing routes...

module.exports = router;