const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        mongoose.set('strictQuery', true);
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected: ' + conn.connection.host);
    } catch (err) {
        console.log('MongoDB connection error: ' + err.message);
    }

};

module.exports = connectDB;
