const ShiftReport = require('../models/ShiftReport');
const Token = require('../models/Token');

// Create shift report
exports.createShiftReport = async (req, res) => {
  try {
    const { plant, shift, lossTokens, ...reportData } = req.body;
    
    // Create shift report
    const shiftReport = new ShiftReport({
      ...reportData,
      plant,
      shift,
      shiftPerson: req.user.id,
      date: new Date()
    });
    
    // Process lost tokens
    if (lossTokens && lossTokens.length > 0) {
      const lostTokenUpdates = lossTokens.map(tokenId => {
        return Token.findByIdAndUpdate(
          tokenId,
          { 
            status: 'Lost',
            reportedBy: req.user.id,
            reportSource: 'ShiftReport',
            reportedDate: new Date()
          },
          { new: true }
        );
      });
      
      const updatedTokens = await Promise.all(lostTokenUpdates);
      shiftReport.lossTokens = updatedTokens.map(t => t._id);
    }
    
    await shiftReport.save();
    res.status(201).json({ success: true, shiftReport });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get previous shift pending
exports.getPreviousShiftPending = async (req, res) => {
  try {
    const { plant, shift, date } = req.body;
    
    // Find the most recent shift report before the given date
    const previousReport = await ShiftReport.findOne({
      plant,
      shift,
      date: { $lt: new Date(date) }
    }).sort({ date: -1 });
    
    const pending = {
      woodPending: previousReport ? previousReport.woodReceived - previousReport.woodSAP : 0,
      storePending: previousReport ? previousReport.storeReceived - previousReport.storeSAP : 0,
      dispatchPending: previousReport ? previousReport.dispatchReceived - previousReport.dispatchSAP : 0
    };
    
    res.json({ success: true, pending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all shift reports
exports.getShiftReports = async (req, res) => {
  try {
    const { plant, startDate, endDate } = req.query;
    
    const query = {};
    if (plant) query.plant = plant;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const reports = await ShiftReport.find(query)
      .populate('shiftPerson', 'fullName')
      .populate('lossTokens', 'cardNumber status');
    
    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};