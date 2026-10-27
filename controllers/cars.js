const Car = require('../models/Car');
const Branch = require('../models/Branch');

//@desc     Get all cars
//@route    GET /api/v1/cars
//@route    GET /api/v1/branches/:branchId/cars
//@access   Private
exports.getCars = async (req, res, next) => {
  try {
    const filter = req.params.branchId ? {branch: req.params.branchId} : {};
    const cars = await Car.find(filter)
      .populate({path: 'provider', select: 'name tel'})
      .populate({path: 'branch', select: 'name address'});

    res.status(200).json({success: true, count: cars.length, data: cars});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot get cars'});
  }
};

//@desc     Get single car
//@route    GET /api/v1/cars/:id
//@access   Private
exports.getCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id)
      .populate({path: 'provider', select: 'name tel'})
      .populate({path: 'branch', select: 'name address'});

    if (!car) {
      return res.status(404).json({success: false, msg: `No car with the id of ${req.params.id}`});
    }

    res.status(200).json({success: true, data: car});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot get car'});
  }
};

//@desc     Create car
//@route    POST /api/v1/branches/:branchId/cars
//@access   Private (admin)
exports.createCar = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.branchId);

    if (!branch) {
      return res.status(404).json({success: false, msg: `No branch with the id of ${req.params.branchId}`});
    }

    //The provider always comes from the branch
    req.body.branch = branch.id;
    req.body.provider = branch.provider;
    const car = await Car.create(req.body);

    res.status(201).json({success: true, data: car});
  } catch (err) {
    res.status(400).json({success: false, msg: err.message});
  }
};

//@desc     Update car
//@route    PUT /api/v1/cars/:id
//@access   Private (admin)
exports.updateCar = async (req, res, next) => {
  try {
    //A car stays in its branch (and provider)
    delete req.body.branch;
    delete req.body.provider;

    const car = await Car.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!car) {
      return res.status(404).json({success: false, msg: `No car with the id of ${req.params.id}`});
    }

    res.status(200).json({success: true, data: car});
  } catch (err) {
    res.status(400).json({success: false, msg: err.message});
  }
};

//@desc     Delete car
//@route    DELETE /api/v1/cars/:id
//@access   Private (admin)
exports.deleteCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id);

    if (!car) {
      return res.status(404).json({success: false, msg: `No car with the id of ${req.params.id}`});
    }

    await Car.deleteOne({_id: req.params.id});

    res.status(200).json({success: true, data: {}});
  } catch (err) {
    res.status(400).json({success: false, msg: 'Cannot delete car'});
  }
};
