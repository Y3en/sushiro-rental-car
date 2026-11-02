require('dotenv').config({path: './config/config.env', quiet: true});
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const {startWorker} = require('./services/notifications');
let runtime;
const stop = async () => { if (runtime) await runtime.close(); await mongoose.disconnect(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
(async () => {
    await connectDB();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    runtime = await startWorker();
    console.log('Notification worker and no-show scheduler ready');
})().catch(async error => { console.error(error.message); await stop(); process.exitCode = 1; });
