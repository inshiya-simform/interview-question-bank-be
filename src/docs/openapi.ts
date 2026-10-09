import { env } from '../config/env.js';

// Add new endpoints under `paths` as they are built; reuse the shared `components`.
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Interview Question Bank API',
    version: '1.0.0',
    description:
      'Shared, searchable bank of interview questions with client-restricted visibility.',
  },
  servers: [{ url: `http://localhost:${env.port}/api/v1`, description: 'Local' }],
  tags: [{ name: 'Health', description: 'Service status' }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: {
          '200': {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Health: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number', example: 12.3 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          stack: { type: 'string', description: 'Development only' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated but not allowed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Not found (also returned for resources the caller may not see)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;
