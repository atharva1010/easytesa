const express = require("express");
const router = express.Router();
const ShiftReport = require("../models/ShiftReport");
const WoodBill = require("../models/WoodBill");

// 📥 GET last shift wood bill per plant
router.get("/wood-bill/last-shift", async (req, res) => {
  try {
    const plants = ["C34A", "C2", "C3"];
    const results = await Promise.all(
      plants.map(async (plant) => {
        const last = await WoodBill.findOne({ plant }).sort({ sapDate: -1 }).limit(1);
        return last;
      })
    );
    res.json(results.filter(Boolean)); // Remove nulls
  } catch (err) {
    console.error("Error fetching last shift wood bill:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📥 GET all shift reports
router.get("/reports/shift", async (req, res) => {
  try {
    const reports = await ShiftReport.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Error fetching shift reports:", err);
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

// 🔍 Filtered shift reports by date/plant/shift (if needed in future)
router.get("/reports/shift/filter", async (req, res) => {
  const { fromDate, toDate, plant, shift } = req.query;

  let query = {};
  if (fromDate || toDate) {
    query.date = {};
    if (fromDate) query.date.$gte = new Date(fromDate);
    if (toDate) query.date.$lte = new Date(toDate);
  }
  if (plant) query.plant = plant;
  if (shift) query.shift = shift;

  try {
    const reports = await ShiftReport.find(query).sort({ date: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Error filtering shift reports:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
