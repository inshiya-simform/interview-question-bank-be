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
  // S3-compatible object storage (MinIO locally) for images embedded in answer notes
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3Region: process.env.S3_REGION ?? 'us-east-1',
  s3AccessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  s3SecretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
  s3Bucket: process.env.S3_BUCKET ?? 'question-images',
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  // Prefix for image URLs stored in notes; empty = relative paths (same origin / proxied frontend)
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, ''),
} as const;
