const {Queue, Worker} = require('bullmq');
const IORedis = require('ioredis');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const User = require('../models/User');
const {markNoShows} = require('./rental');

const request = async (url, options) => {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`Notification provider returned HTTP ${response.status}`);
};
const deliver = async (notification, user, booking) => {
    const mode = process.env.NOTIFICATION_MODE || 'log';
    const text = `Sushiro booking ${booking.id}: ${notification.event}. Pickup ${booking.pickupDate.toISOString()}.`;
    if (mode === 'log') {
        console.log(JSON.stringify({notification: notification.id, event: notification.event, channel: notification.channel, mode: 'log'}));
        return 'logged';
    }
    if (mode !== 'live') throw new Error('NOTIFICATION_MODE must be log or live');
    if (notification.channel === 'email') {
        if (!process.env.SENDGRID_API_KEY || !process.env.EMAIL_FROM) throw new Error('SendGrid credentials missing');
        await request('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST', headers: {Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({personalizations: [{to: [{email: user.email}]}], from: {email: process.env.EMAIL_FROM}, subject: `Sushiro ${notification.event}`, content: [{type: 'text/plain', value: text}]})
        });
    } else {
        const {TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, SMS_FROM: from} = process.env;
        if (!sid || !token || !from) throw new Error('Twilio credentials missing');
        const to = /^0\d{9}$/.test(user.tel) ? `+66${user.tel.slice(1)}` : user.tel;
        if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error('SMS recipient must be an E.164 telephone number');
        await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST', headers: {Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({To: to, From: from, Body: text})
        });
    }
    return 'sent';
};

exports.startWorker = async ({send = deliver, intervalMs = 1000, backoffMs = 1000, prefix = 'sushiro'} = {}) => {
    const channels = (process.env.NOTIFICATION_CHANNELS || 'email').split(',');
    if (channels.some(channel => !['email', 'sms'].includes(channel)) || new Set(channels).size !== channels.length) throw new Error('Use distinct email,sms notification channels');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {maxRetriesPerRequest: null});
    connection.on('error', error => console.error(`Redis: ${error.message}`));
    const queue = new Queue('notifications', {connection, prefix});
    const dlq = new Queue('notifications-dead', {connection, prefix});
    const deadLetter = async (notification, error) => {
        await dlq.add(notification.event, {notificationId: notification.id, error}, {jobId: notification.id});
        await Notification.updateOne({_id: notification._id, status: {$nin: ['sent', 'logged', 'skipped']}}, {$set: {status: 'dead', lastError: error}});
    };
    const worker = new Worker('notifications', async job => {
        const notification = await Notification.findById(job.data.notificationId);
        if (!notification || ['sent', 'logged', 'skipped', 'dead'].includes(notification.status)) return;
        const booking = await Booking.findById(notification.booking);
        const user = await User.findById(notification.user);
        const expected = notification.event === 'no-show' ? 'no-show' : 'confirmed';
        if (!booking || !user || booking.status !== expected || booking.notificationVersion !== notification.version || (notification.event === 'reminder' && booking.checkedInAt)) {
            await Notification.updateOne({_id: notification._id}, {$set: {status: 'skipped'}});
            return;
        }
        try {
            const status = await send(notification, user, booking);
            if (!['sent', 'logged'].includes(status)) throw new Error('Transport must report sent or logged');
            await Notification.updateOne({_id: notification._id}, {$set: {status, attempts: job.attemptsMade + 1, deliveredAt: new Date()}, $unset: {lastError: 1}});
        } catch (error) {
            await Notification.updateOne({_id: notification._id}, {$set: {attempts: job.attemptsMade + 1, lastError: error.message}});
            if (job.attemptsMade + 1 >= 3) await deadLetter(notification, error.message);
            throw error;
        }
    }, {connection, prefix, concurrency: 5});
    worker.on('error', error => console.error(`Notification worker: ${error.message}`));
    let busy = false;
    const tick = async () => {
        if (busy) return;
        busy = true;
        try {
            await markNoShows();
            const pending = await Notification.find({status: {$in: ['pending', 'queued']}}).sort('dueAt').limit(500);
            for (const notification of pending) {
                const job = await queue.getJob(notification.id);
                if (job && await job.getState() === 'failed') {
                    await deadLetter(notification, job.failedReason);
                    continue;
                }
                if (!job) await queue.add(notification.event, {notificationId: notification.id}, {
                    jobId: notification.id, delay: Math.max(0, +notification.dueAt - Date.now()), attempts: 3,
                    backoff: {type: 'exponential', delay: backoffMs}
                });
                await Notification.updateOne({_id: notification._id, status: 'pending'}, {$set: {status: 'queued'}});
            }
        } finally { busy = false; }
    };
    await worker.waitUntilReady();
    await tick();
    const timer = setInterval(() => tick().catch(error => console.error(`Worker maintenance: ${error.message}`)), intervalMs);
    return {queue, dlq, worker, tick, close: async () => {
        clearInterval(timer);
        while (busy) await new Promise(resolve => setTimeout(resolve, 20));
        await worker.close(); await queue.close(); await dlq.close(); await connection.quit();
    }};
};
