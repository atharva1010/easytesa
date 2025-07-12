const Token = require('../models/Token');

// Get all tokens for a plant
exports.getTokensByPlant = async (req, res) => {
  try {
    const { plant } = req.params;
    const tokens = await Token.find({ plant }).populate('reportedBy', 'fullName');
    res.json({ success: true, tokens });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new token
exports.createToken = async (req, res) => {
  try {
    const { cardNumber, plant } = req.body;
    
    // Check if token already exists
    const existingToken = await Token.findOne({ cardNumber });
    if (existingToken) {
      return res.status(400).json({ success: false, message: 'Token already exists' });
    }
    
    const token = new Token({
      cardNumber,
      plant,
      reportedBy: req.user.id,
      reportSource: 'Manual'
    });
    
    await token.save();
    res.status(201).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update token status
exports.updateTokenStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, problemDescription } = req.body;
    
    const updates = { status };
    if (status === 'Inactive' && problemDescription) {
      updates.problemDescription = problemDescription;
    }
    if (status === 'Active') {
      updates.activatedDate = new Date();
    }
    
    const token = await Token.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    ).populate('reportedBy', 'fullName');
    
    if (!token) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }
    
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get token counts
exports.getTokenCounts = async (req, res) => {
  try {
    const { plant } = req.params;
    
    const counts = await Token.aggregate([
      { $match: { plant } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);
    
    const result = {
      Active: 0,
      Inactive: 0,
      Lost: 0,
      Total: 0
    };
    
    counts.forEach(item => {
      result[item._id] = item.count;
      result.Total += item.count;
    });
    
    res.json({ success: true, counts: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get lost tokens from shift reports
exports.getLostTokensFromReports = async (req, res) => {
  try {
    const { plant } = req.params;
    const tokens = await Token.find({ 
      plant, 
      status: 'Lost',
      reportSource: 'ShiftReport'
    }).populate('reportedBy', 'fullName');
    
    res.json({ success: true, tokens });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};