# Class Diagram and Sequence Diagrams

Sushiro Rental Car Booking REST API, 2110503 SW Dev Practice, Group 7.
Requirements and use cases: [requirements-and-use-cases.md](requirements-and-use-cases.md).

## 1. Class diagram (UML profile)

The profile uses these stereotypes:

| Stereotype | Meaning |
| --- | --- |
| `<<entity>>` | Mongoose model stored in a MongoDB collection |
| `<<service>>` | Module with business rules; every state change runs in a MongoDB transaction |
| `<<controller>>` | Express handler that reads the request and calls a service |
| `<<middleware>>` | Express middleware (authentication and authorization) |
| `<<worker>>` | Background process (BullMQ worker and scheduler) |
| `<<queue>>` | BullMQ queue in Redis |
| `<<enumeration>>` | Fixed set of values |

Attribute types are Mongoose types. `ObjectId` attributes are references to another entity. Money is stored in satang (integer).

```mermaid
classDiagram
    direction LR

    class User {
        <<entity>>
        +String name
        +String tel
        +String email
        +Role role
        -String password
        -Number bookingLock
        +Number tokenVersion
        +Date createdAt
        +getSignedJwtToken() String
        +matchPassword(entered) Boolean
    }
    class Provider {
        <<entity>>
        +String name
        +String address
        +String tel
        -Number bookingLock
        +Date createdAt
    }
    class Branch {
        <<entity>>
        +ObjectId provider
        +String name
        +String address
        +String tel
    }
    class Car {
        <<entity>>
        +ObjectId provider
        +ObjectId branch
        +String brand
        +String model
        +String licensePlate
        +Number pricePerDay
        -Number bookingLock
        +Date createdAt
    }
    class Booking {
        <<entity>>
        +ObjectId user
        +ObjectId provider
        +ObjectId car
        +Date pickupDate
        +Date returnDate
        +Number totalPriceSatang
        +Number cancellationFeeSatang
        +Number refundSatang
        +Date cancelledAt
        +Date checkedInAt
        +Date deletedAt
        +Number notificationVersion
        +BookingStatus status
        +Date createdAt
    }
    class Hold {
        <<entity>>
        +ObjectId user
        +ObjectId car
        +Date pickupDate
        +Date returnDate
        +Date expiresAt
    }
    class Notification {
        <<entity>>
        +ObjectId booking
        +ObjectId user
        +Number version
        +NotificationEvent event
        +Channel channel
        +Date dueAt
        +NotificationStatus status
        +Number attempts
        +String lastError
        +Date deliveredAt
    }

    class Role {
        <<enumeration>>
        user
        admin
    }
    class BookingStatus {
        <<enumeration>>
        confirmed
        cancelled
        no-show
        completed
    }
    class NotificationEvent {
        <<enumeration>>
        confirmation
        reminder
        no-show
    }
    class Channel {
        <<enumeration>>
        email
        sms
    }
    class NotificationStatus {
        <<enumeration>>
        pending
        queued
        sent
        logged
        skipped
        dead
    }

    class AuthMiddleware {
        <<middleware>>
        +protect(req, res, next)
        +authorize(roles) Function
    }
    class AuthController {
        <<controller>>
        +register()
        +login()
        +logout()
        +getMe()
    }
    class CatalogueController {
        <<controller>>
        +providers: CRUD
        +branches: CRUD
        +cars: CRUD
    }
    class BookingController {
        <<controller>>
        +createBooking()
        +getOwnBookings()
        +getAllBookings()
        +updateBooking()
        +deleteBooking()
        +cancelBooking()
        +checkIn()
        +completeBooking()
        +getAvailability()
        +createHold()
        +releaseHold()
    }
    class RentalService {
        <<service>>
        +createHold(actor, body) Hold
        +releaseHold(actor, holdId)
        +listAvailable(query) Car[]
        +createBooking(actor, body) Booking
        +updateBooking(actor, id, body, admin) Booking
        +deleteBooking(actor, id, admin)
        +cancelBooking(actor, id, admin) Booking
        +checkIn(actor, id, admin) Booking
        +completeBooking(actor, id) Booking
        +markNoShows(now) Number
        +cancellationAmounts(total, pickup, now) Fee
    }
    class InventoryService {
        <<service>>
        +createBranch(provider, body) Branch
        +createCar(branchId, body) Car
        +remove(kind, id)
    }
    class NotificationWorker {
        <<worker>>
        +startWorker(options)
        -tick()
        -deliver(notification, user, booking) Status
        -deadLetter(notification, error)
    }
    class NotificationsQueue {
        <<queue>>
        attempts = 3
        backoff = exponential
    }
    class DeadLetterQueue {
        <<queue>>
        notifications-dead
    }

    Provider "1" --> "0..*" Branch : has
    Provider "1" --> "0..*" Car : owns
    Branch "1" --> "0..*" Car : stocks
    User "1" --> "0..*" Booking : makes
    Provider "1" --> "0..*" Booking : receives
    Car "0..1" <-- "0..*" Booking : reserves
    User "1" --> "0..*" Hold : takes
    Car "1" --> "0..*" Hold : held by
    Booking "1" --> "0..*" Notification : triggers
    User "1" --> "0..*" Notification : receives

    User ..> Role
    Booking ..> BookingStatus
    Notification ..> NotificationEvent
    Notification ..> Channel
    Notification ..> NotificationStatus

    AuthController ..> User
    AuthController ..> AuthMiddleware : protected by
    CatalogueController ..> InventoryService
    CatalogueController ..> AuthMiddleware : protected by
    BookingController ..> RentalService
    BookingController ..> AuthMiddleware : protected by
    RentalService ..> Booking
    RentalService ..> Hold
    RentalService ..> Car
    RentalService ..> Notification : creates
    InventoryService ..> Provider
    InventoryService ..> Branch
    InventoryService ..> Car
    NotificationWorker ..> RentalService : markNoShows
    NotificationWorker ..> Notification
    NotificationWorker --> NotificationsQueue : enqueue
    NotificationWorker --> DeadLetterQueue : after 3 failures
```

