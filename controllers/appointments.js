// Compatibility aliases use the same validation, quota and ownership rules.
const bookings = require('./bookings');
const forRole = (owner, admin) => (req, res, next) => (req.user.role === 'admin' ? admin : owner)(req, res, next);
exports.getAppointments = forRole(bookings.getOwnBookings, bookings.getAllBookings);
exports.getAppointment = forRole(bookings.getOwnBooking, bookings.getAnyBooking);
exports.addAppointment = bookings.createBooking;
exports.updateAppointment = forRole(bookings.updateOwnBooking, bookings.updateAnyBooking);
exports.deleteAppointment = forRole(bookings.deleteOwnBooking, bookings.deleteAnyBooking);
