import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { ALLOWED_MIME_TYPES, ORPHAN_AGE_MS, SWEEP_INTERVAL_MS } from '../constants/image.constants.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { deleteImage, getImageStream, saveImage } from './imageStorage.service.js';

export async function uploadImage(file: Express.Multer.File, userId: string): Promise<{ id: string; url: string }> {
  // Trust the bytes, not the client-supplied mimetype or filename.
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only PNG, JPEG, WebP or GIF images are accepted');
  }

  const id = randomUUID();
  const objectKey = `question-images/${id}.${detected.ext}`;
  await saveImage(objectKey, file.buffer, detected.mime);
  await prisma.questionImage.create({
    data: { id, objectKey, mimeType: detected.mime, size: file.size, createdById: userId },
  });

  return { id, url: `${env.apiPublicUrl}/api/v1/uploads/images/${id}` };
}

export async function getImage(id: string) {
  const image = await prisma.questionImage.findUnique({ where: { id } });
  if (!image) throw new AppError(404, 'NOT_FOUND', 'Image not found');
  return { image, stream: await getImageStream(image.objectKey) };
}

// Deletes uploads older than a day that no question or pending draft refers to.
export async function sweepOrphanImages(): Promise<number> {
  const candidates = await prisma.questionImage.findMany({
    where: { createdAt: { lt: new Date(Date.now() - ORPHAN_AGE_MS) } },
    take: 200,
  });

  let removed = 0;
  for (const image of candidates) {
    const [inQuestion, inDraft] = await Promise.all([
      prisma.question.count({ where: { answerNotes: { contains: image.id } } }),
      prisma.questionDraft.count({ where: { payload: { path: ['answerNotes'], string_contains: image.id } } }),
    ]);
    if (inQuestion || inDraft) continue;
    await deleteImage(image.objectKey);
    await prisma.questionImage.delete({ where: { id: image.id } });
    removed += 1;
  }
  return removed;
}

// Starts a background sweep of orphan images every SWEEP_INTERVAL_MS milliseconds.
export function startOrphanImageSweep(): void {
  const run = () =>
    sweepOrphanImages().catch((err) => console.error(JSON.stringify({ event: 'image_sweep_failed', error: String(err) })));
  void run();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
