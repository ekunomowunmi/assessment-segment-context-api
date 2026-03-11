/**
 * Persona routes
 */
import express from 'express';
import { requireTenantId, validateTenantAccess } from '../middleware/tenantMiddleware.js';
import { query } from '../database/connection.js';
import pino from 'pino';
import { config } from '../config.js';

const logger = pino({ level: config.app.logLevel });
const router = express.Router();

/**
 * GET /api/v1/personas/:user_id
 * Get AI-generated persona for a specific user
 */
router.get('/:user_id', requireTenantId, async (req, res) => {
  try {
    const { user_id } = req.params;
    const tenantId = req.tenantId;
    
    const result = await query(
      'SELECT * FROM personas WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: `Persona not found for user ${user_id}`
      });
    }
    
    const persona = result.rows[0];
    
    // Double-check tenant access
    validateTenantAccess(persona.tenant_id, tenantId);
    
    res.json({
      id: persona.id,
      tenant_id: persona.tenant_id,
      user_id: persona.user_id,
      persona_data: persona.persona_data,
      events_analyzed: persona.events_analyzed,
      generated_at: persona.generated_at.toISOString(),
      model_version: persona.model_version,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting persona');
    res.status(500).json({
      error: 'Failed to get persona',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/personas
 * List all personas for a tenant
 */
router.get('/', requireTenantId, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const tenantId = req.tenantId;
    
    const result = await query(
      `SELECT * FROM personas 
       WHERE tenant_id = $1 
       ORDER BY generated_at DESC 
       LIMIT $2 OFFSET $3`,
      [tenantId, parseInt(limit), parseInt(offset)]
    );
    
    res.json({
      personas: result.rows.map(p => ({
        id: p.id,
        user_id: p.user_id,
        persona_data: p.persona_data,
        generated_at: p.generated_at.toISOString(),
      })),
      count: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error({ error }, 'Error listing personas');
    res.status(500).json({
      error: 'Failed to list personas',
      message: error.message
    });
  }
});

export default router;
