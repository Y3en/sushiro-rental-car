const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27019/sushiro_test?replicaSet=rs0&directConnection=true';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6381';
process.env.JWT_SECRET = 'integration-only-secret-never-use-in-production';
process.env.JWT_EXPIRE = '1h';
process.env.NOTIFICATION_MODE = 'log';
process.env.NOTIFICATION_CHANNELS = 'email';
const app = require('../app');
const connectDB = require('../config/db');
const User = require('../models/User');
const Provider = require('../models/Provider');
const Branch = require('../models/Branch');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const Hold = require('../models/Hold');
const Notification = require('../models/Notification');
const rental = require('../services/rental');
const {startWorker} = require('../services/notifications');
let server, base, user, other, admin, provider, branch, car, maxCreateMs = 0;
const future = hours => new Date(Date.now() + hours * 3600000).toISOString();
const dates = () => ({pickupDate: future(48), returnDate: future(72)});
const request = async (method, path, actor, body, expected) => {
    const started = performance.now();
    const response = await fetch(base + '/api/v1' + path, {
        method, headers: {'Content-Type': 'application/json', ...(actor ? {Authorization: `Bearer ${typeof actor === 'string' ? actor : actor.getSignedJwtToken()}`} : {})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    const data = await response.json();
    if (method === 'POST' && ['/bookings', '/appointments'].includes(path)) maxCreateMs = Math.max(maxCreateMs, performance.now() - started);
    if (expected !== undefined) assert.equal(response.status, expected, JSON.stringify(data));
    return {status: response.status, ...data};
};
const createCore = async actor => (await request('POST', '/bookings', actor || user, {provider: provider.id, ...dates()}, 201)).data;
const holdCar = async (actor = user, selected = car, period = dates()) => (await request('POST', '/holds', actor, {car: selected.id, ...period}, 201)).data;
const bookCar = async (actor = user, selected = car, period = dates()) => {
    const hold = await holdCar(actor, selected, period);
    return (await request('POST', '/bookings', actor, {provider: provider.id, car: selected.id, holdId: hold._id, ...period}, 201)).data;
};
const waitFor = async predicate => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.fail('Timed out waiting for worker');
};
before(async () => {
    const dbName = new URL(process.env.MONGO_URI).pathname.slice(1);
    if (!dbName.endsWith('_test')) throw new Error('TEST_MONGO_URI database must end in _test; test data is deleted');
    await connectDB();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
    await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
    [user, other, admin] = await User.create([
        {name: 'Owner', tel: '0800000001', email: 'owner@example.com', password: 'password1'},
        {name: 'Other', tel: '0800000002', email: 'other@example.com', password: 'password1'},
        {name: 'Admin', tel: '0800000003', email: 'admin@example.com', password: 'password1', role: 'admin'}
    ]);
    provider = await Provider.create({name: 'Test Rental', address: 'Bangkok', tel: '021234567'});
    branch = await Branch.create({provider: provider.id, name: 'Main', address: 'Bangkok'});
    car = await Car.create({provider: provider.id, branch: branch.id, brand: 'Toyota', model: 'Yaris', licensePlate: 'TEST-1', pricePerDay: 1000});
});
after(async () => {
    console.log(`Maximum observed booking-create HTTP latency: ${maxCreateMs.toFixed(1)} ms`);
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
});

test('auth registration ignores admin role; validates inputs; logout invalidates bearer sessions', async () => {
    const registration = await request('POST', '/auth/register', null, {name: 'New', tel: '0800000000', email: ' NEW@Example.com ', password: 'password1', role: 'admin'}, 201);
    const me = await request('GET', '/auth/me', registration.token, undefined, 200);
    assert.equal(me.data.role, 'user'); assert.equal(me.data.email, 'new@example.com');
    await request('POST', '/auth/login', null, {email: {$ne: ''}, password: 'password1'}, 400);
    await request('POST', '/auth/login', null, {email: 'new@example.com', password: 'wrong'}, 401);
    const logged = await request('POST', '/auth/login', null, {email: 'new@example.com', password: 'password1'}, 200);
    await request('GET', '/auth/logout', logged.token, undefined, 200);
    await request('GET', '/auth/me', logged.token, undefined, 401);
    await request('GET', '/providers', null, undefined, 401);
    const deletedToken = other.getSignedJwtToken(); await other.deleteOne();
    await request('GET', '/auth/me', deletedToken, undefined, 401);
});

test('provider/branch/car CRUD is admin-only and immutable relationships cannot be changed', async () => {
    await request('POST', '/providers', user, {name: 'Nope'}, 403);
    const p = (await request('POST', '/providers', admin, {name: 'Second', address: 'Bangkok', tel: '020000000'}, 201)).data;
    const b = (await request('POST', `/providers/${p._id}/branches`, admin, {name: 'Airport', address: 'Bangkok'}, 201)).data;
    const c = (await request('POST', `/branches/${b._id}/cars`, admin, {brand: 'Honda', model: 'City', licensePlate: 'TEST-2', pricePerDay: 900}, 201)).data;
    await request('PUT', `/cars/${c._id}`, admin, {provider: provider.id}, 400);
    await request('PUT', `/branches/${b._id}`, admin, {provider: provider.id}, 400);
    await request('PUT', `/cars/${c._id}`, admin, {pricePerDay: 950}, 200);
    await request('PUT', `/branches/${b._id}`, admin, {name: 'Airport 2'}, 200);
    await request('PUT', `/providers/${p._id}`, admin, {tel: '029999999'}, 200);
    await request('GET', `/providers/${p._id}/branches`, user, undefined, 200);
    await request('GET', `/branches/${b._id}/cars`, user, undefined, 200);
    await request('DELETE', `/providers/${p._id}`, admin, undefined, 200);
    assert.equal(await Car.exists({_id: c._id}), null); assert.equal(await Branch.exists({_id: b._id}), null);
});

test('booking creation validates dates/provider, blocks field injection, and keeps legacy aliases safe', async () => {
    await request('POST', '/bookings', user, {provider: provider.id, pickupDate: '2028-02-30'}, 400);
    await request('POST', '/bookings', user, {provider: provider.id, pickupDate: future(-1)}, 400);
    await request('GET', '/providers?%24where=while(true){}', user, undefined, 400);
    await request('PUT', `/cars/${car.id}`, admin, {pricePerDay: 1.001}, 400);
    await request('POST', '/bookings', user, {provider: new mongoose.Types.ObjectId().toString(), ...dates()}, 404);
    const booking = await createCore();
    await request('PUT', `/appointments/${booking._id}`, user, {user: other.id, status: 'cancelled'}, 400);
    await request('GET', `/bookings/${booking._id}`, other, undefined, 403);
    await request('GET', `/appointments/${booking._id}`, other, undefined, 403);
    await request('GET', '/admin/bookings', user, undefined, 403);
    await request('GET', `/admin/bookings/${booking._id}`, admin, undefined, 200);
    await request('PUT', `/admin/bookings/${booking._id}`, admin, {pickupDate: future(60)}, 200);
    await request('PUT', `/bookings/${booking._id}`, user, {pickupDate: future(70)}, 200);
    await request('GET', '/bookings', user, undefined, 200);
    await request('GET', '/admin/bookings', admin, undefined, 200);
    await request('DELETE', `/admin/bookings/${booking._id}`, admin, undefined, 200);
    const audit = await Booking.findById(booking._id);
    assert.ok(audit.deletedAt); assert.equal(audit.status, 'cancelled');
    await request('GET', `/bookings/${booking._id}`, user, undefined, 404);
    const legacy = await request('POST', `/providers/${provider.id}/appointments`, user, dates(), 201);
    await request('DELETE', `/appointments/${legacy.data._id}`, user, undefined, 200);
});

test('12 concurrent creates across both APIs cannot exceed 3 confirmed bookings; admins are exempt', async () => {
    const responses = await Promise.all(Array.from({length: 12}, (_, i) => request('POST', i % 2 ? '/appointments' : '/bookings', user, {provider: provider.id, ...dates()})));
    assert.equal(responses.filter(response => response.status === 201).length, 3);
    assert.ok(responses.every(response => [201, 400].includes(response.status)), JSON.stringify(responses));
    assert.equal(await Booking.countDocuments({user: user.id, status: 'confirmed'}), 3);
    const first = await Booking.findOne({user: user.id});
    await request('POST', `/bookings/${first.id}/cancel`, user, {}, 200);
    await createCore();
    for (let i = 0; i < 4; i++) await createCore(admin);
    assert.ok(maxCreateMs < 3000, `Observed create latency ${maxCreateMs} ms`);
});

test('concurrent checkout locks admit one winner, expire logically, and availability filters branch and dates', async () => {
    const period = dates();
    const responses = await Promise.all(Array.from({length: 10}, (_, i) => request('POST', '/holds', i % 2 ? user : other, {car: car.id, ...period})));
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.ok(responses.every(response => [201, 409].includes(response.status)));
    const winner = responses.find(response => response.status === 201).data;
    assert.ok(Math.abs(+new Date(winner.expiresAt) - Date.now() - 600000) < 5000);
    const query = new URLSearchParams({branch: branch.id, ...period});
    assert.equal((await request('GET', `/cars/availability?${query}`, user, undefined, 200)).count, 0);
    await Hold.updateOne({_id: winner._id}, {$set: {expiresAt: new Date(Date.now() - 1000)}});
    assert.equal((await request('GET', `/cars/availability?${query}`, user, undefined, 200)).count, 1);
    const fresh = await holdCar(user, car, period);
    await request('DELETE', `/holds/${fresh._id}`, other, undefined, 403);
    await request('DELETE', `/holds/${fresh._id}`, user, undefined, 200);
});

test('hold consumption prevents double booking/replay and validates owner, price and overlapping edits', async () => {
    const period = dates(), hold = await holdCar(user, car, period);
    const payload = {provider: provider.id, car: car.id, holdId: hold._id, ...period};
    await request('POST', '/bookings', other, payload, 409);
    const booking = (await request('POST', '/bookings', user, payload, 201)).data;
    assert.ok(booking.totalPriceSatang >= 100000);
    await request('POST', '/bookings', user, payload, 409);
    await request('POST', '/holds', other, {car: car.id, ...period}, 409);
    const nextPeriod = {pickupDate: period.returnDate, returnDate: future(96)};
    const second = await bookCar(other, car, nextPeriod);
    await request('PUT', `/bookings/${second._id}`, other, period, 409);
    await request('DELETE', `/cars/${car.id}`, admin, undefined, 409);
    await request('DELETE', `/providers/${provider.id}`, admin, undefined, 409);
});

test('cancellation fee boundaries use integer satang; cancellation is idempotent and releases inventory', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    for (const [hours, fee] of [[25, 0], [24, 50001], [2.001, 50001], [2, 100001], [1, 100001]]) {
        const amounts = rental.cancellationAmounts(100001, new Date(+now + hours * 3600000), now);
        assert.equal(amounts.cancellationFeeSatang, fee); assert.equal(amounts.refundSatang + fee, 100001);
    }
    const booking = await bookCar(user, car, {pickupDate: future(12), returnDate: future(36)});
    const cancelled = (await request('POST', `/bookings/${booking._id}/cancel`, user, {}, 200)).data;
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancellationFeeSatang, cancelled.totalPriceSatang / 2);
    const repeated = (await request('POST', `/bookings/${booking._id}/cancel`, user, {}, 200)).data;
    assert.deepEqual(repeated, cancelled);
    await holdCar(other, car, {pickupDate: booking.pickupDate, returnDate: booking.returnDate});
});

