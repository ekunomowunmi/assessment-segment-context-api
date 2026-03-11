# System Design Documentation

## Architecture Overview

The Segment-to-Context service is a cloud-native event ingestion and processing platform built on Google Cloud Platform. It follows an event-driven architecture with clear separation between ingestion, storage, and processing layers.

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP POST
       ▼
┌─────────────────┐      ┌──────────────┐
│  FastAPI API    │─────▶│  Pub/Sub     │
│  (Cloud Run)    │      │  Topic       │
└─────────────────┘      └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Database    │
                          │ (PostgreSQL) │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │   Worker     │
                          │ (Cloud Run)  │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Vertex AI   │
                          │   (Gemini)   │
                          └──────────────┘
```

## 1. N+1 Query Risks

### Risk Analysis

**Potential N+1 Query Scenarios:**

1. **Persona Generation Worker:**
   - **Risk:** When processing multiple users, querying events for each user individually
   - **Mitigation:** The worker processes one message at a time (Pub/Sub guarantees), so each message triggers a single query for that user's events. This is intentional and not an N+1 problem.

2. **Event Listing Endpoint:**
   - **Risk:** If we fetched events and then queried personas for each user separately
   - **Current Implementation:** We only fetch events, not personas. No N+1 risk.

3. **Persona Listing Endpoint:**
   - **Risk:** If we fetched personas and then queried events for each user
   - **Current Implementation:** We only fetch personas. No N+1 risk.

**Conclusion:** The current architecture avoids N+1 queries by:
- Processing one user at a time in the worker (Pub/Sub message-based)
- Using efficient composite indexes for single-query lookups
- Avoiding eager loading of related data unless necessary

**Future Considerations:**
If we add features like "get persona with recent events", we would use SQL JOINs or SQLAlchemy's `joinedload()` to fetch related data in a single query.

## 2. Horizontal Scaling Strategy

### API Scaling (Cloud Run)

**Current Implementation:**
- Stateless FastAPI application
- Pub/Sub handles message buffering (decouples API from processing)
- Database connection pooling via SQLAlchemy

**Scaling Configuration:**
```yaml
# Cloud Run Configuration
min_instances: 0
max_instances: 100
cpu: 2
memory: 2Gi
concurrency: 80  # Requests per instance
```

**Scaling Behavior:**
1. **Traffic Burst:** Pub/Sub absorbs spikes, API returns 202 Accepted immediately
2. **Auto-scaling:** Cloud Run scales instances based on request rate
3. **Database:** Connection pool limits prevent overwhelming PostgreSQL
4. **Pub/Sub:** Handles millions of messages per second (GCP SLA)

**Optimization:**
- Use Cloud SQL Proxy for connection pooling
- Implement request queuing if database becomes bottleneck
- Consider read replicas for event listing endpoints

### Worker Scaling (Cloud Run)

**Current Implementation:**
- Stateless worker processes Pub/Sub messages
- Each message processed independently
- Vertex AI calls are rate-limited with retries

**Scaling Configuration:**
```yaml
# Cloud Run Worker Configuration
min_instances: 1  # Always running to process messages
max_instances: 50
cpu: 1
memory: 1Gi
concurrency: 1  # One message at a time per instance
```

**Scaling Behavior:**
1. **Message Backlog:** Pub/Sub subscription scales workers based on message count
2. **Processing Time:** Each persona generation takes ~2-5 seconds (LLM call)
3. **Rate Limiting:** Exponential backoff handles Vertex AI rate limits gracefully
4. **Failure Handling:** Failed messages are nacked and retried by Pub/Sub

**Optimization:**
- Batch processing: Process multiple users in one LLM call (if supported)
- Caching: Cache recent personas to avoid regenerating
- Dead Letter Queue: Route failed messages after N retries

## 3. Data Consistency if Worker Fails Mid-Process

### Failure Scenarios

**Scenario 1: Worker crashes after storing event, before generating persona**

**Current Behavior:**
- Event is stored in database (committed)
- Pub/Sub message is nacked (not acknowledged)
- Pub/Sub redelivers message to another worker instance
- New worker:
  1. Checks idempotency → event already exists (skips storage)
  2. Aggregates events (includes the stored event)
  3. Generates persona
  4. Stores persona
  5. Acks message

**Result:** ✅ Eventually consistent - persona will be generated on retry

**Scenario 2: Worker crashes after generating persona, before storing it**

**Current Behavior:**
- Event stored ✅
- Persona generated ✅
- Persona storage fails → transaction rolled back
- Pub/Sub message nacked
- Retry:
  1. Event already exists (idempotent)
  2. Events aggregated (same set)
  3. Persona regenerated (may differ slightly due to LLM non-determinism)
  4. Persona stored ✅

**Result:** ✅ Eventually consistent - persona regenerated and stored

**Scenario 3: Worker crashes during LLM call**

**Current Behavior:**
- Event stored ✅
- LLM call in progress → timeout/error
- Retry logic (exponential backoff) attempts up to 5 times
- If all retries fail → message nacked → Pub/Sub redelivers
- New worker retries from beginning

**Result:** ✅ Eventually consistent - retries until success or DLQ

### Consistency Guarantees

**Event Storage:**
- ✅ **Idempotent:** Same event_id + tenant_id cannot be stored twice
- ✅ **Atomic:** Database transaction ensures all-or-nothing
- ✅ **Durable:** Committed events survive worker crashes

**Persona Generation:**
- ✅ **Idempotent:** Persona upserted (one per user per tenant)
- ⚠️ **Non-deterministic:** LLM may generate slightly different personas on retry
- ✅ **Eventually Consistent:** Persona will be generated eventually

**Improvements for Stronger Consistency:**

1. **Two-Phase Processing:**
   ```python
   # Phase 1: Mark user as "processing"
   processing_lock = await acquire_lock(user_id, tenant_id)
   
   # Phase 2: Generate persona
   persona = await generate_persona(events)
   
   # Phase 3: Store persona and release lock
   await store_persona(persona)
   await release_lock(processing_lock)
   ```

2. **Idempotency Tokens:**
   - Include a processing token in the Pub/Sub message
   - Store token with persona
   - Skip processing if token matches existing persona

3. **Saga Pattern:**
   - Use Cloud Tasks for multi-step orchestration
   - Compensating transactions if steps fail

## Database Schema Design

### Events Table
- **Primary Key:** `id` (UUID)
- **Unique Constraint:** `event_id` (for idempotency)
- **Indexes:**
  - `idx_tenant_user_created`: Composite index for efficient event aggregation
  - `idx_event_id_tenant`: Composite index for idempotency checks
  - Single-column indexes on `tenant_id`, `user_id`, `event_type`, `created_at`

### Personas Table
- **Primary Key:** `id` (UUID)
- **Unique Constraint:** `(tenant_id, user_id)` - one persona per user per tenant
- **Indexes:**
  - `idx_tenant_user`: Unique composite index for fast lookups

### Tenant Isolation

**Query-Level Isolation:**
Every database query includes `tenant_id` in the WHERE clause:
```python
# ✅ Correct - tenant isolation
query = select(Event).where(
    Event.tenant_id == tenant_id,
    Event.user_id == user_id
)

