const express = require('express');
const router = express.Router();
const TokenCard = require('../models/TokenCard');

// Save or Update Token Cards (Bulk)
router.post('/save', async (req, res) => {
  const { plant, total, available } = req.body;
  try {
    // This is where you'd log/save overall quantity info if needed
    res.json({ success: true, message: "Token info received." });
  } catch (err) {
    console.error("Error saving token values:", err);
    res.status(500).json({ success: false });
  }
});

// Get All Token Cards by Plant
router.get('/:plant', async (req, res) => {
  try {
    const cards = await TokenCard.find({ plant: req.params.plant });
    res.json({ success: true, cards });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Add a Token Card
router.post('/add', async (req, res) => {
  try {
    const newCard = new TokenCard(req.body);
    await newCard.save();
    res.json({ success: true, card: newCard });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Delete a Token Card
router.delete('/:id', async (req, res) => {
  try {
    await TokenCard.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
