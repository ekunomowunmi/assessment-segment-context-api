/**
 * Migration runner script
 */
import { runMigrations } from './migrations.js';
import { pool } from './connection.js';

async function main() {
  try {
    await runMigrations();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
