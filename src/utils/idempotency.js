/**
 * Idempotency utilities
 */
import { query } from '../database/connection.js';

/**
 * Check if an event with the given event_id and tenant_id already exists
 */
export async function checkEventExists(eventId, tenantId) {
  const result = await query(
    'SELECT * FROM events WHERE event_id = $1 AND tenant_id = $2',
    [eventId, tenantId]
  );
  console.log('checkEventExists result:', result.rows);
  return result.rows[0] || null;
}
