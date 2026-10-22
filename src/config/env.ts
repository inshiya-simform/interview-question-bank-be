import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  duplicateSimilarityThreshold: Number(process.env.DUPLICATE_SIMILARITY_THRESHOLD ?? 0.8),
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  passwordResetExpiryMinutes: Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES ?? 30),
} as const;
