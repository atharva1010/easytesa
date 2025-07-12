const express = require("express");
const router = express.Router();
const ShiftReport = require("../models/ShiftReport");
const Token = require("../models/Token");
const auth = require("../middleware/auth");

// ✅ Create Shift Report
router.post("/", auth.authenticate, async (req, res) => {
  console.log("📦 Received Shift Report Body:", req.body);

  try {
    const {
      date,
      shift,
      plant,
      woodReceived = 0,
      woodSAP = 0,
      storeReceived = 0,
      storeSAP = 0,
      dispatchReceived = 0,
      dispatchSAP = 0,
      inStockTokens = 0,
      lossTokens = 0,
      remarks = "",
      lostTokenNumbers = [] // array of token card numbers (strings)
    } = req.body;

    // Calculate pending
    const woodPending = woodReceived - woodSAP;
    const storePending = storeReceived - storeSAP;
    const dispatchPending = dispatchReceived - dispatchSAP;
    const totalSAP = woodSAP + storeSAP + dispatchSAP;

    // Fetch total tokens for plant
    const totalTokens = await Token.countDocuments({ plant, status: "Active" });
    const issuedTokens = totalTokens - inStockTokens - lossTokens;

    // Handle lost tokens
    const lostTokensData = [];
    for (const cardNumber of lostTokenNumbers) {
      const token = await Token.findOne({ cardNumber, plant });
      if (token) {
        token.status = "Lost";
        token.reportedBy = req.user._id;
        token.reportedDate = new Date();
        token.reportSource = "ShiftReport";
        await token.save();
        lostTokensData.push(token._id);
      }
    }

    const newReport = new ShiftReport({
      date: date || new Date(),
      shift,
      plant,
      shiftPerson: req.user._id,
      woodReceived,
      woodSAP,
      woodPending,
      storeReceived,
      storeSAP,
      storePending,
      dispatchReceived,
      dispatchSAP,
      dispatchPending,
      lossTokens: lostTokensData.length > 0 ? lostTokensData : [],
      inStockTokens,
      remarks
    });

    await newReport.save();

    res.json({
      success: true,
      message: "Report saved successfully",
      report: newReport
    });
  } catch (err) {
    console.error("❌ Error saving shift report:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save report",
      error: err.message
    });
  }
});

// ✅ Get All Reports with Filter
router.get("/", auth.authenticate, async (req, res) => {
  try {
    const { plant, shift, startDate, endDate } = req.query;

    const filter = {};
    if (plant) filter.plant = plant;
    if (shift) filter.shift = shift;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const reports = await ShiftReport.find(filter)
      .populate("shiftPerson", "fullName")
      .populate("lossTokens", "cardNumber status reportedDate")
      .sort({ date: -1, createdAt: -1 });

    res.json({ success: true, reports });
  } catch (err) {
    console.error("❌ Error fetching shift reports:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: err.message
    });
  }
});

// ✅ Get Previous Shift Pending
router.post("/previous-pending", auth.authenticate, async (req, res) => {
  try {
    const { plant, shift, date } = req.body;

    const previousReport = await ShiftReport.findOne({
      plant,
      shift,
      date: { $lt: new Date(date) }
    }).sort({ date: -1 });

    const pending = {
      woodPending: previousReport?.woodPending || 0,
      storePending: previousReport?.storePending || 0,
      dispatchPending: previousReport?.dispatchPending || 0
    };

    res.json({ success: true, pending });
  } catch (err) {
    console.error("❌ Error fetching previous pending:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch previous pending",
      error: err.message
    });
  }
});

// ✅ Get Report by ID
router.get("/:id", auth.authenticate, async (req, res) => {
  try {
    const report = await ShiftReport.findById(req.params.id)
      .populate("shiftPerson", "fullName")
      .populate("lossTokens", "cardNumber status reportedDate reportedBy");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    res.json({ success: true, report });
  } catch (err) {
    console.error("❌ Error fetching shift report:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: err.message
    });
  }
});

module.exports = router;
