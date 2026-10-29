const Booking = require('../models/Booking');
const rental = require('../services/rental');
const action = handler => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
};
const result = (res, data, status = 200) => res.status(status).json({success: true, data});
const scope = req => ({deletedAt: null, ...(req.params.providerId ? {provider: req.params.providerId} : {})});
const body = req => req.params.providerId ? {...req.body, provider: req.params.providerId} : req.body;

exports.createBooking = action(async (req, res) => result(res, await rental.createBooking(req.user, body(req)), 201));
exports.getOwnBookings = action(async (req, res) => {
    const data = await Booking.find({user: req.user.id, ...scope(req)}).populate('provider', 'name address tel');
    res.json({success: true, count: data.length, data});
});
exports.getAllBookings = action(async (req, res) => {
    const data = await Booking.find(scope(req)).populate('provider', 'name address tel');
    res.json({success: true, count: data.length, data});
});
exports.getOwnBooking = action(async (req, res) => result(res, await rental.owned(req.user, req.params.id, null)));
exports.getAnyBooking = action(async (req, res) => result(res, await rental.owned(req.user, req.params.id, null, true)));
exports.updateOwnBooking = action(async (req, res) => result(res, await rental.updateBooking(req.user, req.params.id, req.body)));
exports.updateAnyBooking = action(async (req, res) => result(res, await rental.updateBooking(req.user, req.params.id, req.body, true)));
exports.deleteOwnBooking = action(async (req, res) => { await rental.deleteBooking(req.user, req.params.id); result(res, {}); });
exports.deleteAnyBooking = action(async (req, res) => { await rental.deleteBooking(req.user, req.params.id, true); result(res, {}); });
exports.cancelBooking = action(async (req, res) => result(res, await rental.cancelBooking(req.user, req.params.id, req.user.role === 'admin')));
exports.checkIn = action(async (req, res) => result(res, await rental.checkIn(req.user, req.params.id, req.user.role === 'admin')));
exports.completeBooking = action(async (req, res) => result(res, await rental.completeBooking(req.user, req.params.id)));
exports.getAvailability = action(async (req, res) => {
    const data = await rental.listAvailable(req.query);
    res.json({success: true, count: data.length, data});
});
exports.createHold = action(async (req, res) => result(res, await rental.createHold(req.user, req.body), 201));
exports.releaseHold = action(async (req, res) => { await rental.releaseHold(req.user, req.params.id); result(res, {}); });
