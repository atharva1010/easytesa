const router = require("express").Router();
const Token = require("../models/Token");

// GET tokens (by plant)
router.get("/:plant", async (req, res) => {
  const data = await Token.find({ plant: req.params.plant });
  res.json(data);
});

// SAVE token
router.post("/", async (req, res) => {
  const token = new Token(req.body);
  await token.save();
  res.json({ success: true });
});

// UPDATE token
router.put("/:id", async (req, res) => {
  await Token.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE token
router.delete("/:id", async (req, res) => {
  await Token.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
