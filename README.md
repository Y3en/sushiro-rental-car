# Sushiro - Rental Car Booking REST API

REST API for booking rental cars, built for 2110503 SW Dev Practice (Group 7).
Node.js + Express + MongoDB (Mongoose), JWT auth with `user` and `admin` roles. No frontend; test with Postman/Newman.

Requirements and use cases: [docs/requirements-and-use-cases.md](docs/requirements-and-use-cases.md)

## Run on localhost

Needs Node.js 20+ and Docker (MongoDB must run as a replica set for transactions, and the notification queue needs Redis).

1. `npm install`
2. `docker compose up -d --wait` starts MongoDB (port 27019, replica set `rs0`) and Redis (port 6381).
3. Copy `.env.example` to `config/config.env` and set `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
4. `npm run seed` creates the admin account, 3 providers, 3 branches and 9 cars (safe to re-run).
5. `npm start` starts the API on http://localhost:5000
6. `npm run worker` in a second terminal starts the notification worker and the no-show scheduler.

By default `NOTIFICATION_MODE=log`, so emails and SMS are written to the log and never sent. Set it to `live` with SendGrid/Twilio keys to send for real.

## Tests

| Command | What it runs |
| --- | --- |
| `npm test` | Integration tests (Node test runner) against MongoDB and Redis from `compose.yaml` |
| `npm run test:postman` | Starts the app on a random port and runs `tests/PM.json` with Newman on a throw-away `_test` database |
| `npx newman run tests/PM.json --env-var baseUrl=http://localhost:5000/api/v1 --env-var adminEmail=<ADMIN_EMAIL> --env-var adminPassword=<ADMIN_PASSWORD>` | The same collection against the server you started yourself |

## Endpoints

Base path: `/api/v1`. "Logged in" means a `Authorization: Bearer <token>` header (or the token cookie).

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Public |
| GET | `/auth/me`, `/auth/logout` | Logged in |
| GET | `/providers`, `/providers/:id` | Logged in |
| POST, PUT, DELETE | `/providers`, `/providers/:id` | Admin |
| GET | `/branches`, `/providers/:providerId/branches`, `/branches/:id` | Logged in |
| POST | `/providers/:providerId/branches` | Admin |
| PUT, DELETE | `/branches/:id` | Admin |
| GET | `/cars`, `/branches/:branchId/cars`, `/cars/:id` | Logged in |
| GET | `/cars/availability?branch=&pickupDate=&returnDate=` | Logged in |
| POST | `/branches/:branchId/cars` | Admin |
| PUT, DELETE | `/cars/:id` | Admin |
| POST | `/holds` (10-minute checkout hold) | Logged in |
| DELETE | `/holds/:id` | Hold owner |
| GET, POST | `/bookings` | Logged in (own bookings) |
| GET, PUT, DELETE | `/bookings/:id` | Owner |
| POST | `/bookings/:id/cancel`, `/bookings/:id/check-in` | Owner |
| GET | `/admin/bookings` | Admin |
| GET, PUT, DELETE | `/admin/bookings/:id` | Admin |
| POST | `/admin/bookings/:id/cancel`, `/check-in`, `/complete` | Admin |
| GET | `/admin/notifications?status=` | Admin |

`/appointments` and `/providers/:providerId/appointments` are kept as legacy aliases of the booking routes.

Deleting a provider also deletes its branches, cars and bookings. Deleting a branch also deletes its cars.

## Booking rules

- At most 3 confirmed bookings per user (admins are exempt).
- A booking for a specific car needs a valid 10-minute checkout hold on that car and those dates.
- Cancellation fee by time before pickup: more than 24 h = free, 2 to 24 h = 50%, under 2 h = 100%.
- Check-in is open from pickup time to 30 minutes after. A confirmed booking with no check-in after that becomes `no-show`, the car is released and the user is notified.
- Notifications are retried 3 times and then moved to a dead-letter queue.
