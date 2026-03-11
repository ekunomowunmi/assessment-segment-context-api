# AI Journey Documentation

This document tracks the use of AI assistants (Cursor, Gemini, Claude) throughout the development of the Segment-to-Context service.

## Complex Prompts Used for Architecture

### 1. System Architecture Design Prompt
**Prompt:**
```
Design a cloud-native event ingestion system with the following requirements:
- High-concurrency event ingestion using Google Cloud Pub/Sub
- Multi-tenant data isolation at the database query level
- Event-driven worker that processes events asynchronously
- Idempotency handling to prevent duplicate event processing
- Integration with Vertex AI for persona generation
- Horizontal scaling on Cloud Run

Consider:
- N+1 query risks
- Data consistency if worker fails mid-process
- Tenant isolation strategies
- Retry mechanisms for LLM API calls
```

**Outcome:** The AI suggested a Pub/Sub-based architecture with separate ingestion and processing layers, composite database indexes for tenant isolation, and idempotency checks using event_id + tenant_id composite keys.

### 2. Database Schema Optimization Prompt
**Prompt:**
```
Design a PostgreSQL schema for storing user events optimized for:
- Fast retrieval by user_id and tenant_id (composite queries)
- Preventing cross-tenant data leakage at the query level
- Supporting aggregation of last N events for a user
- Idempotency checks using event_id

Include:
- Appropriate indexes (composite and single-column)
- JSON storage for flexible event data
- Timestamp-based ordering
```

**Outcome:** The AI recommended composite indexes on (tenant_id, user_id, created_at) and (event_id, tenant_id) for idempotency checks. This ensures queries are inherently tenant-scoped and performant.

### 3. Vertex AI Integration with Retry Logic Prompt
**Prompt:**
```
Implement a service that calls Vertex AI (Gemini) to generate user personas from event data.
Requirements:
- Robust retry logic with exponential backoff for rate limits
- Handle JSON parsing errors gracefully
- Support mock responses for local development
- Generate structured JSON personas with specific fields
- Handle API failures and network timeouts

Use tenacity library for retry logic.
```

**Outcome:** The AI provided a comprehensive VertexAIService class with exponential backoff retry (up to 5 attempts), JSON extraction from markdown code blocks, and mock persona generation for development environments.

## AI Hallucination/Spaghetti Solution Correction

### Instance: Initial Pub/Sub Worker Implementation

**What Happened:**
The AI initially suggested a synchronous Pub/Sub subscriber callback that would block the event loop, potentially causing performance issues under high load. The suggested implementation also didn't properly handle async database operations within the callback.

**The Problem:**
```python
# Initial suggestion (problematic)
def callback(message):
    # Synchronous database operations
    event = store_event_sync(message.data)
    # This blocks the event loop
```

**Correction:**
I corrected this by:
1. Using `asyncio.run()` within the callback to properly handle async operations
2. Implementing proper session management with async context managers
3. Adding comprehensive error handling with appropriate message acknowledgment/nack strategies
4. Ensuring database transactions are properly committed or rolled back

**Final Implementation:**
```python
async def process_message(self, message):
    async with AsyncSessionLocal() as session:
        try:
            # Async operations
            event = await self._store_event(session, event_data)
            # ... rest of processing
            message.ack()
        except Exception as e:
            await session.rollback()
            message.nack()  # Retry on failure

def callback(self, message):
    asyncio.run(self.process_message(message))
```

**Lesson Learned:** Always ensure async/await patterns are correctly implemented, especially when mixing synchronous Pub/Sub callbacks with async database operations. The event loop must be properly managed to avoid blocking.

## AI Tools Used

- **Cursor**: Primary IDE with AI assistance for code generation, refactoring, and debugging
- **Claude**: Used for architectural discussions and code review
- **Gemini**: Used for testing LLM integration patterns and prompt engineering

## Key Insights

1. **Tenant Isolation**: The AI helped identify that tenant_id should be part of every query WHERE clause, not just application-level filtering. This prevents accidental data leakage even if application logic has bugs.

2. **Idempotency Strategy**: The AI suggested using a composite unique constraint on (event_id, tenant_id) rather than just event_id globally, which allows the same event_id to be reused across different tenants.

3. **Retry Logic**: The exponential backoff pattern suggested by the AI (using tenacity) handles Vertex AI rate limits gracefully, with increasing wait times between retries.

4. **Testing Strategy**: The AI recommended using in-memory SQLite for tests to ensure fast test execution while maintaining SQLAlchemy compatibility.
