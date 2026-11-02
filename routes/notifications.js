const router = require('express').Router();
const {protect, authorize} = require('../middleware/auth');
const Notification = require('../models/Notification');
router.use(protect, authorize('admin'));
router.get('/', async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.status) {
            if (!['pending', 'queued', 'sent', 'logged', 'skipped', 'dead'].includes(req.query.status)) return res.status(400).json({success: false, message: 'Invalid status'});
            filter.status = req.query.status;
        }
        const data = await Notification.find(filter).sort('-createdAt').limit(100);
        res.json({success: true, count: data.length, data});
    } catch (error) { next(error); }
});
module.exports = router;
