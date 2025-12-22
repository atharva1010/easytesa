const express = require("express");
const router = express.Router();
const GateEntry = require("../models/GateEntry");

/* =========================
   GET ALL GATE ENTRIES
   ========================= */
router.get("/", async (req, res) => {
  try {
    const data = await GateEntry.find().sort({ _id: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   CREATE NEW GATE ENTRY
   ========================= */
router.post("/", async (req, res) => {
  try {
    const entry = new GateEntry({
      token: req.body.token,
      plant: req.body.plant || "Internal Vehicle",
      status: req.body.status || "Active",
      remark: req.body.remark || "",
      saved: true,
      updatedDateTime: new Date().toLocaleString(),
      shiftPerson: req.body.shiftPerson
    });

    const saved = await entry.save();
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =========================
   UPDATE GATE ENTRY
   ========================= */
router.put("/:id", async (req, res) => {
  try {
    await GateEntry.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status,
        remark: req.body.remark,
        updatedDateTime: new Date().toLocaleString()
      },
      { new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =========================
   DELETE GATE ENTRY
   ========================= */
router.delete("/:id", async (req, res) => {
  try {
    await GateEntry.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
