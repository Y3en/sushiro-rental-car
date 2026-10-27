const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
    provider: {
        type: mongoose.Schema.ObjectId,
        ref: 'Provider',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
        maxlength: [50, 'Name can not be more than 50 characters'],
    },
    address: {
        type: String,
        required: [true, 'Please add an address'],
    },
    tel: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

//A provider can not have two branches with the same name
BranchSchema.index({provider: 1, name: 1}, {unique: true});

module.exports = mongoose.model('Branch', BranchSchema);
