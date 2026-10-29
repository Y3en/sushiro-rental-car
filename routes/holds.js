const router = require('express').Router();
const {protect} = require('../middleware/auth');
const {createHold, releaseHold} = require('../controllers/bookings');
router.use(protect);
router.post('/', createHold);
router.delete('/:id', releaseHold);
module.exports = router;
