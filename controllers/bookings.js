const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');

const parsePickupDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
    const day = value.slice(0, 10);
    const calendarDate = new Date(`${day}T00:00:00.000Z`);
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && !Number.isNaN(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === day ? date : null;
};

exports.createBooking = async (req, res) => {
    const {provider, pickupDate} = req.body;
    const date = parsePickupDate(pickupDate);

    if (!mongoose.isValidObjectId(provider) || !date) {
        return res.status(400).json({success: false, message: 'Valid provider and pickupDate are required'});
    }

    try {
        const existingProvider = await Provider.exists({_id: provider});
        if (!existingProvider) {
            return res.status(404).json({success: false, message: 'Provider not found'});
        }

        if (req.user.role !== 'admin') {
            const activeCount = await Booking.countDocuments({user: req.user.id, status: 'confirmed'});
            if (activeCount >= 3) {
                return res.status(400).json({success: false, message: 'Maximum of 3 confirmed bookings reached'});
            }
        }

        const booking = await Booking.create({user: req.user.id, provider, pickupDate: date});
        return res.status(201).json({success: true, data: booking});
    } catch (error) {
        return res.status(500).json({success: false, message: 'Cannot create booking'});
    }
};
