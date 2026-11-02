const mongoose = require('mongoose');
const Provider = require('../models/Provider');
const Branch = require('../models/Branch');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const Hold = require('../models/Hold');
const {fail} = require('./rental');

exports.pick = (body, keys) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) fail(400, 'Unsupported request fields');
    return Object.fromEntries(keys.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
};
exports.createBranch = (provider, body) => mongoose.connection.transaction(async session => {
    if (!mongoose.isObjectIdOrHexString(provider)) fail(400, 'Invalid provider');
    if (!await Provider.findOneAndUpdate({_id: provider}, {$inc: {bookingLock: 1}}, {session})) fail(404, 'Provider not found');
    const [branch] = await Branch.create([{...exports.pick(body, ['name', 'address', 'tel']), provider}], {session});
    return branch;
});
exports.createCar = (branchId, body) => mongoose.connection.transaction(async session => {
    const branch = await Branch.findById(branchId).session(session);
    if (!branch) fail(404, 'Branch not found');
    if (!await Provider.findOneAndUpdate({_id: branch.provider}, {$inc: {bookingLock: 1}}, {session})) fail(404, 'Provider not found');
    // Serialize against branch deletion, even if no cars existed when it began.
    await Branch.updateOne({_id: branchId}, {$inc: {__v: 1}}, {session});
    const [car] = await Car.create([{...exports.pick(body, ['brand', 'model', 'licensePlate', 'pricePerDay']), branch: branchId, provider: branch.provider}], {session});
    return car;
});
exports.remove = (kind, resourceId) => mongoose.connection.transaction(async session => {
    const Model = {provider: Provider, branch: Branch, car: Car}[kind];
    const record = await Model.findById(resourceId).session(session);
    if (!record) fail(404, `${kind} not found`);
    const providerId = kind === 'provider' ? record._id : record.provider;
    await Provider.updateOne({_id: providerId}, {$inc: {bookingLock: 1}}, {session});
    if (kind === 'branch') await Branch.updateOne({_id: record._id}, {$inc: {__v: 1}}, {session});
    const filter = kind === 'provider' ? {provider: record._id} : kind === 'branch' ? {branch: record._id} : {_id: record._id};
    const cars = await Car.find(filter).select('_id').sort('_id').session(session);
    const carIds = cars.map(car => car._id);
    for (const car of cars) await Car.updateOne({_id: car._id}, {$inc: {bookingLock: 1}}, {session});
    const bookingFilter = kind === 'provider' ? {provider: record._id} : {car: {$in: carIds}};
    if (await Booking.exists({...bookingFilter, status: 'confirmed'}).session(session) || await Hold.exists({car: {$in: carIds}, expiresAt: {$gt: new Date()}}).session(session)) {
        fail(409, 'Cancel or complete active bookings and release holds before deleting inventory');
    }
    await Hold.deleteMany({car: {$in: carIds}}, {session});
    await Booking.deleteMany(bookingFilter, {session});
    await Car.deleteMany(filter, {session});
    if (kind === 'provider') await Branch.deleteMany({provider: record._id}, {session});
    if (kind !== 'car') await Model.deleteOne({_id: record._id}, {session});
});
