const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
app.disable('x-powered-by');
app.set('query parser', 'extended');
app.use(express.json({limit: '32kb'}));
app.use((req, res, next) => { req.body ??= {}; next(); });
app.use(cookieParser());
app.get('/health', (req, res) => {
    const ready = require('mongoose').connection.readyState === 1;
    res.status(ready ? 200 : 503).json({success: ready});
});
app.use('/api/v1/providers', require('./routes/providers'));
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/appointments', require('./routes/appointments'));
app.use('/api/v1/bookings', require('./routes/bookings'));
app.use('/api/v1/admin/bookings', require('./routes/adminBookings'));
app.use('/api/v1/branches', require('./routes/branches'));
app.use('/api/v1/cars', require('./routes/cars'));
app.use('/api/v1/holds', require('./routes/holds'));
app.use('/api/v1/admin/notifications', require('./routes/notifications'));
app.use((req, res) => res.status(404).json({success: false, message: 'Route not found'}));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 11000 ? 409 : ['ValidationError', 'CastError', 'StrictModeError'].includes(error.name) ? 400 : 500);
    if (status >= 500) console.error(error.message);
    res.status(status).json({success: false, message: status >= 500 ? 'Service unavailable' : error.message});
});
module.exports = app;
