const express = require('express');
const {protect} = require('../middleware/auth');
const {createBooking, getOwnBookings, getOwnBooking, updateOwnBooking, deleteOwnBooking} = require('../controllers/bookings');

const router = express.Router();
router.route('/').get(protect, getOwnBookings).post(protect, createBooking);
router.route('/:id').get(protect, getOwnBooking).put(protect, updateOwnBooking).delete(protect, deleteOwnBooking);

module.exports = router;
