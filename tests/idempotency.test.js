/**
 * Tests for idempotency utilities
 */
import { checkEventExists } from '../src/utils/idempotency.js';
import { query } from '../src/database/connection.js';

// Mock database connection
jest.mock('../src/database/connection.js');

describe('Idempotency Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkEventExists', () => {
    test('should return event if it exists', async () => {
      const mockEvent = {
        id: 'event-uuid',
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        user_id: 'user-456',
        event_type: 'page_view',
        event_data: { page: '/home' },
        created_at: new Date(),
      };

      query.mockResolvedValue({
        rows: [mockEvent],
      });

      const result = await checkEventExists('event-123', 'tenant-1');

      expect(result).toEqual(mockEvent);
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM events WHERE event_id = $1 AND tenant_id = $2',
        ['event-123', 'tenant-1']
      );
    });

    test('should return null if event does not exist', async () => {
      query.mockResolvedValue({
        rows: [],
      });

      const result = await checkEventExists('non-existent', 'tenant-1');

      expect(result).toBeNull();
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM events WHERE event_id = $1 AND tenant_id = $2',
        ['non-existent', 'tenant-1']
      );
    });

    test('should check both event_id and tenant_id', async () => {
      query.mockResolvedValue({
        rows: [],
      });

      await checkEventExists('event-123', 'tenant-1');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('event_id = $1 AND tenant_id = $2'),
        ['event-123', 'tenant-1']
      );
    });

    test('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      query.mockRejectedValue(error);

      await expect(checkEventExists('event-123', 'tenant-1')).rejects.toThrow('Database connection failed');
    });
  });
});
