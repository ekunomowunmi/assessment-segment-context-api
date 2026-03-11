/**
 * Application configuration
 */
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'segment_context',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
  },
  
  // Google Cloud Platform
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || '',
    region: process.env.GCP_REGION || 'us-central1',
  },
  
  // Pub/Sub
  pubsub: {
    topicEvents: process.env.PUBSUB_TOPIC_EVENTS || 'user-events',
    subscriptionContextWorker: process.env.PUBSUB_SUBSCRIPTION_CONTEXT_WORKER || 'context-worker-sub',
    emulatorHost: process.env.PUBSUB_EMULATOR_HOST || '',
  },
  
  // Vertex AI
  vertexAI: {
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-pro',
    projectId: process.env.VERTEX_AI_PROJECT_ID || process.env.GCP_PROJECT_ID || '',
  },
  
  // Application
  app: {
    host: process.env.API_HOST || '0.0.0.0',
    port: parseInt(process.env.API_PORT || '8000'),
    environment: process.env.ENVIRONMENT || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  
  // Security
  security: {
    secretKey: process.env.SECRET_KEY || 'change-me-in-production',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },
  
  // Worker Configuration
  worker: {
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '50'),
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '5'),
    retryBackoffBase: parseInt(process.env.WORKER_RETRY_BACKOFF_BASE || '2'),
  },
  
  // BigQuery (Optional)
  bigquery: {
    dataset: process.env.BIGQUERY_DATASET || 'analytics',
    tableEvents: process.env.BIGQUERY_TABLE_EVENTS || 'raw_events',
  },
};
