const express = require('express');
const {protect} = require('../middleware/auth');
const {createBooking} = require('../controllers/bookings');

const router = express.Router();
router.post('/', protect, createBooking);

module.exports = router;