test('check-in window, no-show scheduler and admin completion maintain inventory state', async () => {
    const booking = await bookCar();
    await request('POST', `/bookings/${booking._id}/check-in`, user, {}, 409);
    await Booking.updateOne({_id: booking._id}, {$set: {pickupDate: new Date(Date.now() - 60000)}});
    await request('POST', `/bookings/${booking._id}/check-in`, other, {}, 403);
    await request('POST', `/bookings/${booking._id}/check-in`, user, {}, 200);
    await request('POST', `/bookings/${booking._id}/check-in`, user, {}, 200);
    await request('POST', `/bookings/${booking._id}/cancel`, user, {}, 409);
    await request('DELETE', `/bookings/${booking._id}`, user, undefined, 409);
    assert.equal(await rental.markNoShows(new Date(Date.now() + 3600000)), 0);
    await request('POST', `/admin/bookings/${booking._id}/complete`, user, {}, 403);
    await request('POST', `/admin/bookings/${booking._id}/complete`, admin, {}, 200);
    const overdue = await bookCar(other);
    await Booking.updateOne({_id: overdue._id}, {$set: {pickupDate: new Date(Date.now() - 1800001)}});
    assert.equal(await rental.markNoShows(), 1); assert.equal(await rental.markNoShows(), 0);
    assert.equal((await Booking.findById(overdue._id)).status, 'no-show');
    assert.equal(await Notification.countDocuments({booking: overdue._id, event: 'no-show'}), 1);
    await holdCar(user);
});

