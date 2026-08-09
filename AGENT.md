# Vehicle Rental Management System - Development Agent Instructions

## Overview
You are tasked with building an enterprise-grade, highly scalable, and modular REST API backend for a Vehicle Rental Management System using Node.js, TypeScript, PostgreSQL with Knex.js, OpenSearch, Kafka, and Redis.

## Technology Stack
- **Runtime:** Node.js (Latest LTS)
- **Language:** TypeScript (Strict type checking, explicit DTOs and request/response typing)
- **Framework:** Express.js
- **Database & Query Builder:** PostgreSQL managed via Knex.js (using connection pools, migrations, and raw SQL/advanced query builders for core transactional data and reporting)
- **Search & Filtering Engine:** OpenSearch for high-performance vehicle search by name and category filtering across large datasets
- **Validation:** Joi
- **Authentication & Security:** JSON Web Tokens (JWT), Bcrypt for password hashing, Express-Rate-Limit for auth routes
- **File Management:** Multer for local photo storage
- **Caching & High Concurrency:** Redis for caching and availability checks
- **Messaging & Event-Driven:** Apache Kafka for asynchronous background workflows and event logging
- **Documentation:** Swagger / OpenAPI
- **Quality Control:** ESLint and Prettier

## Architectural Patterns
- **Modular Feature Architecture:** Each domain (`auth`, `vehicles`, `rentals`, `reports`) is self-contained under `src/modules/` with its own controller, service, repository, routes, interfaces, and validation schemas.
- **Service Layer & OOP:** Business logic must reside entirely inside Service classes. Controllers only handle HTTP parsing, invocation, and response formatting.
- **Repository Pattern:** Database data-fetching and custom SQL queries are isolated inside Repository classes.
- **Transactional Integrity:** Knex database transactions must wrap critical operations (such as availability date-overlap checks and insert operations) to eliminate race conditions and double-bookings.
- **Event-Driven Messaging:** Kafka producers and consumers (`src/kafka/`) handle asynchronous background jobs.

# Redis, OpenSearch & Kafka Architecture

## 1. Redis Caching & Session Strategy
* **Staff Session Cache (Multi-device concurrent sessions)**
  * **Key Pattern:** `session:staff:{userId}:{deviceId}`
  * **Function:** Caches active session payloads `{ deviceId, ip, deviceName, staff: { id, email, name } }` with a 7-day TTL (matching the Refresh Token expiry) to support concurrent multi-device logins and verify session state.

* **Vehicle List Cache (Pagination)**
  * **Key Pattern:** `vehicles:list`
  * **Function:** Stores an ordered cache of up to 1,000 vehicle IDs (integer IDs) using cursor pagination to handle high-read requests efficiently.

* **Vehicle Details Cache**
  * **Key Pattern:** `vehicle:{id}`
  * **Function:** Caches individual vehicle detail objects as JSON for instant lookups without hitting the database.

## 2. OpenSearch Strategy (Search & Filtering)
* **Index Name:** `vehicles_index`
* **Function:** Handles lightning-fast full-text search by vehicle name and category filtering for the vehicle fleet, bypassing heavy relational database lookups for search queries.

## 3. Kafka Event-Driven Strategy
* **Topic:** `rental-events`
* **Event Type:** `rental.created`
* **Function:** Publishes a lightweight message upon successful booking creation, allowing background workers to handle asynchronous tasks (such as sending customer notifications and logging) without blocking the main API thread.

## Project File & Folder Structure
```text
.dockerignore
.env.example
Dockerfile
eslint.config.mjs
package-lock.json
package.json
src/
├── app.container.ts
├── app.ts
├── config/
│   ├── db.ts
│   ├── env.ts
│   ├── kafka.ts
│   └── redis.ts
├── database/
│   ├── migrations/
│   └── seeds/
├── kafka/
│   ├── handlers/
│   │   └── rental_event.handler.ts
│   └── worker.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── upload.middleware.ts
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.interface.ts
│   │   ├── auth.repository.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   └── auth.validation.ts
│   ├── vehicles/
│   │   ├── vehicle.controller.ts
│   │   ├── vehicle.interface.ts
│   │   ├── vehicle.repository.ts
│   │   ├── vehicle.routes.ts
│   │   ├── vehicle.service.ts
│   │   └── vehicle.validation.ts
│   ├── rentals/
│   │   ├── rental.controller.ts
│   │   ├── rental.interface.ts
│   │   ├── rental.repository.ts
│   │   ├── rental.routes.ts
│   │   ├── rental.service.ts
│   │   └── rental.validation.ts
│   └── reports/
│       ├── report.controller.ts
│       ├── report.interface.ts
│       ├── report.repository.ts
│       ├── report.routes.ts
│       └── report.service.ts
├── utils/
│   ├── appError.ts
│   └── sendResponse.ts
├── server.ts
└── worker.ts
tsconfig.json