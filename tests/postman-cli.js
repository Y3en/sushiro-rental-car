// Runs tests/PM.json with the Postman CLI against a server you started yourself (npm start).
// Admin login comes from config/config.env (ADMIN_EMAIL, ADMIN_PASSWORD); BASE_URL overrides the target.
const path = require('path');
const {spawnSync} = require('child_process');
require('dotenv').config({path: path.join(__dirname, '..', 'config', 'config.env'), quiet: true});
const {ADMIN_EMAIL, ADMIN_PASSWORD, PORT = 5000, BASE_URL = `http://localhost:${PORT}/api/v1`} = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in config/config.env (see .env.example)');
    process.exit(1);
}
const quote = value => `"${value.replace(/"/g, '\\"')}"`;
const args = ['collection', 'run', quote(path.join(__dirname, 'PM.json')),
    '--env-var', quote(`baseUrl=${BASE_URL}`),
    '--env-var', quote(`adminEmail=${ADMIN_EMAIL}`),
    '--env-var', quote(`adminPassword=${ADMIN_PASSWORD}`)];
const result = spawnSync('postman', args, {stdio: 'inherit', shell: true});
if (result.error) console.error(`Could not run the Postman CLI: ${result.error.message}`);
process.exit(result.status ?? 1);
