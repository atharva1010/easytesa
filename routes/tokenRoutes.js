const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');
const auth = require('../middleware/auth');

// Get tokens by plant
router.get('/plant/:plant', auth.authenticate, tokenController.getTokensByPlant);

// Get token counts
router.get('/counts/:plant', auth.authenticate, tokenController.getTokenCounts);

// Get lost tokens from shift reports
router.get('/lost-from-reports/:plant', auth.authenticate, tokenController.getLostTokensFromReports);

// Create new token
router.post('/', auth.authenticate, auth.authorize(['admin']), tokenController.createToken);

// Update token status
router.put('/:id/status', auth.authenticate, tokenController.updateTokenStatus);

module.exports = router;