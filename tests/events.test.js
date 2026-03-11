/**
 * Tests for event ingestion endpoints
 */
import request from 'supertest';
import express from 'express';
import eventsRouter from '../src/routes/events.js';
import { query } from '../src/database/connection.js';
import { checkEventExists } from '../src/utils/idempotency.js';

// Mock database
jest.mock('../src/database/connection.js');
jest.mock('../src/utils/idempotency.js');
jest.mock('../src/services/pubsubService.js', () => ({
  publishEvent: jest.fn().mockResolvedValue('message-id-123'),
  initializePubSub: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/v1/events', eventsRouter);

describe('Event Ingestion API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/v1/events/ingest - successful ingestion', async () => {
    checkEventExists.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/events/ingest')
      .set('X-Tenant-ID', 'test-tenant-123')
      .send({
        event_id: 'event-123',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: { page: '/home', duration: 30 }
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');
    expect(response.body.event_id).toBe('event-123');
  });

  test('POST /api/v1/events/ingest - idempotency check', async () => {
    checkEventExists.mockResolvedValue({
      id: 'existing-id',
      event_id: 'event-123',
      tenant_id: 'test-tenant-123',
    });

    const response = await request(app)
      .post('/api/v1/events/ingest')
      .set('X-Tenant-ID', 'test-tenant-123')
      .send({
        event_id: 'event-123',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {}
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('duplicate');
  });

  test('POST /api/v1/events/ingest - missing tenant ID', async () => {
    const response = await request(app)
      .post('/api/v1/events/ingest')
      .send({
        event_id: 'event-123',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {}
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('X-Tenant-ID');
  });

  test('GET /api/v1/events - list events', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'event-1',
          event_id: 'evt-1',
          user_id: 'user-1',
          event_type: 'page_view',
          event_data: { page: '/home' },
          created_at: new Date('2024-01-01'),
        }
      ],
    });

    const response = await request(app)
      .get('/api/v1/events')
      .set('X-Tenant-ID', 'test-tenant-123');

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1'),
      expect.arrayContaining(['test-tenant-123'])
    );
  });
});
