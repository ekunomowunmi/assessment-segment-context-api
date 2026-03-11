/**
 * Google Cloud Pub/Sub service
 */
import { PubSub } from '@google-cloud/pubsub';
import { config } from '../config.js';
import pino from 'pino';

const logger = pino({ level: config.app.logLevel });

let publisher;
let topic;

export function initializePubSub() {
  const pubsubOptions = {};
  
  // Use emulator for local development
  if (config.pubsub.emulatorHost) {
    process.env.PUBSUB_EMULATOR_HOST = config.pubsub.emulatorHost;
  }
  
  publisher = new PubSub({
    projectId: config.gcp.projectId,
    ...pubsubOptions,
  });
  
  topic = publisher.topic(config.pubsub.topicEvents);
  
  // Ensure topic exists (for emulator)
  topic.get({ autoCreate: true }).catch((err) => {
    logger.warn({ err }, 'Could not get/create topic');
  });
  
  logger.info({ topic: config.pubsub.topicEvents }, 'Pub/Sub initialized');
}

/**
 * Publish an event to Pub/Sub
 */
export async function publishEvent(eventData) {
  try {
    const messageBuffer = Buffer.from(JSON.stringify(eventData));
    
    const messageId = await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        tenant_id: eventData.tenant_id,
        user_id: eventData.user_id,
        event_type: eventData.event_type,
      },
    });
    
    logger.info({ messageId, eventId: eventData.event_id }, 'Published event to Pub/Sub');
    return messageId;
  } catch (error) {
    logger.error({ error, eventData }, 'Error publishing event to Pub/Sub');
    throw error;
  }
}

export function getTopic() {
  return topic;
}
