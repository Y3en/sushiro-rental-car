const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    provider: {
        type: mongoose.Schema.ObjectId,
        ref: 'Provider',
        required: true
    },
    car: {
        type: mongoose.Schema.ObjectId,
        ref: 'Car'
    },
    pickupDate: {
        type: Date,
        required: true
    },
    returnDate: { type: Date },
    totalPriceSatang: { type: Number, default: 0, min: 0 },
    cancellationFeeSatang: { type: Number, default: 0, min: 0 },
    refundSatang: { type: Number, default: 0, min: 0 },
    cancelledAt: Date,
    checkedInAt: Date,
    deletedAt: Date,
    notificationVersion: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'no-show', 'completed'],
        default: 'confirmed'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

BookingSchema.index({user: 1, status: 1});
BookingSchema.index({car: 1, status: 1, pickupDate: 1, returnDate: 1});
BookingSchema.index({status: 1, checkedInAt: 1, pickupDate: 1});

module.exports = mongoose.model('Booking', BookingSchema);
