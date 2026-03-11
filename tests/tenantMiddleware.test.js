/**
 * Tests for tenant middleware
 */
import { requireTenantId, validateTenantAccess } from '../src/middleware/tenantMiddleware.js';
import express from 'express';
import request from 'supertest';

const app = express();
app.use(express.json());
app.get('/test', requireTenantId, (req, res) => {
  res.json({ tenantId: req.tenantId });
});

describe('Tenant Middleware', () => {
  describe('requireTenantId', () => {
    test('should allow request with X-Tenant-ID header', async () => {
      const response = await request(app)
        .get('/test')
        .set('X-Tenant-ID', 'tenant-123');

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('tenant-123');
    });

    test('should reject request without X-Tenant-ID header', async () => {
      const response = await request(app)
        .get('/test');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('X-Tenant-ID');
    });
  });

  describe('validateTenantAccess', () => {
    test('should allow access when tenant IDs match', () => {
      expect(() => {
        validateTenantAccess('tenant-123', 'tenant-123');
      }).not.toThrow();
    });

    test('should throw error when tenant IDs do not match', () => {
      expect(() => {
        validateTenantAccess('tenant-123', 'tenant-456');
      }).toThrow('Access denied: tenant mismatch');
    });
  });
});
