import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import routes from './routes/index.js';

const app = express();
app.set('trust proxy', 1); // behind Render's proxy; needed for per-client rate limiting

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/docs.json', (_req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec as object));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
