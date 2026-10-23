import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';

// The only file that knows images live in S3-compatible storage (MinIO locally).
// forcePathStyle - controls how the s3 clients puts the bucket name into the request URL
const client = new S3Client({
  endpoint: env.s3Endpoint,
  region: env.s3Region,
  forcePathStyle: env.s3ForcePathStyle,
  credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
});

let bucketReady: Promise<void> | undefined;

// Creates the bucket on first use so a fresh MinIO needs no manual setup.
// HeadBucketCommand is used to check if the bucket exists, and CreateBucketCommand is used to create it if it doesn't.
function ensureBucket(): Promise<void> {
  bucketReady ??= client
    .send(new HeadBucketCommand({ Bucket: env.s3Bucket }))
    .then(() => undefined)
    .catch(() => client.send(new CreateBucketCommand({ Bucket: env.s3Bucket })).then(() => undefined))
    .catch((err) => {
      bucketReady = undefined; // retry on the next call
      throw err;
    });
  return bucketReady;
}

// PutObjectCommand is used to upload an image, GetObjectCommand is used to retrieve an image stream, and DeleteObjectCommand is used to delete an image.
export async function saveImage(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await client.send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getImageStream(key: string): Promise<Readable> {
  const result = await client.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  return result.Body as Readable;
}

export async function deleteImage(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}
