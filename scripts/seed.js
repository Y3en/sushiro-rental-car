const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: './config/config.env' });

const User = require('../models/User');
const Provider = require('../models/Provider');

const providers = [
    { name: 'Sushiro Rent-A-Car Bangkok', address: '123 Rama IV Rd, Pathum Wan, Bangkok 10330', tel: '021234567' },
    { name: 'Sushiro Rent-A-Car Chiang Mai', address: '45 Nimmanhaemin Rd, Mueang, Chiang Mai 50200', tel: '053234567' },
    { name: 'Sushiro Rent-A-Car Phuket', address: '78 Thalang Rd, Mueang, Phuket 83000', tel: '076234567' },
];

//Safe to run more than once: only creates what does not exist yet
const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const { ADMIN_NAME, ADMIN_TEL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
            throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in config/config.env');
        }

        if (await User.findOne({ email: ADMIN_EMAIL })) {
            console.log(`Admin ${ADMIN_EMAIL} already exists, skipped`);
        } else {
            await User.create({
                name: ADMIN_NAME || 'Admin',
                tel: ADMIN_TEL,
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                role: 'admin'
            });
            console.log(`Created admin ${ADMIN_EMAIL}`);
        }

        for (const p of providers) {
            if (await Provider.findOne({ name: p.name })) {
                console.log(`Provider "${p.name}" already exists, skipped`);
            } else {
                await Provider.create(p);
                console.log(`Created provider "${p.name}"`);
            }
        }
    } catch (err) {
        console.log('Seed failed: ' + err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

seed();
