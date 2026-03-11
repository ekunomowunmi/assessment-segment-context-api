# Segment-to-Context Backend

Express.js backend API for the Segment-to-Context service.

## Tech Stack

- **Framework**: Express.js (Node.js)
- **Database**: PostgreSQL (Cloud SQL)
- **Message Queue**: Google Cloud Pub/Sub
- **Worker**: Cloud Run
- **AI**: Vertex AI (Gemini 1.5 Pro/Flash)
- **Logging**: Pino

## Features

- **High-concurrency event ingestion** using Google Cloud Pub/Sub
- **Multi-tenant data isolation** with PostgreSQL
- **Event-driven processing** with Cloud Run workers
- **AI-powered persona generation** using Vertex AI (Gemini)
- **Idempotency handling** to prevent duplicate events
- **Robust retry logic** with exponential backoff

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Google Cloud SDK (for GCP deployment)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=segment_context
DB_USER=user
DB_PASSWORD=password

# Google Cloud Platform
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1

# Pub/Sub
PUBSUB_TOPIC_EVENTS=user-events
PUBSUB_SUBSCRIPTION_CONTEXT_WORKER=context-worker-sub

# Vertex AI
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-1.5-pro
VERTEX_AI_PROJECT_ID=your-project-id

# Application
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
LOG_LEVEL=info

# Security
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000

# Worker Configuration
WORKER_BATCH_SIZE=50
WORKER_MAX_RETRIES=5
WORKER_RETRY_BACKOFF_BASE=2
```

### Local Development

1. **Start infrastructure**:
   ```bash
   docker-compose up -d
   ```

2. **Run database migrations**:
   ```bash
   npm run migrate
   ```

3. **Start backend server**:
   ```bash
   npm run dev
   ```

4. **Start worker** (in another terminal):
   ```bash
   npm run worker
   ```

## API Endpoints

### Events

- `POST /api/v1/events/ingest` - Ingest a new event
- `GET /api/v1/events` - List events (with optional user_id filter)

### Personas

- `GET /api/v1/personas/:user_id` - Get persona for a user
- `GET /api/v1/personas` - List all personas

All endpoints require the `X-Tenant-ID` header.

## Project Structure

```
backend/
├── src/
│   ├── index.js              # Express app entry point
│   ├── config.js             # Configuration
│   ├── routes/               # API routes
│   │   ├── events.js
│   │   └── personas.js
│   ├── database/             # Database setup
│   │   ├── connection.js
│   │   ├── migrations.js
│   │   └── migrate.js
│   ├── services/             # Business logic
│   │   ├── pubsubService.js
│   │   └── vertexAIService.js
│   ├── workers/              # Pub/Sub worker
│   │   └── contextWorker.js
│   ├── middleware/           # Express middleware
│   │   └── tenantMiddleware.js
│   └── utils/                # Utilities
│       └── idempotency.js
├── tests/                    # Jest tests
├── package.json             # Dependencies
├── Dockerfile               # Docker configuration
└── docker-compose.yml       # Local development
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

Target: 80% code coverage on core business logic.

## Documentation

- [AI_JOURNEY.md](./AI_JOURNEY.md) - AI collaboration documentation
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) - Architecture and design decisions

## License

MIT
