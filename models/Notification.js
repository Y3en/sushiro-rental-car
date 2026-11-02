const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    booking: {type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true},
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    version: {type: Number, required: true},
    event: {type: String, enum: ['confirmation', 'reminder', 'no-show'], required: true},
    channel: {type: String, enum: ['email', 'sms'], required: true},
    dueAt: {type: Date, required: true},
    status: {type: String, enum: ['pending', 'queued', 'sent', 'logged', 'skipped', 'dead'], default: 'pending'},
    attempts: {type: Number, default: 0},
    lastError: String,
    deliveredAt: Date
}, {timestamps: true});
schema.index({booking: 1, version: 1, event: 1, channel: 1}, {unique: true});
schema.index({status: 1, dueAt: 1});
module.exports = mongoose.model('Notification', schema);
