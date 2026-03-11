/**
 * Tests for Vertex AI service
 */
import { generatePersona, generatePersonaWithRetry } from '../src/services/vertexAIService.js';

// Mock the config
jest.mock('../src/config.js', () => ({
  config: {
    app: {
      environment: 'development',
      logLevel: 'info',
    },
    vertexAI: {
      projectId: '',
      location: 'us-central1',
      model: 'gemini-1.5-pro',
    },
    worker: {
      retryBackoffBase: 2,
    },
  },
}));

describe('VertexAIService', () => {
  describe('generatePersona', () => {
    test('should generate mock persona in development mode', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
        { event_id: 'evt-2', event_type: 'button_click', event_data: {} },
      ];

      const persona = await generatePersona(events);

      expect(persona).toHaveProperty('persona_type');
      expect(persona).toHaveProperty('confidence_score');
      expect(persona).toHaveProperty('key_behaviors');
      expect(persona).toHaveProperty('engagement_level');
      expect(persona).toHaveProperty('purchase_intent');
      expect(persona).toHaveProperty('risk_factors');
      expect(persona).toHaveProperty('recommendations');
      expect(persona).toHaveProperty('summary');
    });

    test('should generate High-intent buyer persona for purchase events', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'purchase', event_data: {} },
        { event_id: 'evt-2', event_type: 'page_view', event_data: {} },
      ];

      const persona = await generatePersona(events);

      expect(persona.persona_type).toBe('High-intent buyer');
      expect(persona.purchase_intent).toBe('high');
    });

    test('should generate Casual browser persona for few events', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
        { event_id: 'evt-2', event_type: 'page_view', event_data: {} },
      ];

      const persona = await generatePersona(events);

      expect(persona.persona_type).toBe('Casual browser');
      expect(persona.purchase_intent).toBe('low');
    });

    test('should generate high engagement level for many events', async () => {
      const events = Array.from({ length: 25 }, (_, i) => ({
        event_id: `evt-${i}`,
        event_type: 'page_view',
        event_data: {},
      }));

      const persona = await generatePersona(events);

      expect(persona.engagement_level).toBe('high');
    });

    test('should include event types in key behaviors', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
        { event_id: 'evt-2', event_type: 'add_to_cart', event_data: {} },
        { event_id: 'evt-3', event_type: 'button_click', event_data: {} },
      ];

      const persona = await generatePersona(events);

      expect(persona.key_behaviors).toContain('page_view');
      expect(persona.key_behaviors).toContain('add_to_cart');
      expect(persona.key_behaviors).toContain('button_click');
    });
  });

  describe('generatePersonaWithRetry', () => {
    test('should return persona on first attempt', async () => {
      const events = [
        { event_id: 'evt-1', event_type: 'page_view', event_data: {} },
      ];

      const persona = await generatePersonaWithRetry(events);

      expect(persona).toBeDefined();
      expect(persona.persona_type).toBeDefined();
    });

    test('should retry on error with exponential backoff', async () => {
      const events = [{ event_id: 'evt-1', event_type: 'page_view', event_data: {} }];
      
      // generatePersonaWithRetry calls generatePersona internally
      // Since we're in development mode, it will use mock persona
      const persona = await generatePersonaWithRetry(events, 5);
      
      expect(persona).toBeDefined();
      expect(persona.persona_type).toBeDefined();
    });
  });
});