test('outbox persists without Redis; real Redis worker sends/logs, retries 3 attempts, and exposes DLQ', async () => {
    const booking = await createCore();
    assert.equal(await Notification.countDocuments({booking: booking._id, status: 'pending'}), 2);
    let attempts = 0;
    const runtime = await startWorker({prefix: `sushiro-test-${Date.now()}`, intervalMs: 50, backoffMs: 20, send: async notification => {
        if (notification.event === 'confirmation') { attempts++; throw new Error('Controlled provider failure'); }
        return 'logged';
    }});
    try {
        await waitFor(async () => (await Notification.findOne({booking: booking._id, event: 'confirmation'})).status === 'dead');
        assert.equal(attempts, 3);
        assert.equal(await runtime.dlq.getJobCountByTypes('waiting'), 1);
        await request('GET', '/admin/notifications?status=dead', user, undefined, 403);
        const dead = await request('GET', '/admin/notifications?status=dead', admin, undefined, 200);
        assert.equal(dead.count, 1); assert.equal(dead.data[0].attempts, 3);
        const reminder = await Notification.findOne({booking: booking._id, event: 'reminder'});
        const job = await runtime.queue.getJob(reminder.id);
        await job.remove();
        await runtime.tick();
        const restoredJob = await runtime.queue.getJob(reminder.id);
        assert.ok(restoredJob, 'Queued outbox entry recovers a lost Redis job');
        await restoredJob.changeDelay(0);
        await waitFor(async () => (await Notification.findById(reminder.id)).status === 'logged');
        await Booking.updateOne({_id: booking._id}, {$set: {pickupDate: new Date(Date.now() - 1800001)}});
        await runtime.tick();
        await waitFor(async () => (await Notification.findOne({booking: booking._id, event: 'no-show'}))?.status === 'logged');
    } finally {
        await runtime.worker.close();
        await runtime.queue.obliterate({force: true}); await runtime.dlq.obliterate({force: true});
        await runtime.close();
    }
});

test('stale delayed notifications are skipped after cancellation and queues recover pending events', async () => {
    const booking = await createCore();
    await request('POST', `/bookings/${booking._id}/cancel`, user, {}, 200);
    let sends = 0;
    const runtime = await startWorker({prefix: `sushiro-stale-${Date.now()}`, intervalMs: 50, send: async () => { sends++; return 'logged'; }});
    try {
        await waitFor(async () => (await Notification.findOne({booking: booking._id, event: 'confirmation'})).status === 'skipped');
        assert.equal(sends, 0);
    } finally {
        await runtime.worker.close();
        await runtime.queue.obliterate({force: true}); await runtime.dlq.obliterate({force: true});
        await runtime.close();
    }
});
