/**
 * Tests for Context Worker
 */

// Mock config first - must be before any imports that use it
jest.mock('../src/config.js', () => ({
  config: {
    gcp: {
      projectId: 'test-project',
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password',
      ssl: false,
    },
    pubsub: {
      topicEvents: 'user-events',
      subscriptionContextWorker: 'context-worker-sub',
      emulatorHost: 'localhost:8085',
    },
    worker: {
      batchSize: 50,
    },
    vertexAI: {
      model: 'gemini-1.5-pro',
    },
    app: {
      logLevel: 'info',
    },
  },
}));

// Mock pg module to prevent Pool initialization
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    on: jest.fn(),
  })),
}));

// Mock dependencies
jest.mock('../src/database/connection.js', () => ({
  getClient: jest.fn(),
  query: jest.fn(),
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
    on: jest.fn(),
  },
}));
jest.mock('../src/services/vertexAIService.js');
jest.mock('@google-cloud/pubsub');

// Import after mocks
import ContextWorker from '../src/workers/contextWorker.js';
import { getClient } from '../src/database/connection.js';
import { generatePersonaWithRetry } from '../src/services/vertexAIService.js';
import { PubSub } from '@google-cloud/pubsub';

describe('ContextWorker', () => {
  let worker;
  let mockClient;
  let mockTopic;
  let mockSubscription;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    getClient.mockResolvedValue(mockClient);

    // Mock Pub/Sub topic and subscription
    mockSubscription = {
      get: jest.fn().mockResolvedValue([{}]),
      on: jest.fn(),
    };

    mockTopic = {
      get: jest.fn().mockResolvedValue([{}]),
      subscription: jest.fn().mockReturnValue(mockSubscription),
      createSubscription: jest.fn().mockResolvedValue([{}]),
    };

    const mockPubSub = {
      topic: jest.fn().mockReturnValue(mockTopic),
    };
    PubSub.mockImplementation(() => mockPubSub);

    // Mock persona generation
    generatePersonaWithRetry.mockResolvedValue({
      persona_type: 'Test User',
      confidence_score: 0.85,
      key_behaviors: ['page_view'],
      engagement_level: 'high',
      purchase_intent: 'medium',
      risk_factors: [],
      recommendations: ['Continue engagement'],
      summary: 'Test summary',
    });

    worker = new ContextWorker();
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(worker.projectId).toBe('test-project');
      expect(worker.subscriptionName).toBe('context-worker-sub');
      expect(worker.batchSize).toBe(50);
    });

    test('should set PUBSUB_EMULATOR_HOST when emulator host is configured', () => {
      const originalEnv = process.env.PUBSUB_EMULATOR_HOST;
      delete process.env.PUBSUB_EMULATOR_HOST;

      new ContextWorker();

      expect(process.env.PUBSUB_EMULATOR_HOST).toBe('localhost:8085');

      process.env.PUBSUB_EMULATOR_HOST = originalEnv;
    });
  });

  describe('initialize', () => {
    test('should initialize topic and subscription', async () => {
      await worker.initialize();

      expect(mockTopic.get).toHaveBeenCalledWith({ autoCreate: true });
      expect(mockSubscription.get).toHaveBeenCalledWith({ autoCreate: true });
    });

    test('should create subscription if get fails', async () => {
      mockSubscription.get.mockRejectedValueOnce(new Error('Not found'));
      mockTopic.createSubscription.mockResolvedValueOnce([{}]);

      await worker.initialize();

      expect(mockTopic.createSubscription).toHaveBeenCalledWith('context-worker-sub');
    });
  });

  describe('getRecentEvents', () => {
    test('should fetch recent events for a user', async () => {
      const mockEvents = [
        {
          event_id: 'evt-1',
          event_type: 'page_view',
          event_data: { page: '/home' },
          created_at: new Date('2024-01-01'),
        },
        {
          event_id: 'evt-2',
          event_type: 'button_click',
          event_data: { button: 'submit' },
          created_at: new Date('2024-01-02'),
        },
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockEvents,
      });

      const events = await worker.getRecentEvents(mockClient, 'tenant-1', 'user-123', 50);

      expect(events).toHaveLength(2);
      expect(events[0]).toHaveProperty('event_id');
      expect(events[0]).toHaveProperty('event_type');
      expect(events[0]).toHaveProperty('created_at');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1 AND user_id = $2'),
        ['tenant-1', 'user-123', 50]
      );
    });

    test('should limit events to specified count', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
      });

      await worker.getRecentEvents(mockClient, 'tenant-1', 'user-123', 10);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $3'),
        ['tenant-1', 'user-123', 10]
      );
    });
  });

  describe('storeEvent', () => {
    test('should insert new event if it does not exist', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: { page: '/home' },
        timestamp: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Idempotency check
        .mockResolvedValueOnce({
          rows: [{
            id: 'uuid-123',
            ...eventData,
          }],
        });

      const result = await worker.storeEvent(mockClient, eventData);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM events WHERE event_id = $1 AND tenant_id = $2',
        ['event-123', 'tenant-1']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events'),
        expect.arrayContaining(['event-123', 'tenant-1', 'user-456'])
      );
    });

    test('should return existing event if it already exists', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {},
      };

      const existingEvent = {
        id: 'uuid-123',
        ...eventData,
      };

      mockClient.query.mockResolvedValueOnce({
        rows: [existingEvent],
      });

      const result = await worker.storeEvent(mockClient, eventData);

      expect(result).toEqual(existingEvent);
      expect(mockClient.query).toHaveBeenCalledTimes(1); // Only idempotency check
    });
  });

  describe('generateAndStorePersona', () => {
    test('should create new persona if it does not exist', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
      ];
      const eventIds = ['evt-1'];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing persona
        .mockResolvedValueOnce({}); // Insert persona

      await worker.generateAndStorePersona(
        mockClient,
        'tenant-1',
        'user-123',
        events,
        eventIds
      );

      expect(generatePersonaWithRetry).toHaveBeenCalledWith(events);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO personas'),
        expect.arrayContaining(['tenant-1', 'user-123'])
      );
    });

    test('should update existing persona if it exists', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
      ];
      const eventIds = ['evt-1'];

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'persona-123' }],
        }) // Existing persona found
        .mockResolvedValueOnce({}); // Update persona

      await worker.generateAndStorePersona(
        mockClient,
        'tenant-1',
        'user-123',
        events,
        eventIds
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE personas'),
        expect.arrayContaining(['tenant-1', 'user-123'])
      );
    });

    test('should throw error if persona generation fails', async () => {
      const error = new Error('Persona generation failed');
      generatePersonaWithRetry.mockRejectedValueOnce(error);

      const events = [{ event_id: 'evt-1', event_type: 'page_view', event_data: {} }];

      await expect(
        worker.generateAndStorePersona(mockClient, 'tenant-1', 'user-123', events, ['evt-1'])
      ).rejects.toThrow('Persona generation failed');
    });
  });

  describe('processMessage', () => {
    test('should process message successfully', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {},
      };

      const message = {
        data: Buffer.from(JSON.stringify(eventData)),
        ack: jest.fn(),
        nack: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Idempotency check
        .mockResolvedValueOnce({
          rows: [{ id: 'uuid-123', ...eventData }],
        }) // Store event
        .mockResolvedValueOnce({
          rows: [
            {
              event_id: 'event-123',
              event_type: 'page_view',
              event_data: {},
              created_at: new Date(),
            },
          ],
        }) // Get recent events
        .mockResolvedValueOnce({ rows: [] }) // Check existing persona
        .mockResolvedValueOnce({}) // Insert persona
        .mockResolvedValueOnce({}); // COMMIT

      await worker.processMessage(message);

      expect(message.ack).toHaveBeenCalled();
      expect(message.nack).not.toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should handle invalid message data', async () => {
      const message = {
        data: Buffer.from('invalid json'),
        ack: jest.fn(),
        nack: jest.fn(),
      };

      await worker.processMessage(message);

      expect(message.ack).toHaveBeenCalled(); // Should ack invalid messages
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    test('should rollback transaction on error', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {},
      };

      const message = {
        data: Buffer.from(JSON.stringify(eventData)),
        ack: jest.fn(),
        nack: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Store event fails

      await worker.processMessage(message);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(message.nack).toHaveBeenCalled(); // Should nack for retry
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    test('should set up message and error handlers', async () => {
      await worker.start();

      expect(mockSubscription.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSubscription.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
