const mongoose = require('mongoose');
const User = require('../models/User');
const Provider = require('../models/Provider');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const Hold = require('../models/Hold');
const Notification = require('../models/Notification');

const DAY = 86400000;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const id = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) fail(400, 'Use YYYY-MM-DD or an ISO timestamp with timezone');
    const parsed = new Date(value);
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(+parsed) || !Number.isFinite(+day) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) fail(400, 'Invalid calendar date');
    return parsed;
};
const range = (body, now = new Date()) => {
    const pickupDate = date(body.pickupDate);
    const returnDate = body.returnDate === undefined ? new Date(+pickupDate + DAY) : date(body.returnDate);
    if (pickupDate <= now || returnDate <= pickupDate || returnDate - pickupDate > 90 * DAY) fail(400, 'Rental must start in the future and last at most 90 days');
    return {pickupDate, returnDate};
};
const allowed = (body, keys) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) fail(400, 'Unsupported request fields');
};
const transaction = fn => mongoose.connection.transaction(fn, {maxCommitTimeMS: 2000, timeoutMS: 2500});
const lockProvider = async (provider, session) => {
    const record = await Provider.findOneAndUpdate({_id: provider}, {$inc: {bookingLock: 1}}, {session, returnDocument: 'after'});
    if (!record) fail(404, 'Provider not found');
    return record;
};
const lockCar = async (carId, session) => {
    if (!id(String(carId))) fail(400, 'Invalid car id');
    const car = await Car.findOneAndUpdate({_id: carId}, {$inc: {bookingLock: 1}}, {returnDocument: 'after', session});
    if (!car) fail(404, 'Car not found');
    return car;
};
const overlap = ({pickupDate, returnDate}) => ({
    pickupDate: {$lt: returnDate},
    $expr: {$gt: [{$ifNull: ['$returnDate', {$add: ['$pickupDate', DAY]}]}, pickupDate]}
});
const available = async (car, dates, session, exclude = {}) => {
    const conflict = await Booking.exists({car, status: 'confirmed', ...overlap(dates), ...(exclude.booking ? {_id: {$ne: exclude.booking}} : {})}).session(session);
    const held = await Hold.exists({car, expiresAt: {$gt: new Date()}, ...overlap(dates), ...(exclude.hold ? {_id: {$ne: exclude.hold}} : {})}).session(session);
    if (conflict || held) fail(409, 'Car is unavailable for this rental period');
};
const events = async (booking, session, noShow = false) => {
    const channels = (process.env.NOTIFICATION_CHANNELS || 'email').split(',');
    const items = noShow ? [['no-show', new Date()]] : [
        ['confirmation', new Date()], ['reminder', new Date(Math.max(Date.now(), +booking.pickupDate - DAY))]
    ];
    await Notification.create(items.flatMap(([event, dueAt]) => channels.map(channel => ({
        booking: booking._id, user: booking.user, version: booking.notificationVersion, event, dueAt, channel
    }))), {session, ordered: true});
};
const owned = async (actor, bookingId, session, admin = false) => {
    if (!id(bookingId)) fail(400, 'Invalid booking id');
    const booking = await Booking.findOne({_id: bookingId, deletedAt: null}).session(session);
    if (!booking) fail(404, 'Booking not found');
    if (admin ? actor.role !== 'admin' : String(booking.user) !== actor.id) fail(403, 'Not authorized to access this booking');
    return booking;
};

