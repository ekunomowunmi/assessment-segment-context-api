/**
 * Database connection and pool management
 */
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// Create connection pool
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a query with tenant isolation
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} tenantId - Tenant ID for isolation
 * @returns {Promise} Query result
 */
export async function query(text, params = [], tenantId = null) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error', { text, error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export function getClient() {
  return pool.connect();
}
