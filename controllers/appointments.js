const Booking = require('../models/Booking');
const Provider = require('../models/Provider');

//@desc     Get all appointments
//@route    GET /api/v1/appointments
//@route    GET /api/v1/providers/:providerId/appointments
//@access   Private
exports.getAppointments = async (req, res, next) => {
    let query;

    //General users can see only their appointments!
    if (req.user.role !== 'admin') {
        query = Booking.find({user: req.user.id}).populate({
            path: 'provider',
            select: 'name address tel'
        });
    } else { //If you are an admin, you can see all appointments!
        if (req.params.providerId) {
            console.log(req.params.providerId);
            query = Booking.find({provider: req.params.providerId}).populate({
                path: 'provider',
                select: 'name address tel'
            });
        } else {
            query = Booking.find().populate({
                path: 'provider',
                select: 'name address tel'
            });
        }
    }

    try {
        const appointments = await query;

        res.status(200).json({
            success: true,
            count: appointments.length,
            data: appointments
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({success: false, message: 'Cannot find Appointment'});
    }
};

//@desc     Get single appointment
//@route    GET /api/v1/appointments/:id
//@access   Private
exports.getAppointment = async (req, res, next) => {
    try {
        const appointment = await Booking.findById(req.params.id).populate({
            path: 'provider',
            select: 'name address tel'
        });

        if (!appointment) {
            return res.status(404).json({success: false, message: `No appointment with the id of ${req.params.id}`});
        }

        if (appointment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({success: false, message: 'Not authorized to access this appointment'});
        }

        res.status(200).json({
            success: true,
            data: appointment
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({success: false, message: 'Cannot find Appointment'});
    }
};

//@desc     Add appointment
//@route    POST /api/v1/providers/:providerId/appointments
//@access   Private
exports.addAppointment = async (req, res, next) => {
    try {
        req.body.provider = req.params.providerId;

        const provider = await Provider.findById(req.params.providerId);

        if (!provider) {
            return res.status(404).json({success: false, message: `No provider with the id of ${req.params.providerId}`});
        }

        //add user Id to req.body
        req.body.user = req.user.id;

        //Check for existed appointment
        const existedAppointments = await Booking.find({user: req.user.id});

        //If the user is not an admin, they can only create 3 appointments.
        if (existedAppointments.length >= 3 && req.user.role !== 'admin') {
            return res.status(400).json({success: false, message: `The user with ID ${req.user.id} has already made 3 appointments`});
        }

        const appointment = await Booking.create(req.body);

        res.status(201).json({
            success: true,
            data: appointment
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({success: false, message: 'Cannot create Appointment'});
    }
};

//@desc     Update appointment
//@route    PUT /api/v1/appointments/:id
//@access   Private
exports.updateAppointment = async (req, res, next) => {
    try {
        let appointment = await Booking.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({success: false, message: `No appointment with the id of ${req.params.id}`});
        }

        //Make sure user is the appointment owner
        if (appointment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({success: false, message: `User ${req.user.id} is not authorized to update this appointment`});
        }

        appointment = await Booking.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: appointment
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({success: false, message: 'Cannot update Appointment'});
    }
};

//@desc     Delete appointment
//@route    DELETE /api/v1/appointments/:id
//@access   Private
exports.deleteAppointment = async (req, res, next) => {
    try {
        const appointment = await Booking.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({success: false, message: `No appointment with the id of ${req.params.id}`});
        }

        //Make sure user is the appointment owner
        if (appointment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({success: false, message: `User ${req.user.id} is not authorized to delete this appointment`});
        }

        await appointment.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({success: false, message: 'Cannot delete Appointment'});
    }
};
