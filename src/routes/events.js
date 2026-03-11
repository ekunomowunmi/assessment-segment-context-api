/**
 * Event ingestion routes
 */
import express from 'express';
import { requireTenantId } from '../middleware/tenantMiddleware.js';
import { checkEventExists } from '../utils/idempotency.js';
import { publishEvent } from '../services/pubsubService.js';
import { query } from '../database/connection.js';
import pino from 'pino';
import { config } from '../config.js';

const logger = pino({ level: config.app.logLevel });
const router = express.Router();

/**
 * POST /api/v1/events/ingest
 * High-throughput endpoint to receive user events
 */
router.post('/ingest', requireTenantId, async (req, res) => {
  try {
    const { event_id, user_id, event_type, event_data, timestamp } = req.body;
    const tenantId = req.tenantId;
    
    // Validate required fields
    if (!event_id || !user_id || !event_type || !event_data) {
      return res.status(400).json({
        error: 'Missing required fields: event_id, user_id, event_type, event_data'
      });
    }
    
    // Check idempotency
    const existingEvent = await checkEventExists(event_id, tenantId);
    if (existingEvent) {
      logger.info({ event_id, tenantId }, 'Duplicate event detected');
      return res.status(202).json({
        message_id: 'duplicate',
        event_id,
        status: 'duplicate'
      });
    }
    
    // Prepare message for Pub/Sub
    const pubsubMessage = {
      event_id,
      tenant_id: tenantId,
      user_id,
      event_type,
      event_data,
      timestamp: timestamp || new Date().toISOString(),
    };
    
    // Publish to Pub/Sub (non-blocking)
    const messageId = await publishEvent(pubsubMessage);
    logger.info({ messageId, event_id, tenantId, user_id }, 'Event published to Pub/Sub');
    logger.info({ event_id, tenantId, user_id }, 'Event ingested');
    console.log('Event ingested:', { messageId, event_id, tenantId, user_id });
    res.status(202).json({
      message_id: messageId,
      event_id,
      status: 'accepted'
    });
  } catch (error) {
    logger.error({ error }, 'Error ingesting event');
    res.status(500).json({
      error: 'Failed to ingest event',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/events
 * List events for a tenant (optionally filtered by user_id)
 */
router.get('/', requireTenantId, async (req, res) => {
  try {
    const { user_id, limit = 100, offset = 0 } = req.query;
    const tenantId = req.tenantId;
    
    let sql = 'SELECT * FROM events WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;
    
    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    console.log('List events result:', result.rows);
    res.json({
      events: result.rows.map(e => ({
        id: e.id,
        event_id: e.event_id,
        user_id: e.user_id,
        event_type: e.event_type,
        event_data: e.event_data,
        created_at: e.created_at.toISOString(),
      })),
      count: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.log('Error listing events:', error);
    logger.error({ error }, 'Error listing events');
    res.status(500).json({
      error: 'Failed to list events',
      message: error.message
    });
  }
});

export default router;
