/**
 * Tests for Pub/Sub service
 */
import { PubSub } from '@google-cloud/pubsub';

// Mock Pub/Sub before importing the service
jest.mock('@google-cloud/pubsub');
jest.mock('../src/config.js', () => ({
  config: {
    pubsub: {
      emulatorHost: 'localhost:8085',
      topicEvents: 'user-events',
    },
    gcp: {
      projectId: 'test-project',
    },
    app: {
      logLevel: 'info',
    },
  },
}));

// Import after mocks are set up
import { initializePubSub, publishEvent, getTopic } from '../src/services/pubsubService.js';

describe('PubSubService', () => {
  let mockTopic;
  let mockPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockTopic = {
      get: jest.fn().mockResolvedValue([{}]),
      publishMessage: jest.fn().mockResolvedValue('message-id-123'),
    };
    
    mockPublisher = {
      topic: jest.fn().mockReturnValue(mockTopic),
    };
    
    PubSub.mockImplementation(() => mockPublisher);
  });

  describe('initializePubSub', () => {
    test('should initialize Pub/Sub with correct project ID', () => {
      initializePubSub();
      
      expect(PubSub).toHaveBeenCalledWith({
        projectId: 'test-project',
      });
      expect(mockPublisher.topic).toHaveBeenCalledWith('user-events');
    });

    test('should set PUBSUB_EMULATOR_HOST when emulator host is configured', () => {
      const originalEnv = process.env.PUBSUB_EMULATOR_HOST;
      delete process.env.PUBSUB_EMULATOR_HOST;
      
      initializePubSub();
      
      expect(process.env.PUBSUB_EMULATOR_HOST).toBe('localhost:8085');
      
      process.env.PUBSUB_EMULATOR_HOST = originalEnv;
    });
  });

  describe('publishEvent', () => {
    beforeEach(() => {
      initializePubSub();
    });

    test('should publish event successfully', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: { page: '/home' },
      };

      const messageId = await publishEvent(eventData);

      expect(messageId).toBe('message-id-123');
      expect(mockTopic.publishMessage).toHaveBeenCalledWith({
        data: expect.any(Buffer),
        attributes: {
          tenant_id: 'tenant-1',
          user_id: 'user-456',
          event_type: 'page_view',
        },
      });
    });

    test('should serialize event data to JSON buffer', async () => {
      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: { page: '/home' },
      };

      await publishEvent(eventData);

      const callArgs = mockTopic.publishMessage.mock.calls[0][0];
      const messageData = JSON.parse(callArgs.data.toString());
      
      expect(messageData).toEqual(eventData);
    });

    test('should throw error when publish fails', async () => {
      const error = new Error('Publish failed');
      mockTopic.publishMessage.mockRejectedValue(error);

      const eventData = {
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: {},
      };

      await expect(publishEvent(eventData)).rejects.toThrow('Publish failed');
    });
  });

  describe('getTopic', () => {
    test('should return the topic instance', () => {
      initializePubSub();
      const topic = getTopic();
      
      expect(topic).toBe(mockTopic);
    });
  });
});
