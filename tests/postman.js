const newman = require('newman');
const mongoose = require('mongoose');
const {randomUUID} = require('crypto');
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27019/sushiro_postman_test?replicaSet=rs0&directConnection=true';
process.env.JWT_SECRET = 'postman-test-only-secret';
process.env.JWT_EXPIRE = '1h';
process.env.NOTIFICATION_MODE = 'log';
const app = require('../app');
const User = require('../models/User');
let server;
(async () => {
    if (!new URL(process.env.MONGO_URI).pathname.endsWith('_test')) throw new Error('Test database must end in _test');
    await require('../config/db')();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
    const password = randomUUID();
    await User.create({name: 'Runner Admin', email: 'runner@example.com', tel: '0800000000', password, role: 'admin'});
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const summary = await new Promise((resolve, reject) => newman.run({
        collection: require('./PM.json'), reporters: [],
        envVar: [{key: 'baseUrl', value: `http://127.0.0.1:${server.address().port}/api/v1`}, {key: 'adminEmail', value: 'runner@example.com'}, {key: 'adminPassword', value: password}]
    }, (error, summary) => error ? reject(error) : resolve(summary)));
    const {requests, assertions} = summary.run.stats;
    console.log(`Newman: ${requests.total} requests (${requests.failed} failed); ${assertions.total} assertions (${assertions.failed} failed)`);
    for (const failure of summary.run.failures) console.error(`${failure.source.name}: ${failure.error.message}`);
    if (summary.run.failures.length) process.exitCode = 1;
})().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
});
