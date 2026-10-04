const Hospital = require('../models/Hospital');
const Appointment = require('../models/Appointment');
//@desc     Get all hospitals
//@route    GET /api/v1/hospitals
//@access   Public
exports.getHospitals = async (req, res, next) => {
  try{
    let query;

    //Copy req.query
    const reqQuery = {...req.query};

    //Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    //Loop over remove fields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);
    console.log(reqQuery);

    //Create query string
    let queryStr = JSON.stringify(reqQuery);

    //Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    //finding resource
    const filter = JSON.parse(queryStr);
    query = Hospital.find(filter).populate('appointments');

    //Select Fields
    if(req.query.select){
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    //Sort
    if(req.query.sort){
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    //Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page-1) * limit;
    const endIndex = page * limit;
    const total = await Hospital.countDocuments(filter);

    query = query.skip(startIndex).limit(limit);

    //Executing query
    const hospitals = await query;

    //Pagination result
    const pagination = {};

    if(endIndex < total){
      pagination.next = {
        page: page+1,
        limit
      };
    }

    if(startIndex > 0){
      pagination.prev = {
        page: page-1,
        limit
      };
    }

    res.status(200).json({ success: true, count:hospitals.length, pagination, data:hospitals });
  } catch(err) {
    res.status(400).json({success:false, msg:'Get all hospitals'});
  }
};

exports.getHospital = async (req, res, next) => {
  try{
    const hospital = await Hospital.findById(req.params.id);
    
    if(!hospital){
      return res.status(400).json({success:false});
    }

    res.status(200).json({ success: true, data:hospital });
  } catch(err) {
    res.status(400).json({success:false});
  }
};

//@desc     Create new hospital
//@route    POST /api/v1/hospitals
//@access   Private
exports.createHospital = async (req, res, next) => {
  try {
    const hospital = await Hospital.create(req.body);
    res.status(201).json({ success: true, data: hospital });
  } catch (err) {
    res.status(400).json({ success: false, msg: err.message });
  }
};

exports.updateHospital = async (req, res, next) => {
  try{
    const hospital = await Hospital.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators:true
    });

    if(!hospital) {
      return res.status(400).json({success:false});
    }

    res.status(200).json({success:true, data: hospital});
  } catch(err) { 
    res.status(400).json({success:false});
  }
};

exports.deleteHospital = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.params.id);

    if(!hospital) {
      return res.status(400).json({success:false});
    }

    //Cascade delete: remove this hospital's appointments first
    await Appointment.deleteMany({hospital: req.params.id});
    await Hospital.deleteOne({_id: req.params.id});

    res.status(200).json({success:true, data: {}});
  } catch(err) {
    res.status(400).json({success:false});
  }
};