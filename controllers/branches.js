const Branch = require('../models/Branch');
const Provider = require('../models/Provider');
const Car = require('../models/Car');

//@desc     Get all branches
//@route    GET /api/v1/branches
//@route    GET /api/v1/providers/:providerId/branches
//@access   Private
exports.getBranches = async (req, res, next) => {
  try {
    const filter = req.params.providerId ? {provider: req.params.providerId} : {};
    const branches = await Branch.find(filter).populate({path: 'provider', select: 'name tel'});

    res.status(200).json({success: true, count: branches.length, data: branches});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot get branches'});
  }
};

//@desc     Get single branch
//@route    GET /api/v1/branches/:id
//@access   Private
exports.getBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id).populate({path: 'provider', select: 'name tel'});

    if (!branch) {
      return res.status(404).json({success: false, msg: `No branch with the id of ${req.params.id}`});
    }

    res.status(200).json({success: true, data: branch});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot get branch'});
  }
};

//@desc     Create branch
//@route    POST /api/v1/providers/:providerId/branches
//@access   Private (admin)
exports.createBranch = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.providerId);

    if (!provider) {
      return res.status(404).json({success: false, msg: `No provider with the id of ${req.params.providerId}`});
    }

    req.body.provider = req.params.providerId;
    const branch = await Branch.create(req.body);

    res.status(201).json({success: true, data: branch});
  } catch (err) {
    res.status(400).json({success: false, msg: err.message});
  }
};

//@desc     Update branch
//@route    PUT /api/v1/branches/:id
//@access   Private (admin)
exports.updateBranch = async (req, res, next) => {
  try {
    //A branch can not be moved to another provider
    delete req.body.provider;

    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!branch) {
      return res.status(404).json({success: false, msg: `No branch with the id of ${req.params.id}`});
    }

    res.status(200).json({success: true, data: branch});
  } catch (err) {
    res.status(400).json({success: false, msg: err.message});
  }
};

//@desc     Delete branch
//@route    DELETE /api/v1/branches/:id
//@access   Private (admin)
exports.deleteBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({success: false, msg: `No branch with the id of ${req.params.id}`});
    }

    //Cascade delete: remove this branch's cars first
    await Car.deleteMany({branch: req.params.id});
    await Branch.deleteOne({_id: req.params.id});

    res.status(200).json({success: true, data: {}});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot delete branch'});
  }
};
