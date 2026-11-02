const inventory = require('../services/inventory');
const Provider = require('../models/Provider');
const Booking = require('../models/Booking');
const Branch = require('../models/Branch');
const Car = require('../models/Car');
//@desc     Get all providers
//@route    GET /api/v1/providers
//@access   Private
exports.getProviders = async (req, res, next) => {
  try{
    let query;

    //Copy req.query
    const reqQuery = {...req.query};

    //Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    //Loop over remove fields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);
    const filterFields = ['name', 'address', 'tel', '_id', 'createdAt'];
    for (const [key, value] of Object.entries(reqQuery)) {
      if (!filterFields.includes(key)) return res.status(400).json({success: false, message: 'Unsupported provider filter'});
      if (typeof value !== 'string' && (!value || Array.isArray(value) || Object.entries(value).some(([op, v]) => !['gt', 'gte', 'lt', 'lte', 'in'].includes(op) || typeof v !== 'string'))) {
        return res.status(400).json({success: false, message: 'Invalid provider filter'});
      }
    }
    for (const key of ['select', 'sort']) {
      if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || !/^[a-zA-Z_,\-]+$/.test(req.query[key]))) return res.status(400).json({success: false, message: 'Invalid fields'});
    }

    const filter = {};
    for (const [key, value] of Object.entries(reqQuery)) {
      filter[key] = typeof value === 'string' ? value : Object.fromEntries(Object.entries(value).map(([op, v]) => [`$${op}`, op === 'in' ? v.split(',') : v]));
    }
    query = Provider.find(filter);

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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const startIndex = (page-1) * limit;
    const endIndex = page * limit;
    const total = await Provider.countDocuments(filter);

    query = query.skip(startIndex).limit(limit);

    //Executing query
    const providers = await query;

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

    res.status(200).json({ success: true, count:providers.length, pagination, data:providers });
  } catch(err) {
    res.status(400).json({success:false, msg:'Get all providers'});
  }
};

exports.getProvider = async (req, res, next) => {
  try{
    const provider = await Provider.findById(req.params.id);
    
    if(!provider){
      return res.status(400).json({success:false});
    }

    res.status(200).json({ success: true, data:provider });
  } catch(err) {
    res.status(400).json({success:false});
  }
};

//@desc     Create new provider
//@route    POST /api/v1/providers
//@access   Private
exports.createProvider = async (req, res, next) => {
  try {
    const provider = await Provider.create(inventory.pick(req.body, ['name', 'address', 'tel']));
    res.status(201).json({ success: true, data: provider });
  } catch (err) {
    res.status(400).json({ success: false, msg: err.message });
  }
};

exports.updateProvider = async (req, res, next) => {
  try{
    const provider = await Provider.findByIdAndUpdate(req.params.id, inventory.pick(req.body, ['name', 'address', 'tel']), {
      returnDocument: 'after',
      runValidators:true
    });

    if(!provider) {
      return res.status(400).json({success:false});
    }

    res.status(200).json({success:true, data: provider});
  } catch(err) { 
    res.status(400).json({success:false});
  }
};

exports.deleteProvider = async (req, res, next) => {
  try {
    await inventory.remove('provider', req.params.id);
    res.json({success: true, data: {}});
  } catch (error) { next(error); }
};
