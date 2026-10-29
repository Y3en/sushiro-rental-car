const inventory = require('../services/inventory');
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
    const car = await inventory.createCar(req.params.branchId, req.body);

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



    const car = await Car.findByIdAndUpdate(req.params.id, inventory.pick(req.body, ['brand', 'model', 'licensePlate', 'pricePerDay']), {
      returnDocument: 'after',
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
    await inventory.remove('car', req.params.id);
    res.json({success: true, data: {}});
  } catch (error) { next(error); }
};
