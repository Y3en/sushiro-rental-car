const express = require('express');
const {getBranches, getBranch, createBranch, updateBranch, deleteBranch} = require('../controllers/branches');

//Include other resource routers
const carRouter = require('./cars');

const router = express.Router({mergeParams: true});

const {protect, authorize} = require('../middleware/auth');

//Re-route into other resource routers
router.use('/:branchId/cars', carRouter);

router.route('/')
    .get(protect, getBranches)
    .post(protect, authorize('admin'), createBranch);
router.route('/:id')
    .get(protect, getBranch)
    .put(protect, authorize('admin'), updateBranch)
    .delete(protect, authorize('admin'), deleteBranch);

module.exports = router;
