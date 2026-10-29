require('dotenv').config({path: './config/config.env', quiet: true});
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
let server;
const start = async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me') throw new Error('Set a non-default JWT_SECRET');
    await connectDB();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    server = app.listen(process.env.PORT || 5000, () => console.log(`API listening on ${process.env.PORT || 5000}`));
};
const stop = () => {
    if (!server) return mongoose.disconnect();
    server.close(() => mongoose.disconnect());
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start().catch(async error => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
