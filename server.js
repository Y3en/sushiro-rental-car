const express = require('express');
const dotenv = require('dotenv');
const cookieParser=require('cookie-parser');
const connectDB = require('./config/db');

dotenv.config({ path: './config/config.env' });

connectDB();

//Route files
const providers = require('./routes/providers');
const auth = require('./routes/auth');
const appointments = require('./routes/appointments');
const branches = require('./routes/branches');
const cars = require('./routes/cars');

const app = express();

app.set('query parser', 'extended');

app.use(express.json());

app.use(cookieParser());

//Mount routers
app.use('/api/v1/providers', providers);
app.use('/api/v1/auth', auth);
app.use('/api/v1/appointments', appointments);
app.use('/api/v1/branches', branches);
app.use('/api/v1/cars', cars);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('Server running in ', process.env.NODE_ENV, ' mode on port ' + PORT);
});

process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
