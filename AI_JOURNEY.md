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

Implement custom retry logic with exponential backoff.
```

**Outcome:** The AI provided a comprehensive VertexAIService class with exponential backoff retry (up to 5 attempts), JSON extraction from markdown code blocks, and mock persona generation for development environments.

## AI Hallucination/Spaghetti Solution Correction

### Instance: Pub/Sub Subscription Initialization

**What Happened:**
The AI initially suggested creating a Pub/Sub subscription directly from the PubSub client without properly linking it to the topic. This caused issues where messages weren't being received because the subscription wasn't properly connected to the topic in the emulator.

**The Problem:**
```javascript
// Initial suggestion (problematic)
this.pubsub = new PubSub({ projectId: this.projectId });
this.subscription = this.pubsub.subscription(this.subscriptionName);
// Subscription not linked to topic - messages won't be received
```

**Correction:**
I corrected this by:
1. Creating the topic first and ensuring it exists
2. Creating the subscription from the topic (not directly from PubSub client)
3. Implementing proper async initialization to ensure topic and subscription are ready
4. Adding error handling for subscription creation failures

**Final Implementation:**
```javascript
async initialize() {
  // Get or create topic first
  this.topic = this.pubsub.topic(config.pubsub.topicEvents);
  await this.topic.get({ autoCreate: true });
  
  // Create subscription from topic (ensures proper linking)
  this.subscription = this.topic.subscription(this.subscriptionName);
  await this.subscription.get({ autoCreate: true });
  
  // Now subscription is properly linked to topic
}

start() {
  this.subscription.on('message', (message) => {
    this.processMessage(message).catch(console.error);
  });
}
```

**Lesson Learned:** In Pub/Sub, subscriptions must be created from topics, not directly from the PubSub client. This ensures proper message routing, especially important when using the Pub/Sub emulator for local development.

## AI Tools Used

- **Cursor**: Primary IDE with AI assistance for code generation, refactoring, and debugging
- **Claude**: Used for architectural discussions and code review
- **Gemini**: Used for testing LLM integration patterns and prompt engineering

## Key Insights

1. **Tenant Isolation**: The AI helped identify that tenant_id should be part of every query WHERE clause, not just application-level filtering. This prevents accidental data leakage even if application logic has bugs.

2. **Idempotency Strategy**: The AI suggested using a composite unique constraint on (event_id, tenant_id) rather than just event_id globally, which allows the same event_id to be reused across different tenants.

3. **Retry Logic**: The exponential backoff pattern implemented with custom retry logic handles Vertex AI rate limits gracefully, with increasing wait times between retries (base^attempt * 1000ms).

4. **Testing Strategy**: The AI recommended using Jest with mocked database connections for tests to ensure fast test execution while maintaining PostgreSQL query compatibility.
