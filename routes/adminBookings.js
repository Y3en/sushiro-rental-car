const express = require('express');
const {protect, authorize} = require('../middleware/auth');
const {getAllBookings, getAnyBooking, updateAnyBooking, deleteAnyBooking} = require('../controllers/bookings');

const router = express.Router();
router.use(protect, authorize('admin'));
router.get('/', getAllBookings);
router.route('/:id').get(getAnyBooking).put(updateAnyBooking).delete(deleteAnyBooking);

module.exports = router;
