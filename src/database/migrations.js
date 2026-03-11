/**
 * Database migrations
 */
import { query } from './connection.js';

export async function runMigrations() {
  console.log('Running database migrations...');
  
  // Create events table
  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      event_data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE(event_id, tenant_id)
    );
  `);
  
  // Create indexes for events
  await query(`CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tenant_user_created ON events(tenant_id, user_id, created_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tenant_user ON events(tenant_id, user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_event_id_tenant ON events(event_id, tenant_id);`);
  
  // Create personas table
  await query(`
    CREATE TABLE IF NOT EXISTS personas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      persona_data JSONB NOT NULL,
      events_analyzed JSONB,
      generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      model_version VARCHAR(50),
      UNIQUE(tenant_id, user_id)
    );
  `);
  
  // Create indexes for personas
  await query(`CREATE INDEX IF NOT EXISTS idx_personas_tenant_id ON personas(tenant_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_personas_generated_at ON personas(generated_at);`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_user_persona ON personas(tenant_id, user_id);`);
  
  console.log('Migrations completed successfully');
}
