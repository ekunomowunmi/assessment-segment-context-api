/**
 * Tests for persona endpoints
 */
import request from 'supertest';
import express from 'express';
import personasRouter from '../src/routes/personas.js';
import { query } from '../src/database/connection.js';

// Mock database
jest.mock('../src/database/connection.js');

const app = express();
app.use(express.json());
app.use('/api/v1/personas', personasRouter);

describe('Persona API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/v1/personas/:user_id - successful retrieval', async () => {
    const mockPersona = {
      id: 'persona-123',
      tenant_id: 'test-tenant-123',
      user_id: 'user-456',
      persona_data: {
        persona_type: 'High-intent buyer',
        confidence_score: 0.85,
        key_behaviors: ['frequent_visits', 'add_to_cart'],
        engagement_level: 'high',
        purchase_intent: 'high',
        risk_factors: [],
        recommendations: ['Send promotional email'],
        summary: 'Highly engaged user with purchase intent'
      },
      events_analyzed: ['event-1', 'event-2'],
      generated_at: new Date('2024-01-01'),
      model_version: 'gemini-1.5-pro'
    };

    query.mockResolvedValue({
      rows: [mockPersona]
    });

    const response = await request(app)
      .get('/api/v1/personas/user-456')
      .set('X-Tenant-ID', 'test-tenant-123');

    expect(response.status).toBe(200);
    expect(response.body.user_id).toBe('user-456');
    expect(response.body.persona_data.persona_type).toBe('High-intent buyer');
    expect(response.body.model_version).toBe('gemini-1.5-pro');
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM personas WHERE tenant_id = $1 AND user_id = $2',
      ['test-tenant-123', 'user-456']
    );
  });

  test('GET /api/v1/personas/:user_id - persona not found', async () => {
    query.mockResolvedValue({
      rows: []
    });

    const response = await request(app)
      .get('/api/v1/personas/non-existent-user')
      .set('X-Tenant-ID', 'test-tenant-123');

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('Persona not found');
  });

  test('GET /api/v1/personas/:user_id - tenant isolation', async () => {
    const tenant1 = 'tenant-1';
    const tenant2 = 'tenant-2';
    const user_id = 'user-123';

    // Mock tenant1 persona
    query.mockResolvedValueOnce({
      rows: [{
        id: 'persona-1',
        tenant_id: tenant1,
        user_id: user_id,
        persona_data: { persona_type: 'Tenant1 User' },
        events_analyzed: [],
        generated_at: new Date(),
        model_version: 'gemini-1.5-pro'
      }]
    });

    // Query as tenant1
    const response1 = await request(app)
      .get(`/api/v1/personas/${user_id}`)
      .set('X-Tenant-ID', tenant1);

    expect(response1.status).toBe(200);
    expect(response1.body.persona_data.persona_type).toBe('Tenant1 User');
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM personas WHERE tenant_id = $1 AND user_id = $2',
      [tenant1, user_id]
    );

    // Mock tenant2 persona
    query.mockResolvedValueOnce({
      rows: [{
        id: 'persona-2',
        tenant_id: tenant2,
        user_id: user_id,
        persona_data: { persona_type: 'Tenant2 User' },
        events_analyzed: [],
        generated_at: new Date(),
        model_version: 'gemini-1.5-pro'
      }]
    });

    // Query as tenant2
    const response2 = await request(app)
      .get(`/api/v1/personas/${user_id}`)
      .set('X-Tenant-ID', tenant2);

    expect(response2.status).toBe(200);
    expect(response2.body.persona_data.persona_type).toBe('Tenant2 User');
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM personas WHERE tenant_id = $1 AND user_id = $2',
      [tenant2, user_id]
    );
  });

  test('GET /api/v1/personas - list personas', async () => {
    const mockPersonas = [
      {
        id: 'persona-1',
        user_id: 'user-1',
        persona_data: { persona_type: 'Type A' },
        generated_at: new Date('2024-01-02')
      },
      {
        id: 'persona-2',
        user_id: 'user-2',
        persona_data: { persona_type: 'Type B' },
        generated_at: new Date('2024-01-01')
      }
    ];

    query.mockResolvedValue({
      rows: mockPersonas
    });

    const response = await request(app)
      .get('/api/v1/personas')
      .set('X-Tenant-ID', 'test-tenant-123')
      .query({ limit: 100, offset: 0 });

    expect(response.status).toBe(200);
    expect(response.body.personas).toHaveLength(2);
    expect(response.body.count).toBe(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1'),
      expect.arrayContaining(['test-tenant-123'])
    );
  });

  test('GET /api/v1/personas/:user_id - missing tenant ID', async () => {
    const response = await request(app)
      .get('/api/v1/personas/user-456');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('X-Tenant-ID');
  });

  test('GET /api/v1/personas/:user_id - error handling', async () => {
    query.mockRejectedValue(new Error('Database error'));

    const response = await request(app)
      .get('/api/v1/personas/user-456')
      .set('X-Tenant-ID', 'test-tenant-123');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to get persona');
    expect(response.body.message).toBe('Database error');
  });

  test('GET /api/v1/personas - error handling', async () => {
    query.mockRejectedValue(new Error('Database error'));

    const response = await request(app)
      .get('/api/v1/personas')
      .set('X-Tenant-ID', 'test-tenant-123');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to list personas');
    expect(response.body.message).toBe('Database error');
  });
});