# ❌ Wrong - would leak data
query = select(Event).where(Event.user_id == user_id)
```

**Application-Level Validation:**
- Middleware extracts `X-Tenant-ID` header
- All endpoints require tenant_id
- Resource access validated before returning data

## Performance Optimizations

1. **Database Indexes:** Composite indexes optimize common query patterns
2. **Connection Pooling:** SQLAlchemy connection pool reduces database overhead
3. **Pub/Sub Buffering:** Decouples API from processing, handles bursts
4. **Async Processing:** Worker processes messages asynchronously
5. **Retry Logic:** Exponential backoff prevents overwhelming Vertex AI

## Security Considerations

1. **Tenant Isolation:** Database queries enforce tenant boundaries
2. **Authentication:** (To be implemented) API key or OAuth2
3. **Input Validation:** Pydantic models validate all inputs
4. **SQL Injection:** SQLAlchemy ORM prevents SQL injection
5. **Secrets Management:** Use Google Secret Manager for credentials

## Monitoring & Observability

**Recommended Metrics:**
- Event ingestion rate (events/second)
- Worker processing latency (p50, p95, p99)
- LLM API call success rate
- Database query performance
- Pub/Sub message backlog

**Logging:**
- Structured logging with tenant_id and user_id
- Error tracking with stack traces
- Performance metrics (query times, LLM latency)

## Future Enhancements

1. **BigQuery Integration:** Route raw events to BigQuery for analytics
2. **Real-time Dashboard:** WebSocket/SSE for live event stream
3. **Caching Layer:** Redis for frequently accessed personas
4. **Batch Processing:** Process multiple users in one LLM call
5. **A/B Testing:** Compare different persona generation strategies
