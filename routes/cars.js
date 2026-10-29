const express = require('express');
const {getCars, getCar, createCar, updateCar, deleteCar} = require('../controllers/cars');

const router = express.Router({mergeParams: true});

const {protect, authorize} = require('../middleware/auth');
router.get('/availability', protect, require('../controllers/bookings').getAvailability);

router.route('/')
    .get(protect, getCars)
    .post(protect, authorize('admin'), createCar);
router.route('/:id')
    .get(protect, getCar)
    .put(protect, authorize('admin'), updateCar)
    .delete(protect, authorize('admin'), deleteCar);

module.exports = router;
