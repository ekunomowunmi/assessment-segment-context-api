/**
 * Context Worker - Event-driven async task for generating user personas
 */
import { PubSub } from '@google-cloud/pubsub';
import { config } from '../config.js';
import { getClient } from '../database/connection.js';
import { generatePersonaWithRetry } from '../services/vertexAIService.js';
import pino from 'pino';

const logger = pino({ level: config.app.logLevel });

class ContextWorker {
  constructor() {
    this.projectId = config.gcp.projectId;
    this.subscriptionName = config.pubsub.subscriptionContextWorker;
    this.batchSize = config.worker.batchSize;
    
    // Initialize Pub/Sub subscriber
    const pubsubOptions = {};
    if (config.pubsub.emulatorHost) {
      process.env.PUBSUB_EMULATOR_HOST = config.pubsub.emulatorHost;
    }
    
    this.pubsub = new PubSub({
      projectId: this.projectId,
      ...pubsubOptions,
    });
    
    this.topic = null;
    this.subscription = null;
  }
  
  /**
   * Initialize topic and subscription
   */
  async initialize() {
    // Get or create topic first
    this.topic = this.pubsub.topic(config.pubsub.topicEvents);
    
    // Ensure topic exists (for emulator)
    try {
      await this.topic.get({ autoCreate: true });
      logger.info({ topic: config.pubsub.topicEvents }, 'Topic ready');
      console.log('Topic ready:', config.pubsub.topicEvents);
    } catch (err) {
      logger.warn({ err }, 'Could not get/create topic');
      console.error('Could not get/create topic:', err);
    }
    
    // Get or create subscription linked to topic
    this.subscription = this.topic.subscription(this.subscriptionName);
    
    // Ensure subscription exists (for emulator) - use createSubscription for proper linking
    try {
      await this.subscription.get({ autoCreate: true });
      logger.info({ subscription: this.subscriptionName }, 'Subscription ready');
      console.log('Subscription ready:', this.subscriptionName);
    } catch (err) {
      // If get fails, try creating it explicitly
      try {
        await this.topic.createSubscription(this.subscriptionName);
        logger.info({ subscription: this.subscriptionName }, 'Created subscription');
        console.log('Created subscription:', this.subscriptionName);
        this.subscription = this.topic.subscription(this.subscriptionName);
      } catch (createErr) {
        logger.warn({ err: createErr }, 'Could not create subscription');
        console.error('Could not create subscription:', createErr);
      }
    }
  }
  
  /**
   * Get recent events for a user
   */
  async getRecentEvents(client, tenantId, userId, limit = 50) {
    const result = await client.query(
      `SELECT * FROM events 
       WHERE tenant_id = $1 AND user_id = $2 
       ORDER BY created_at DESC 
       LIMIT $3`,
      [tenantId, userId, limit]
    );
    
    return result.rows.map(e => ({
      event_id: e.event_id,
      event_type: e.event_type,
      event_data: e.event_data,
      created_at: e.created_at.toISOString(),
    }));
  }
  
