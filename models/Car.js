const mongoose = require('mongoose');

const CarSchema = new mongoose.Schema({
    provider: {
        type: mongoose.Schema.ObjectId,
        ref: 'Provider',
        required: true
    },
    branch: {
        type: mongoose.Schema.ObjectId,
        ref: 'Branch',
        required: true
    },
    brand: {
        type: String,
        required: [true, 'Please add a brand'],
        trim: true,
    },
    model: {
        type: String,
        required: [true, 'Please add a model'],
        trim: true,
    },
    licensePlate: {
        type: String,
        required: [true, 'Please add a license plate'],
        unique: true,
        trim: true,
    },
    pricePerDay: {
        type: Number,
        required: [true, 'Please add a price per day'],
        min: [0, 'Price can not be negative'],
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Car', CarSchema);