Design notes:

- `bookingLock` on User, Provider and Car is a counter incremented inside a transaction. It forces concurrent requests on the same user, provider or car to serialize, so a car is never double booked and a user never exceeds 3 confirmed bookings.
- A `Hold` expires through a MongoDB TTL index on `expiresAt`. Availability also checks `expiresAt` itself, so an expired hold never blocks a car even before MongoDB removes it.
- `notificationVersion` on Booking is copied into each Notification. If the booking changes (edit, cancel, complete, no-show), older notifications no longer match and the worker marks them `skipped`.
- A Booking is never removed from the collection. Delete sets `deletedAt`.

## 2. Sequence diagrams

### 2.1 Register, log in and log out

```mermaid
sequenceDiagram
    actor C as Client
    participant A as AuthController
    participant U as User (MongoDB)
    participant M as AuthMiddleware

    C->>A: POST /auth/register (name, tel, email, password)
    A->>U: create user (role = user, password hashed with bcrypt)
    U-->>A: user
    A-->>C: 201 token (JWT with id and tokenVersion)

    C->>A: POST /auth/login (email, password)
    A->>U: find by email, matchPassword
    alt wrong email or password
        A-->>C: 401 Invalid credentials
    else correct
        A-->>C: 200 token
    end

    C->>M: GET /auth/logout (Bearer token)
    M->>U: verify token, load user
    M->>A: next()
    A->>U: tokenVersion + 1
    A-->>C: 200 success
    Note over C,U: Every token issued before logout carries the old tokenVersion, so protect() rejects it with 401
```

### 2.2 Check availability, hold a car and create a booking

```mermaid
sequenceDiagram
    actor C as User
    participant B as BookingController
    participant R as RentalService
    participant DB as MongoDB (transaction)
    participant N as Notification collection

    C->>B: GET /cars/availability?branch&pickupDate&returnDate
    B->>R: listAvailable(query)
    R->>DB: cars of the branch without overlapping confirmed booking or live hold
    DB-->>C: free cars (a snapshot, not a guarantee)

    C->>B: POST /holds (car, pickupDate, returnDate)
    B->>R: createHold(user, body)
    R->>DB: lock car and provider (bookingLock + 1)
    R->>DB: overlapping booking or live hold on this car?
    alt car unavailable
        R-->>C: 409 Car is unavailable for this rental period
    else free
        R->>DB: create Hold (expiresAt = now + 10 min)
        R-->>C: 201 hold
    end

    C->>B: POST /bookings (provider, car, holdId, pickupDate, returnDate)
    B->>R: createBooking(user, body)
    R->>DB: lock user and provider
    alt user is not admin and already has 3 confirmed bookings
        R-->>C: 400 Maximum of 3 confirmed bookings reached
    end
    R->>DB: lock car, find the user's live hold for this car and dates
    alt hold missing or expired
        R-->>C: 409 Checkout hold expired or does not match
    else hold valid
        R->>DB: re-check availability (ignoring this hold), delete hold
        R->>DB: create Booking (confirmed, price = pricePerDay x days)
        R->>N: create confirmation (now) and reminder (24 h before pickup)
        R-->>C: 201 booking
    end
```

