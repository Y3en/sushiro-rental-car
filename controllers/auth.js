const User = require('../models/User');
const cookieOptions = () => ({httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/'});
const sendToken = (user, status, res) => res.status(status).cookie('token', user.getSignedJwtToken(), {
    ...cookieOptions(), maxAge: Number(process.env.JWT_COOKIE_EXPIRE || 30) * 86400000
}).json({success: true, token: user.getSignedJwtToken()});
const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
exports.register = async (req, res, next) => {
    try {
        const {name, tel, password} = req.body;
        if (![name, tel, password].every(value => typeof value === 'string') || !emailOf(req.body.email)) {
            return res.status(400).json({success: false, message: 'name, tel, email and password are required strings'});
        }
        const user = await User.create({name, tel, email: emailOf(req.body.email), password, role: 'user'});
        sendToken(user, 201, res);
    } catch (error) { next(error); }
};
exports.login = async (req, res, next) => {
    try {
        const email = emailOf(req.body.email);
        if (!email || typeof req.body.password !== 'string' || !req.body.password) return res.status(400).json({success: false, message: 'Email and password required'});
        const user = await User.findOne({email}).select('+password');
        if (!user || !await user.matchPassword(req.body.password)) return res.status(401).json({success: false, message: 'Invalid credentials'});
        sendToken(user, 200, res);
    } catch (error) { next(error); }
};
exports.getMe = (req, res) => {
    const {name, tel, email, role, _id} = req.user;
    res.json({success: true, data: {_id, name, tel, email, role}});
};
exports.logout = async (req, res, next) => {
    try {
        await User.updateOne({_id: req.user.id}, {$inc: {tokenVersion: 1}});
        res.clearCookie('token', cookieOptions()).json({success: true, data: {}});
    } catch (error) { next(error); }
};
