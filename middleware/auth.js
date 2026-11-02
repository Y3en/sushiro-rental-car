const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    const bearer = req.headers.authorization;
    const token = bearer ? (/^Bearer\s+(\S+)$/i.exec(bearer)?.[1]) : req.cookies?.token;
    if (!token) return res.status(401).json({success: false, message: 'Authentication required'});
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id);
        if (!req.user || (decoded.version ?? 0) !== req.user.tokenVersion) {
            return res.status(401).json({success: false, message: 'Session expired'});
        }
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'CastError') {
            return res.status(401).json({success: false, message: 'Invalid session'});
        }
        next(error);
    }
};
exports.authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({success: false, message: 'Admin role required'});
    next();
};
