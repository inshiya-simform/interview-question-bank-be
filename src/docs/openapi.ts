
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
        summary: 'List clients the current user is permitted to access (all clients for a REVIEWER)',
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
        summary: 'List users with role and client grants, paginated (SUPER_ADMIN)',
        description: '`search` matches user name or email (case-insensitive).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['REVIEWER', 'USER'] } },
          {
            name: 'excludeAdmin',
            in: 'query',
            description: 'When true, SUPER_ADMIN users are omitted.',
            schema: { type: 'boolean' },
          },
        ],
        responses: {
          '200': {
            description: 'Users, newest first',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
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
        summary: 'Create a reviewer with the default password (SUPER_ADMIN)',
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
        summary: 'List live (approved) questions (requires question:read)',
        description:
          'The question bank: approved questions only, for every role. Questions with no client or a client the user holds a grant on; reviewers see every client. A user\'s own unapproved questions are not listed here: see GET /questions/submissions.',
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
        description: 'The question starts as PENDING_REVIEW and is visible only to its author and reviewers until a reviewer approves it.',
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
    '/questions/submissions': {
      get: {
        tags: ['Questions'],
        summary: 'List questions in review (requires question:read)',
        description:
          'Authors: their own questions (the My submissions tab). Reviewers: every author\'s (the review queue). Default statuses are PENDING_REVIEW, CHANGES_REQUESTED and REJECTED; an approved question with an edit waiting for review is PENDING_REVIEW and appears here as well as in the live list. Default order: reviewers oldest submitted first, authors newest first.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', example: 'PENDING_REVIEW,REJECTED' }, description: 'Comma-separated statuses (PENDING_REVIEW, APPROVED, CHANGES_REQUESTED, REJECTED)' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['submitted_asc', 'submitted_desc'] } },
        ],
        responses: {
          '200': {
            description: 'Submissions with review state (status, reviewNote, reviewedBy, author, isLive, hasDraft, submittedAt). For an edit of an approved question, `text` and the other fields are the live version and `draft` holds the submitted edit.',
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
    },
    '/questions/counts': {
      get: {
        tags: ['Questions'],
        summary: 'Per-status question counts for the tab badges (requires question:read)',
        description:
          'Badges for the submissions tabs. Reviewers get counts for the whole queue (matches GET /questions/submissions); everyone else gets counts of their own questions.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Counts, zero-filled for every status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    counts: {
                      type: 'object',
                      properties: {
                        PENDING_REVIEW: { type: 'integer' },
                        APPROVED: { type: 'integer' },
                        CHANGES_REQUESTED: { type: 'integer' },
                        REJECTED: { type: 'integer' },
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
    '/questions/import': {
      post: {
        tags: ['Questions'],
        summary: 'Bulk-create questions from a CSV file (requires question:create)',
        description:
          'Multipart upload, field "file" (.csv, max 2 MB, max 500 rows). Columns: text, answer_notes, tags (required); client, confirm_distinct, distinct_reason (optional). tags = "category:tag|tag;category:tag" using slugs; client = client name (must be one you hold a grant on). Every question is created as PENDING_REVIEW. All-or-nothing: if any row is invalid nothing is stored and error.details lists { row, column, message } (row 1 is the header). Suspected duplicates fail unless confirm_distinct is true with a distinct_reason.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Questions created and sent to review',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    imported: { type: 'integer' },
                    questions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { id: { type: 'string', format: 'uuid' }, text: { type: 'string' } },
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
    '/questions/import/template': {
      get: {
        tags: ['Questions'],
        summary: 'Download a sample import CSV (requires question:create)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'CSV header plus one example row', content: { 'text/csv': { schema: { type: 'string' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/questions/export': {
      get: {
        tags: ['Questions'],
        summary: 'Export questions as CSV (requires question:read)',
        description:
          'Downloads every question that GET /questions would list for the same filters, ignoring pagination. Columns: text, answer_notes, client, tags (same format as the import, so the file can be imported again). Fails with 400 if more than 10,000 questions match: narrow the filters.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Only questions of this client' },
          { name: 'tags', in: 'query', schema: { type: 'string', example: '1,2' }, description: 'Comma-separated tag ids; matches questions with any of them' },
          { name: 'categories', in: 'query', schema: { type: 'string', example: '1,3' }, description: 'Comma-separated category ids; matches questions with a tag in any of them' },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 }, description: 'Full-text search over question text and answer notes' },
        ],
        responses: {
          '200': { description: 'CSV file, newest question first', content: { 'text/csv': { schema: { type: 'string' } } } },
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
        summary: 'Edit your own question (requires question:edit_own)',
        description:
          'Omitted fields are unchanged; `tags`, when sent, replaces the full tag set. A question that was never approved is edited in place; an approved question keeps its live version and the edit is stored as a draft. Either way the status returns to PENDING_REVIEW. A REJECTED question cannot be edited (409). Changes are recorded in question history.',
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
          '409': { description: 'The question was rejected and can no longer be edited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/questions/{id}/history': {
      get: {
        tags: ['Questions'],
        summary: 'Review timeline of a question, newest first (author and reviewers only)',
        description:
          'Actions: CREATED (submitted), UPDATED (edit submitted), APPROVED, CHANGES_REQUESTED, REJECTED. `note` is present on change requests and rejections that have one.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'History entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    history: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          action: { type: 'string', enum: ['CREATED', 'UPDATED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] },
                          actor: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } },
                          createdAt: { type: 'string', format: 'date-time' },
                          note: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { description: 'Caller is neither the author nor a reviewer', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/questions/bulk/approve': {
      post: {
        tags: ['Questions'],
        summary: 'Approve several questions pending review (requires question:review)',
        description: 'Same rules as approving a single question. Each question is reviewed independently: ones that are missing or not pending review are reported in `failed` and do not stop the rest. Nothing is rolled back.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkReviewRequest' } } } },
        responses: {
          '200': { description: 'Outcome per question', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkReviewResult' } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/questions/bulk/reject': {
      post: {
        tags: ['Questions'],
        summary: 'Reject several questions pending review (requires question:review)',
        description: 'Same rules as rejecting a single question; the optional note applies to every question. Each question is reviewed independently: ones that are missing or not pending review are reported in `failed` and do not stop the rest. Nothing is rolled back.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkRejectRequest' } } } },
        responses: {
          '200': { description: 'Outcome per question', content: { 'application/json': { schema: { $ref: '#/components/schemas/BulkReviewResult' } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/questions/{id}/approve': {
      post: {
        tags: ['Questions'],
        summary: 'Approve a question pending review (requires question:review)',
        description: 'Makes a new question live, or applies a pending draft to an approved one. Any reviewer may approve.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Approved question', content: { 'application/json': { schema: { $ref: '#/components/schemas/Question' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Question is not pending review', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/questions/{id}/request-changes': {
      post: {
        tags: ['Questions'],
        summary: 'Ask the author for changes (requires question:review)',
        description: 'Sets status CHANGES_REQUESTED with the note. When the author edits, the question returns to PENDING_REVIEW.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ReviewNoteRequest' } } } },
        responses: {
          '200': { description: 'Question with status CHANGES_REQUESTED', content: { 'application/json': { schema: { $ref: '#/components/schemas/Question' } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Question is not pending review', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/questions/{id}/reject': {
      post: {
        tags: ['Questions'],
        summary: 'Reject a question pending review (requires question:review)',
        description: 'The note is optional. A never-approved question becomes REJECTED (final). For an approved question with a pending edit, the draft is discarded, the live version stays and the status returns to APPROVED.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/RejectRequest' } } } },
        responses: {
          '200': { description: 'Question after rejection', content: { 'application/json': { schema: { $ref: '#/components/schemas/Question' } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Question is not pending review', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
          role: { type: 'string', enum: ['REVIEWER', 'USER'] },
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
            description: 'Users need a grant on the client; reviewers may use any client. null makes it unrestricted',
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
          status: {
            type: 'string',
            enum: ['PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
            description: 'Everyone except the author and reviewers always sees APPROVED.',
          },
          reviewNote: { type: 'string', nullable: true, description: 'Author and reviewers only: latest change-request or rejection reason' },
          reviewedBy: {
            type: 'object',
            nullable: true,
            description: 'Author and reviewers only',
            properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
          },
          reviewedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Author and reviewers only' },
          author: {
            type: 'object',
            description: 'Author and reviewers only',
            properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
          },
          isLive: { type: 'boolean', description: 'Author and reviewers only: has been approved before. With hasDraft this is an edit of a live question (EDIT); without it, a new submission (NEW).' },
          submittedAt: { type: 'string', format: 'date-time', description: 'Author and reviewers only: when it was created or last (re)submitted for review' },
          hasDraft: { type: 'boolean', description: 'Author and reviewers only: an edit is waiting for review' },
          draft: {
            type: 'object',
            description: 'Single-question and submissions views, author and reviewers only: the pending edit of an approved question',
            properties: {
              text: { type: 'string' },
              answerNotes: { type: 'string' },
              client: {
                type: 'object',
                nullable: true,
                properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
              },
              tags: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ReviewNoteRequest: {
        type: 'object',
        required: ['note'],
        additionalProperties: false,
        properties: { note: { type: 'string', minLength: 1, maxLength: 1000 } },
      },
      RejectRequest: {
        type: 'object',
        additionalProperties: false,
        properties: { note: { type: 'string', maxLength: 1000, description: 'Optional reason shown to the author' } },
      },
      BulkReviewRequest: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
          ids: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
        },
      },
      BulkRejectRequest: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
          ids: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
          note: { type: 'string', maxLength: 1000, description: 'Optional reason shown to the authors' },
        },
      },
      BulkReviewResult: {
        type: 'object',
        properties: {
          succeeded: { type: 'array', items: { type: 'string', format: 'uuid' } },
          failed: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                code: { type: 'string', example: 'CONFLICT' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      CreateStaffRequest: {
        type: 'object',
        required: ['email', 'role'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1, maxLength: 100, description: "Defaults to the email's local part" },
          role: { type: 'string', enum: ['REVIEWER'] },
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
          role: { type: 'string', example: 'USER' },
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
