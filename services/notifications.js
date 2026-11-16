const {Queue, Worker} = require('bullmq');
const IORedis = require('ioredis');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Branch = require('../models/Branch');
const {markNoShows} = require('./rental');

const request = async (url, options) => {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`Notification provider returned HTTP ${response.status}`);
};
const bookingEmail = (notification, user, booking) => {
    const messages = {
        confirmation: ['ยืนยันการจองรถสำเร็จ', 'ขอบคุณที่ใช้บริการ Sushiro รายละเอียดการจองของคุณมีดังนี้'],
        reminder: ['แจ้งเตือนการรับรถ', 'ใกล้ถึงเวลารับรถแล้ว กรุณาตรวจสอบรายละเอียดการจองด้านล่าง'],
        'no-show': ['แจ้งสถานะไม่มารับรถ', 'รายการจองนี้ถูกบันทึกว่าไม่มารับรถตามกำหนด กรุณาติดต่อผู้ให้บริการหากต้องการความช่วยเหลือ']
    };
    const [title, intro] = messages[notification.event];
    const date = value => value ? new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
        timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(value)) + ' น.' : 'ไม่ระบุ';
    const provider = booking.provider || {};
    const car = booking.car || {};
    const branch = car.branch || {};
    const statuses = {confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิกแล้ว', 'no-show': 'ไม่มารับรถ', completed: 'เสร็จสิ้น'};
    const rows = [
        ['หมายเลขการจอง', booking.id],
        ['สถานะการจอง', statuses[booking.status] || booking.status],
        ['วันที่ทำรายการ', date(booking.createdAt)],
        ['ชื่อผู้จอง', user.name],
        ['อีเมล', user.email],
        ['เบอร์โทรผู้จอง', user.tel],
        ['วันและเวลารับรถ', date(booking.pickupDate)],
        ['วันและเวลาคืนรถ', date(booking.returnDate)],
        ['ผู้ให้บริการ', provider.name],
        ['รถที่จอง', [car.brand, car.model].filter(Boolean).join(' ')],
        ['ทะเบียนรถ', car.licensePlate],
        ['สาขารับรถ', branch.name],
        ['สถานที่รับรถ', branch.address || provider.address],
        ['โทรติดต่อผู้ให้บริการ', provider.tel],
        ['ยอดรวมการจอง', new Intl.NumberFormat('th-TH', {style: 'currency', currency: 'THB'}).format((booking.totalPriceSatang || 0) / 100)]
    ].map(([label, value]) => [label, value == null || value === '' ? 'ไม่ระบุ' : String(value)]);
    const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
    const footer = 'วันและเวลาทั้งหมดเป็นเวลาประเทศไทย (UTC+7) กรุณาเก็บอีเมลนี้ไว้ใช้อ้างอิงเมื่อติดต่อผู้ให้บริการ';
    return {
        subject: `Sushiro | ${title} | ${booking.id}`,
        text: `${title}\n\nเรียน คุณ${user.name || 'ลูกค้า'}\n${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${footer}\nทีมงาน Sushiro Rental Car`,
        html: `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Tahoma,Arial,sans-serif;color:#1f2937;line-height:1.7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<tr><td style="padding:24px;background:#b91c1c;color:#ffffff"><div style="font-size:14px;letter-spacing:2px">SUSHIRO RENTAL CAR</div><h1 style="margin:8px 0 0;font-size:24px">${escape(title)}</h1></td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 12px">เรียน คุณ${escape(user.name || 'ลูกค้า')}</p><p style="margin:0 0 20px">${escape(intro)}</p>
<h2 style="margin:0 0 12px;font-size:18px">รายละเอียดการจอง</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows.map(([label, value]) => `<tr><th scope="row" align="left" valign="top" style="width:40%;padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:normal">${escape(label)}</th><td valign="top" style="padding:10px 8px;border-bottom:1px solid #e5e7eb;overflow-wrap:anywhere;word-break:break-word">${escape(value)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 0;color:#6b7280;font-size:12px">${escape(footer)}</p><p style="margin:12px 0 0">ทีมงาน Sushiro Rental Car</p></td></tr></table>
</td></tr></table></body></html>`
    };
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
        await booking.populate([
            {path: 'provider', select: 'name address tel'},
            {path: 'car', select: 'brand model licensePlate branch', populate: {path: 'branch', model: Branch, select: 'name address'}}
        ]);
        const email = bookingEmail(notification, user, booking);
        await request('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST', headers: {Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({personalizations: [{to: [{email: user.email}]}], from: {email: process.env.EMAIL_FROM, name: 'Sushiro Rental Car'}, subject: email.subject, content: [{type: 'text/plain', value: email.text}, {type: 'text/html', value: email.html}]})
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
