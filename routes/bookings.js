const express = require('express');
const {protect} = require('../middleware/auth');
const {createBooking, getOwnBookings, getOwnBooking, updateOwnBooking, deleteOwnBooking} = require('../controllers/bookings');

const router = express.Router();
router.post('/:id/cancel', protect, require('../controllers/bookings').cancelBooking);
router.post('/:id/check-in', protect, require('../controllers/bookings').checkIn);
router.route('/').get(protect, getOwnBookings).post(protect, createBooking);
router.route('/:id').get(protect, getOwnBooking).put(protect, updateOwnBooking).delete(protect, deleteOwnBooking);

module.exports = router;
