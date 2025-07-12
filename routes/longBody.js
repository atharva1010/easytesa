const express = require("express");
const router = express.Router();
const LongBody = require("../models/LongBodyReport");

// ✅ POST - Save new report
router.post("/", async (req, res) => {
  try {
    const report = new LongBody(req.body);
    const saved = await report.save();
    res.status(201).json({ success: true, message: "Report saved", saved });
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ success: false, message: "Failed to save report" });
  }
});

// ✅ PUT - Update existing report by ID
router.put("/:id", async (req, res) => {
  try {
    const updated = await LongBody.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    res.json({ success: true, updated });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

// ✅ GET - Fetch reports with optional filters
router.get("/", async (req, res) => {
  try {
    const { fromDate, toDate, name } = req.query;
    const query = {};

    if (fromDate && toDate) {
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    if (name) {
      query.name = name;
    }

    const reports = await LongBody.find(query).sort({ date: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

module.exports = router;
