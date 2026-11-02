const express = require('express');
const {protect, authorize} = require('../middleware/auth');
const {getAllBookings, getAnyBooking, updateAnyBooking, deleteAnyBooking} = require('../controllers/bookings');

const router = express.Router();
router.use(protect, authorize('admin'));
router.post('/:id/cancel', require('../controllers/bookings').cancelBooking);
router.post('/:id/check-in', require('../controllers/bookings').checkIn);
router.post('/:id/complete', require('../controllers/bookings').completeBooking);
router.get('/', getAllBookings);
router.route('/:id').get(getAnyBooking).put(updateAnyBooking).delete(deleteAnyBooking);

module.exports = router;