exports.createHold = async (actor, body) => {
    allowed(body, ['car', 'pickupDate', 'returnDate']);
    const dates = range(body);
    return transaction(async session => {
        const car = await lockCar(body.car, session);
        await lockProvider(car.provider, session);
        await available(car._id, dates, session);
        const [hold] = await Hold.create([{user: actor.id, car: car._id, ...dates, expiresAt: new Date(Date.now() + 600000)}], {session});
        return hold;
    });
};
exports.releaseHold = async (actor, holdId) => transaction(async session => {
    if (!id(holdId)) fail(400, 'Invalid hold id');
    const hold = await Hold.findById(holdId).session(session);
    if (!hold) fail(404, 'Hold not found');
    if (String(hold.user) !== actor.id) fail(403, 'Not authorized to release this hold');
    await lockCar(hold.car, session);
    await hold.deleteOne({session});
});
exports.listAvailable = async query => {
    if (!id(query.branch)) fail(400, 'Valid branch is required');
    const dates = range(query);
    // This is a snapshot; only the transactional hold guarantees availability.
    const occupied = await Booking.distinct('car', {status: 'confirmed', ...overlap(dates)});
    const held = await Hold.distinct('car', {expiresAt: {$gt: new Date()}, ...overlap(dates)});
    return Car.find({branch: query.branch, _id: {$nin: [...occupied, ...held]}});
};
exports.createBooking = async (actor, body) => {
    allowed(body, ['provider', 'pickupDate', 'returnDate', 'car', 'holdId']);
    if (!id(body.provider)) fail(400, 'Valid provider is required');
    const dates = range(body);
    return transaction(async session => {
        const user = await User.findOneAndUpdate({_id: actor.id}, {$inc: {bookingLock: 1}}, {session, returnDocument: 'after'});
        if (!user) fail(401, 'User no longer exists');
        await lockProvider(body.provider, session);
        if (user.role !== 'admin' && await Booking.countDocuments({user: actor.id, status: 'confirmed'}).session(session) >= 3) fail(400, 'Maximum of 3 confirmed bookings reached');
        let car;
        if (body.car !== undefined) {
            car = await lockCar(body.car, session);
            if (String(car.provider) !== body.provider) fail(400, 'Car does not belong to this provider');
            if (!id(body.holdId)) fail(400, 'A valid checkout hold is required');
            const hold = await Hold.findOne({_id: body.holdId, user: actor.id, car: car.id, expiresAt: {$gt: new Date()}, ...dates}).session(session);
            if (!hold) fail(409, 'Checkout hold expired or does not match');
            await available(car._id, dates, session, {hold: hold._id});
            await hold.deleteOne({session});
        } else if (body.holdId !== undefined) fail(400, 'car is required with holdId');
        const [booking] = await Booking.create([{
            user: actor.id, provider: body.provider, car: car?._id, ...dates,
            totalPriceSatang: car ? Math.round(car.pricePerDay * 100) * Math.ceil((dates.returnDate - dates.pickupDate) / DAY) : 0
        }], {session});
        await events(booking, session);
        return booking;
    });
};
exports.updateBooking = async (actor, bookingId, body, admin = false) => {
    allowed(body, ['provider', 'pickupDate', 'returnDate']);
    if (!Object.keys(body).length) fail(400, 'At least one update field is required');
    return transaction(async session => {
        const booking = await owned(actor, bookingId, session, admin);
        if (booking.status !== 'confirmed' || booking.checkedInAt) fail(409, 'Only uncollected confirmed bookings can be edited');
        if (body.provider !== undefined) {
            if (!id(body.provider)) fail(400, 'Invalid provider');
            await lockProvider(body.provider, session);
            booking.provider = body.provider;
        }
        const dates = range({pickupDate: body.pickupDate ?? booking.pickupDate.toISOString(), returnDate: body.returnDate ?? (body.pickupDate ? undefined : booking.returnDate?.toISOString())});
        if (booking.car) {
            const car = await lockCar(booking.car, session);
            if (String(car.provider) !== String(booking.provider)) fail(400, 'Car does not belong to this provider');
            await available(car._id, dates, session, {booking: booking._id});
            booking.totalPriceSatang = Math.round(car.pricePerDay * 100) * Math.ceil((dates.returnDate - dates.pickupDate) / DAY);
        }
        Object.assign(booking, dates);
        booking.notificationVersion += 1;
        await booking.save({session});
        await events(booking, session);
        return booking;
    });
};
exports.deleteBooking = (actor, bookingId, admin = false) => transaction(async session => {
    const booking = await owned(actor, bookingId, session, admin);
    if (booking.checkedInAt && booking.status === 'confirmed') fail(409, 'Complete this rental before deleting it');
    if (booking.car) await lockCar(booking.car, session);
    if (booking.status === 'confirmed') {
        Object.assign(booking, exports.cancellationAmounts(booking.totalPriceSatang, booking.pickupDate, new Date()), {status: 'cancelled', cancelledAt: new Date()});
    }
    booking.deletedAt = new Date();
    booking.notificationVersion += 1;
    await booking.save({session});
});
exports.cancellationAmounts = (total, pickup, now) => {
    const hours = (pickup - now) / 3600000;
    const fee = hours > 24 ? 0 : hours > 2 ? Math.round(total / 2) : total;
    return {cancellationFeeSatang: fee, refundSatang: total - fee};
};
exports.cancelBooking = (actor, bookingId, admin = false) => transaction(async session => {
    const booking = await owned(actor, bookingId, session, admin);
    if (booking.status === 'cancelled') return booking;
    if (booking.status !== 'confirmed' || booking.checkedInAt) fail(409, 'Booking cannot be cancelled');
    if (booking.car) await lockCar(booking.car, session);
    Object.assign(booking, exports.cancellationAmounts(booking.totalPriceSatang, booking.pickupDate, new Date()), {status: 'cancelled', cancelledAt: new Date()});
    booking.notificationVersion += 1;
    await booking.save({session});
    return booking;
});
exports.checkIn = (actor, bookingId, admin = false) => transaction(async session => {
    const booking = await owned(actor, bookingId, session, admin);
    if (booking.status !== 'confirmed') fail(409, 'Booking is not confirmed');
    if (booking.checkedInAt) return booking;
    const now = new Date();
    if (now < booking.pickupDate || now >= +booking.pickupDate + 1800000) fail(409, 'Check-in is available from pickup time until 30 minutes after pickup');
    booking.checkedInAt = now;
    await booking.save({session});
    return booking;
});
exports.completeBooking = (actor, bookingId) => transaction(async session => {
    const booking = await owned(actor, bookingId, session, true);
    if (booking.status === 'completed') return booking;
    if (booking.status !== 'confirmed' || !booking.checkedInAt) fail(409, 'Only checked-in rentals can be completed');
    if (booking.car) await lockCar(booking.car, session);
    booking.status = 'completed';
    booking.notificationVersion += 1;
    await booking.save({session});
    return booking;
});
exports.markNoShows = async (now = new Date()) => {
    const overdue = await Booking.find({status: 'confirmed', checkedInAt: null, pickupDate: {$lte: new Date(+now - 1800000)}}).select('_id').limit(100);
    let count = 0;
    for (const {_id} of overdue) count += await transaction(async session => {
        const booking = await Booking.findOne({_id, status: 'confirmed', checkedInAt: null, pickupDate: {$lte: new Date(+now - 1800000)}}).session(session);
        if (!booking) return 0;
        if (booking.car) await lockCar(booking.car, session);
        booking.status = 'no-show';
        booking.notificationVersion += 1;
        await booking.save({session});
        await events(booking, session, true);
        return 1;
    });
    return count;
};
exports.fail = fail;
exports.owned = owned;
