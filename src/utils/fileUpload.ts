import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Saves an image buffer to the local uploads directory.
 * Returns the web accessible URL path and absolute local file path.
 */
export const uploadImage = async (
  fileBuffer: Buffer,
  originalName: string,
  folder: string = 'vehicles',
): Promise<{ url: string; filepath: string }> => {
  const targetDir = path.join(env.uploadPath, folder);
  await fs.mkdir(targetDir, { recursive: true });

  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(targetDir, filename);

  await fs.writeFile(filepath, fileBuffer);

  const urlPath = `${env.appDomain}/uploads/${folder}/${filename}`;
  return {
    url: urlPath,
    filepath,
  };
};

/**
 * Deletes an image file from the local uploads directory given its URL path or relative path.
 */
export const deleteImage = async (photoPathOrUrl: string): Promise<void> => {
  if (!photoPathOrUrl) return;

  try {
    let relativePath = photoPathOrUrl;

    // Handle full URLs if present
    if (photoPathOrUrl.startsWith('http://') || photoPathOrUrl.startsWith('https://')) {
      const parsedUrl = new URL(photoPathOrUrl);
      relativePath = parsedUrl.pathname;
    }

    // Strip leading '/uploads/' or 'uploads/' prefix to locate file in env.uploadPath
    if (relativePath.startsWith('/uploads/')) {
      relativePath = relativePath.replace(/^\/uploads\//, '');
    } else if (relativePath.startsWith('uploads/')) {
      relativePath = relativePath.replace(/^uploads\//, '');
    }

    const fullPath = path.join(env.uploadPath, relativePath);
    await fs.unlink(fullPath);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code !== 'ENOENT') {
      console.error(`Failed to delete local file ${photoPathOrUrl}:`, error);
    }
  }
};
