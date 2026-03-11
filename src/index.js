/**
 * Main Express application entry point
 */
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { config } from './config.js';
import { initializePubSub } from './services/pubsubService.js';
import { runMigrations } from './database/migrations.js';
import eventsRouter from './routes/events.js';
import personasRouter from './routes/personas.js';

const logger = pino({ level: config.app.logLevel });

const app = express();

// Middleware
app.use(cors({
  origin: config.security.allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'segment-to-context' });
});

// API routes
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/personas', personasRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: config.app.environment === 'development' ? err.message : undefined
  });
});

// Initialize services
async function start() {
  try {
    // Run migrations
    await runMigrations();
    logger.info('Database migrations completed');
    
    // Initialize Pub/Sub
    initializePubSub();
    
    // Start server
    app.listen(config.app.port, config.app.host, () => {
      logger.info({
        host: config.app.host,
        port: config.app.port,
        environment: config.app.environment,
      }, 'Server started');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
