
// Add new endpoints under `paths` as they are built; reuse the shared `components`.
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Interview Question Bank API',
    version: '1.0.0',
    description:
      'Shared, searchable bank of interview questions with client-restricted visibility.',
  },
  servers: [{ url: '/api/v1', description: 'Current host' }],
  tags: [
    { name: 'Health', description: 'Service status' },
    { name: 'Auth', description: 'Registration, login and current user' },
    { name: 'Clients', description: 'Clients the caller may access' },
    { name: 'Tags', description: 'Tag categories and their tags' },
    { name: 'Questions', description: 'Interview questions' },
  ],
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
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user (role USER)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'User created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': {
            description: 'Email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user with role permissions and client grants',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Me' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/clients': {
      get: {
        tags: ['Clients'],
        summary: 'List clients the current user is permitted to access',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Permitted clients, sorted by name',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clients: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/tags': {
      get: {
        tags: ['Tags'],
        summary: 'List all tag categories with their tags',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Categories sorted by name, each with its tags sorted by name',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categories: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer' },
                          slug: { type: 'string', example: 'technology' },
                          name: { type: 'string' },
                          tags: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'integer' },
                                slug: { type: 'string' },
                                name: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/questions': {
      get: {
        tags: ['Questions'],
        summary: 'List questions the current user may see (requires question:read)',
        description:
          'USER: questions with no client or a client they hold a grant on. AUTHOR: the same plus their own questions. REVIEWER: all questions.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'clientId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Only questions of this client' },
          { name: 'tags', in: 'query', schema: { type: 'string', example: '1,2' }, description: 'Comma-separated tag ids; matches questions with any of them' },
          { name: 'categories', in: 'query', schema: { type: 'string', example: '1,3' }, description: 'Comma-separated category ids; matches questions with a tag in any of them' },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 }, description: 'Full-text search over question text and answer notes' },
        ],
        responses: {
          '200': {
            description: 'Visible questions, newest first',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Questions'],
        summary: 'Create a question (requires question:create)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateQuestionRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Question created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Question' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
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
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'UNAUTHENTICATED',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'CONFLICT',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              details: { description: 'Validation issues, when present' },
              stack: { type: 'string', description: 'Development only' },
            },
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'name', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', maxLength: 100 },
          password: { type: 'string', minLength: 8, maxLength: 72 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['AUTHOR', 'REVIEWER', 'USER'] },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/AuthUser' },
        },
      },
      CreateQuestionRequest: {
        type: 'object',
        required: ['text', 'answerNotes', 'tags'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 2000 },
          answerNotes: { type: 'string', maxLength: 10000 },
          clientId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Caller must hold a grant on this client',
          },
          tags: {
            type: 'array',
            minItems: 1,
            description: 'Tag ids grouped by category id; each categoryId at most once',
            items: {
              type: 'object',
              required: ['categoryId', 'tagIds'],
              additionalProperties: false,
              properties: {
                categoryId: { type: 'integer', minimum: 1 },
                tagIds: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } },
              },
            },
            example: [
              { categoryId: 1, tagIds: [1, 2] },
              { categoryId: 2, tagIds: [5] },
            ],
          },
          confirmDistinct: { type: 'boolean', description: 'Reserved for duplicate detection' },
          distinctReason: { type: 'string', description: 'Reserved for duplicate detection' },
        },
      },
      Question: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          text: { type: 'string' },
          answerNotes: { type: 'string' },
          client: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
          tags: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
          authorId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Me: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string', example: 'question:read' } },
          clients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
    responses: {
      ValidationError: {
        description: 'Request body failed validation',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
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
