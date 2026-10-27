# Sushiro - Rental Car Booking REST API

REST API for booking rental cars, built for 2110503 SW Dev Practice (Group 7).
Node.js + Express + MongoDB (Mongoose), JWT auth with `user` and `admin` roles. No frontend; test with Postman/Newman.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `config/config.env` and fill in the values (needs a running MongoDB).
3. Seed the admin account and sample providers: `npm run seed` (safe to re-run).
4. Start the server: `npm start` (or `npm run dev` with nodemon).

## Endpoints (so far)

Base path: `/api/v1`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Public |
| GET | `/auth/me` | Logged in |
| GET | `/providers`, `/providers/:id` | Public (login required from issue #3) |
| POST, PUT, DELETE | `/providers`, `/providers/:id` | Admin |
| GET, POST | `/appointments`, `/providers/:providerId/appointments` | Logged in (becomes `/bookings`) |
| GET, PUT, DELETE | `/appointments/:id` | Owner or admin |

Deleting a provider also deletes its bookings.
