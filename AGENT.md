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
- **File Management:** Local filesystem (`fs`) image storage served via Express static middleware using configurable `APP_DOMAIN` and `UPLOAD_PATH`
- **Caching & Distributed Locks:** Redis for session caching, vehicle list/details cache (`vehicle:{id}`), date slot TTL reservations (`rental:slot:{vehicle_id}:{YYYY-MM-DD}`), and distributed mutex concurrency locks (`SET NX PX` + Lua script) for multi-container deployments
- **Messaging & Event-Driven:** Apache Kafka for asynchronous background workflows, batch processing (`rental-batch-queue`), and Dead Letter Queue (`rental-dlq`) fault isolation
- **Documentation:** Swagger / OpenAPI
- **Quality Control:** ESLint and Prettier

## Architectural Patterns
- **Modular Feature Architecture:** Each domain (`auth`, `vehicles`, `rentals`, `reports`) is self-contained under `src/modules/` with its own controller, service, repository, routes, interfaces, and validation schemas.
- **Service Layer & OOP:** Business logic resides inside Service classes. Controllers only handle HTTP request parsing, invocation, and response formatting.
- **Repository Pattern:** Database data-fetching and bulk SQL queries are isolated inside Repository classes.
- **Cache-First Vehicle Lookup & Automatic Rate Calculation:** `RentalService` checks Redis `vehicle:{id}` cache first for `daily_rate` (falling back to DB and populating cache), then automatically computes `total_amount` server-side (`daily_rate * duration_days`).
- **Distributed Concurrency Control:** Redis atomic distributed locking prevents concurrent booking requests across multi-container instances for target date slots.
- **Transactional Integrity:** Knex database transactions wrap critical bulk operations for atomic commits.
- **Event-Driven Messaging & Binary Split DLQ:** High-throughput Kafka batch consumer (`src/kafka/rental.handler.ts`) processes rentals (100 items / 2s window) with Binary Split Algorithm (divide & conquer) to isolate poisonous records into `rental-dlq` while bulk-committing valid records.

# Redis, OpenSearch & Kafka Architecture

## 1. Redis Caching, Slots & Distributed Lock Strategy
* **Staff Session Cache (Multi-device concurrent sessions)**
  * **Key Pattern:** `session:staff:{userId}:{deviceId}`
  * **Function:** Caches active session payloads with a 7-day TTL matching Refresh Token expiry.

* **Vehicle List & Details Cache**
  * **Key Pattern:** `vehicles:index` (Sorted Set ZSET), `vehicles:index:{category}`, and `vehicle:{id}`
  * **Function:** Enables fast cursor pagination, instant vehicle lookups, and zero-DB-latency rate calculations in rental processing.

* **Distributed Concurrency Lock**
  * **Key Pattern:** `rental:lock:{vehicle_id}:{start_date}:{end_date}`
  * **Function:** Uses atomic `SET NX PX` with UUID tokens and Lua script release to prevent concurrent booking collisions across multiple container instances for identical date ranges.

* **Availability Slot Check & TTL**
  * **Key Pattern:** `rental:slot:{vehicle_id}:{YYYY-MM-DD}`
  * **Function:** Reserves date slots with calculated TTLs per day (midnight end + 24h buffer) so past date slot data automatically expires. Released on rental deletion or cancellation.

## 2. OpenSearch Strategy (Search & Filtering)
* **Index Name:** `vehicles_index`
* **Function:** Handles full-text search by vehicle name and category filtering.

## 3. Kafka Event-Driven & Batching Strategy
* **Topics:**
  * `rental-batch-queue`: Asynchronous rental ingestion queue.
  * `rental-dlq`: Dead Letter Queue for corrupted/poisonous records.
* **Batch Processing & Binary Split DLQ:**
  * Accumulates payloads up to **100 items** or **2 seconds** window.
  * Executes single-query bulk overlap checks (`findOverlappingRentalsBulk`) and in-memory intra-batch collision checks.
  * Uses Binary Split Algorithm on failure to isolate poisonous records into `rental-dlq` while successfully committing valid batch items.

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
│   ├── opensearch.ts
│   ├── redis.ts
│   └── swagger.ts
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
│   └── swagger.json
├── kafka/
│   └── rental.handler.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   ├── upload.middleware.ts
│   └── validation.middleware.ts
├── modules/
│   ├── auth/
│   ├── vehicles/
│   ├── rentals/
│   │   ├── rental.cache.ts
│   │   ├── rental.controller.ts
│   │   ├── rental.interface.ts
│   │   ├── rental.repository.ts
│   │   ├── rental.routes.ts
│   │   ├── rental.service.ts
│   │   └── rental.validation.ts
│   └── reports/
│       ├── reports.controller.ts
│       ├── reports.interface.ts
│       ├── reports.repository.ts
│       ├── reports.routes.ts
│       ├── reports.service.ts
│       └── reports.validation.ts
├── utils/
│   ├── appError.ts
│   ├── fileUpload.ts
│   ├── sendResponse.ts
│   └── uuid.ts
├── server.ts
└── worker.ts
tsconfig.json
```