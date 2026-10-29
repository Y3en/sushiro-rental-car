const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    car: {type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true},
    pickupDate: {type: Date, required: true},
    returnDate: {type: Date, required: true},
    expiresAt: {type: Date, required: true}
}, {timestamps: true});
schema.index({expiresAt: 1}, {expireAfterSeconds: 0});
schema.index({car: 1, expiresAt: 1, pickupDate: 1, returnDate: 1});
module.exports = mongoose.model('Hold', schema);
