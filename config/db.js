const mongoose = require('mongoose');
module.exports = async () => {
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 2500, socketTimeoutMS: 2500});
    const hello = await mongoose.connection.db.admin().command({hello: 1});
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set is required for booking transactions');
};
