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

exports.getOwnBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({user: req.user.id}).populate('provider', 'name address tel');
        return res.status(200).json({success: true, count: bookings.length, data: bookings});
    } catch (error) {
        return res.status(500).json({success: false, message: 'Cannot find bookings'});
    }
};

exports.getOwnBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('provider', 'name address tel');
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({success: false, message: 'Not authorized to access this booking'});
        }
        return res.status(200).json({success: true, data: booking});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Invalid booking id'});
    }
};

exports.updateOwnBooking = async (req, res) => {
    const {provider, pickupDate} = req.body;
    if (provider === undefined && pickupDate === undefined) {
        return res.status(400).json({success: false, message: 'provider or pickupDate is required'});
    }
    if (provider !== undefined && !mongoose.isValidObjectId(provider)) {
        return res.status(400).json({success: false, message: 'Invalid provider'});
    }
    const date = pickupDate === undefined ? undefined : parsePickupDate(pickupDate);
    if (pickupDate !== undefined && !date) {
        return res.status(400).json({success: false, message: 'Invalid pickupDate'});
    }

    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({success: false, message: 'Not authorized to update this booking'});
        }
        if (provider !== undefined) {
            if (!(await Provider.exists({_id: provider}))) {
                return res.status(404).json({success: false, message: 'Provider not found'});
            }
            booking.provider = provider;
        }
        if (date !== undefined) booking.pickupDate = date;
        await booking.save();
        return res.status(200).json({success: true, data: booking});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Cannot update booking'});
    }
};

exports.deleteOwnBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({success: false, message: 'Not authorized to delete this booking'});
        }
        await booking.deleteOne();
        return res.status(200).json({success: true, data: {}});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Cannot delete booking'});
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find().populate('provider', 'name address tel');
        return res.status(200).json({success: true, count: bookings.length, data: bookings});
    } catch (error) {
        return res.status(500).json({success: false, message: 'Cannot find bookings'});
    }
};

exports.getAnyBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('provider', 'name address tel');
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        return res.status(200).json({success: true, data: booking});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Invalid booking id'});
    }
};

exports.updateAnyBooking = async (req, res) => {
    const {provider, pickupDate} = req.body;
    if (provider === undefined && pickupDate === undefined) {
        return res.status(400).json({success: false, message: 'provider or pickupDate is required'});
    }
    if (provider !== undefined && !mongoose.isValidObjectId(provider)) {
        return res.status(400).json({success: false, message: 'Invalid provider'});
    }
    const date = pickupDate === undefined ? undefined : parsePickupDate(pickupDate);
    if (pickupDate !== undefined && !date) {
        return res.status(400).json({success: false, message: 'Invalid pickupDate'});
    }

    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        if (provider !== undefined) {
            if (!(await Provider.exists({_id: provider}))) {
                return res.status(404).json({success: false, message: 'Provider not found'});
            }
            booking.provider = provider;
        }
        if (date !== undefined) booking.pickupDate = date;
        await booking.save();
        return res.status(200).json({success: true, data: booking});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Cannot update booking'});
    }
};

exports.deleteAnyBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({success: false, message: 'Booking not found'});
        await booking.deleteOne();
        return res.status(200).json({success: true, data: {}});
    } catch (error) {
        return res.status(400).json({success: false, message: 'Cannot delete booking'});
    }
};