Booking only a provider (no car) skips the hold steps.

### 2.3 Send notifications with retry and dead-letter queue

```mermaid
sequenceDiagram
    participant W as NotificationWorker (tick, every 1 s)
    participant DB as MongoDB
    participant Q as BullMQ queue (Redis)
    participant P as Job processor
    participant G as Email / SMS gateway
    participant D as Dead-letter queue

    loop every tick
        W->>DB: pending or queued notifications ordered by dueAt
        W->>Q: add job (delay = dueAt - now, attempts = 3, exponential backoff)
        W->>DB: status = queued
    end

    Q->>P: job is due
    P->>DB: load notification, booking and user
    alt booking changed (version differs, wrong status) or reminder after check-in
        P->>DB: status = skipped
    else still valid
        P->>G: send message
        alt delivered
            G-->>P: ok
            P->>DB: status = sent (or logged in log mode), deliveredAt
        else failed
            G-->>P: error
            P->>DB: attempts + 1, lastError
            P-->>Q: throw, BullMQ retries after backoff
            Note over P,Q: after the 3rd failed attempt
            P->>D: add job (notificationId, error)
            P->>DB: status = dead
        end
    end
```

Notifications are written to MongoDB inside the booking transaction, so they are not lost when Redis is down. The worker enqueues them when Redis is back.

### 2.4 Cancel a booking with a fee

```mermaid
sequenceDiagram
    actor C as User or Admin
    participant B as BookingController
    participant R as RentalService
    participant DB as MongoDB (transaction)
    participant N as Notification collection

    C->>B: POST /bookings/:id/cancel
    B->>R: cancelBooking(actor, id, isAdmin)
    R->>DB: find booking (not deleted)
    alt user is not the owner and not admin
        R-->>C: 403 Not authorized
    else already cancelled
        R-->>C: 200 booking (no further effect)
    else not confirmed or already checked in
        R-->>C: 409 Booking cannot be cancelled
    else
        R->>DB: lock car
        Note over R: hours = pickupDate - now<br/>more than 24 h: fee 0%<br/>2 to 24 h: fee 50%<br/>less than 2 h: fee 100%<br/>refund = total - fee
        R->>DB: status = cancelled, cancelledAt, fee, refund, notificationVersion + 1
        R-->>C: 200 booking
        Note over R,N: the car is free again because only confirmed bookings block availability
    end
```

### 2.5 Check in, complete and automatic no-show

```mermaid
sequenceDiagram
    actor C as User or Admin
    participant R as RentalService
    participant DB as MongoDB (transaction)
    participant W as NotificationWorker
    participant N as Notification collection

    C->>R: POST /bookings/:id/check-in
    alt now is before pickup, or 30 minutes after pickup or later
        R-->>C: 409 Check-in is available from pickup time until 30 minutes after pickup
    else inside the window
        R->>DB: checkedInAt = now
        R-->>C: 200 booking
    end

    C->>R: POST /admin/bookings/:id/complete (admin only)
    alt not checked in
        R-->>C: 409 Only checked-in rentals can be completed
    else checked in
        R->>DB: status = completed, notificationVersion + 1
        R-->>C: 200 booking
    end

    loop every worker tick
        W->>R: markNoShows(now)
        R->>DB: confirmed bookings with no check-in and pickupDate <= now - 30 min
        R->>DB: for each: lock car, status = no-show, notificationVersion + 1
        R->>N: create no-show notification (email to the user)
        Note over R,DB: the car is released because only confirmed bookings block availability
    end
```
