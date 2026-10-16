
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
    { name: 'Admin', description: 'Super admin: staff accounts and client access' },
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
    '/auth/permissions': {
      get: {
        tags: ['Auth'],
        summary: 'Permissions of the current user, for toggling UI elements',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Role, permission codes and permitted client ids',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', example: 'USER' },
                    permissions: { type: 'array', items: { type: 'string', example: 'question:read' } },
                    clientIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  },
                },
              },
            },
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
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users with role and client grants (SUPER_ADMIN)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'All users, newest first',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create an author or reviewer with the default password (SUPER_ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateStaffRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'User created; password is the default and is never returned',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUser' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': {
            description: 'Email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/clients': {
      get: {
        tags: ['Admin'],
        summary: 'Clients with the users who have access, paginated (SUPER_ADMIN)',
        description: 'Drives the Client access page. `search` matches client name or the email of a user with access.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Clients sorted by name',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clients: { type: 'array', items: { $ref: '#/components/schemas/ClientAccess' } },
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
        tags: ['Admin'],
        summary: 'Create a client (SUPER_ADMIN)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                additionalProperties: false,
                properties: { name: { type: 'string', minLength: 1, maxLength: 100 } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Client created (no users yet)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientAccess' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': {
            description: 'Client name already exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/clients/{clientId}/users': {
      post: {
        tags: ['Admin'],
        summary: 'Give a user (by email) access to a client (SUPER_ADMIN)',
        description: 'Idempotent. Returns the client with its updated user list.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'clientId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                additionalProperties: false,
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated client',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientAccess' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/clients/{clientId}/users/{userId}': {
      delete: {
        tags: ['Admin'],
        summary: "Remove a user's access to a client (SUPER_ADMIN)",
        description: 'Idempotent. Returns the client with its updated user list.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'clientId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Updated client',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientAccess' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
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
          '409': {
            description:
              'DUPLICATE_SUSPECTED: the text is similar to existing visible questions. Resubmit with confirmDistinct: true and a distinctReason to store it anyway. Body: error.details.matches.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/questions/check-duplicate': {
      post: {
        tags: ['Questions'],
        summary: 'Check whether question text duplicates an existing one (requires question:create)',
        description:
          'Dry run: stores nothing. Compares only against questions the user can see. Call while the user types, then show the matches and let them mark the question as genuinely different (confirmDistinct on POST /questions).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                additionalProperties: false,
                properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Up to 5 similar visible questions, most similar first',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isDuplicate: { type: 'boolean' },
                    matches: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          text: { type: 'string' },
                          similarity: { type: 'number', minimum: 0, maximum: 1, example: 0.86 },
                        },
                      },
                    },
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
    },
    '/questions/{id}': {
      get: {
        tags: ['Questions'],
        summary: 'Get a question by id (requires question:read)',
        description:
          'Same visibility rules as the list endpoint. A question the user cannot see returns 404.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Question details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Question' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Questions'],
        summary: 'Edit a question (requires question:edit_own or question:edit_any)',
        description:
          'AUTHOR: only their own questions. REVIEWER: any question. Omitted fields are unchanged; `tags`, when sent, replaces the full tag set. Changes are recorded in question history.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateQuestionRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Updated question',
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
          confirmDistinct: { type: 'boolean', description: 'Store the question even though it matched a suspected duplicate' },
          distinctReason: { type: 'string', description: 'Required when confirmDistinct is true: how this question differs' },
        },
      },
      UpdateQuestionRequest: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        description: 'Same fields as CreateQuestionRequest, all optional, at least one required',
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 2000 },
          answerNotes: { type: 'string', maxLength: 10000 },
          clientId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Authors need a grant on the client; reviewers may use any client. null makes it unrestricted',
          },
          tags: { $ref: '#/components/schemas/CreateQuestionRequest/properties/tags' },
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
      CreateStaffRequest: {
        type: 'object',
        required: ['email', 'role'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1, maxLength: 100, description: "Defaults to the email's local part" },
          role: { type: 'string', enum: ['AUTHOR', 'REVIEWER'] },
        },
      },
      ClientAccess: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          userCount: { type: 'integer' },
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      AdminUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', example: 'AUTHOR' },
          createdAt: { type: 'string', format: 'date-time' },
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