  /**
   * Store event in database
   */
  async storeEvent(client, eventData) {
    // Check idempotency
    const existing = await client.query(
      'SELECT * FROM events WHERE event_id = $1 AND tenant_id = $2',
      [eventData.event_id, eventData.tenant_id]
    );
    
    if (existing.rows.length > 0) {
      logger.info({ event_id: eventData.event_id }, 'Event already exists');
      return existing.rows[0];
    }
    
    // Insert new event
    const result = await client.query(
      `INSERT INTO events (event_id, tenant_id, user_id, event_type, event_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        eventData.event_id,
        eventData.tenant_id,
        eventData.user_id,
        eventData.event_type,
        JSON.stringify(eventData.event_data),
        eventData.timestamp || new Date(),
      ]
    );
    
    logger.info({ event_id: eventData.event_id }, 'Stored event');
    return result.rows[0];
  }
  
  /**
   * Generate and store persona
   */
  async generateAndStorePersona(client, tenantId, userId, events, eventIds) {
    try {
      // Generate persona using Vertex AI
      const personaData = await generatePersonaWithRetry(events);
      
      // Check if persona exists
      const existing = await client.query(
        'SELECT * FROM personas WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, userId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing persona
        await client.query(
          `UPDATE personas 
           SET persona_data = $1, events_analyzed = $2, generated_at = $3, model_version = $4
           WHERE tenant_id = $5 AND user_id = $6`,
          [
            JSON.stringify(personaData),
            JSON.stringify(eventIds),
            new Date(),
            config.vertexAI.model,
            tenantId,
            userId,
          ]
        );
        logger.info({ userId }, 'Updated persona');
      } else {
        // Create new persona
        await client.query(
          `INSERT INTO personas (tenant_id, user_id, persona_data, events_analyzed, model_version)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tenantId,
            userId,
            JSON.stringify(personaData),
            JSON.stringify(eventIds),
            config.vertexAI.model,
          ]
        );
        logger.info({ userId }, 'Created persona');
      }
    } catch (error) {
      logger.error({ error, userId }, 'Error generating persona');
      throw error;
    }
  }
  
  /**
   * Process a single Pub/Sub message
   */
  async processMessage(message) {
    try {
      const eventData = JSON.parse(message.data.toString());
      const { tenant_id, user_id, event_id } = eventData;
      
      logger.info({ event_id, tenant_id, user_id }, 'Processing event');
      console.log('Processing event:', { event_id, tenant_id, user_id });
      
      const client = await getClient();
      
      try {
        await client.query('BEGIN');
        
        // Store event (with idempotency check)
        const storedEvent = await this.storeEvent(client, eventData);
        console.log('Stored event:', storedEvent);
        
        // Get recent events for this user
        const recentEvents = await this.getRecentEvents(client, tenant_id, user_id, this.batchSize);
        console.log('Recent events count:', recentEvents.length);
        
        // Generate persona if we have events
        if (recentEvents.length > 0) {
          const eventIds = recentEvents.map(e => e.event_id);
          await this.generateAndStorePersona(client, tenant_id, user_id, recentEvents, eventIds);
          console.log('Generated persona for user:', user_id);
        }
        
        await client.query('COMMIT');
        
        // Acknowledge message
        message.ack();
        logger.info({ event_id }, 'Successfully processed event');
        console.log('Successfully processed event:', event_id);
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error, event_id }, 'Error processing event');
        console.error('Error processing event:', error);
        message.nack(); // Retry on failure
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error({ error }, 'Error parsing message');
      console.error('Error parsing message:', error);
      message.ack(); // Acknowledge invalid messages to avoid infinite retries
    }
  }
  
  /**
   * Start the worker
   */
  async start() {
    // Initialize topic and subscription first
    await this.initialize();
    
    if (!this.subscription) {
      logger.error('Failed to initialize subscription');
      console.error('Failed to initialize subscription');
      return;
    }
    
    logger.info({ subscription: this.subscriptionName, topic: config.pubsub.topicEvents }, 'Starting Context Worker');
    console.log('Starting Context Worker:', { 
      subscription: this.subscriptionName, 
      topic: config.pubsub.topicEvents,
      projectId: this.projectId 
    });
    
    this.subscription.on('message', (message) => {
      console.log('Received message from Pub/Sub');
      this.processMessage(message).catch((error) => {
        logger.error({ error }, 'Unhandled error in message processing');
        console.error('Unhandled error in message processing:', error);
      });
    });
    
    this.subscription.on('error', (error) => {
      logger.error({ error }, 'Subscription error');
      console.error('Subscription error:', error);
    });
    
    logger.info('Worker started. Listening for messages...');
    console.log('Worker started. Listening for messages...');
  }
}

// Start worker if run directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule || process.argv[1]?.includes('contextWorker')) {
  const worker = new ContextWorker();
  worker.start().catch((error) => {
    logger.error({ error }, 'Failed to start worker');
    console.error('Failed to start worker:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down worker...');
    process.exit(0);
  });
}

export default ContextWorker;
