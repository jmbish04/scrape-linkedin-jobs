/**
 * Utility functions
 */

import { createHash } from 'crypto';

/**
 * Generate unique job ID from URL, company, and title
 */
export function generateJobId(url: string, company: string, title: string): string {
  const normalized = `${url}|${company}|${title}`.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Retry utility with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract text content for embedding (title + description)
 */
export function extractEmbeddingText(job: { title: string; description: string | null; company: string }): string {
  const parts = [
    `Job Title: ${job.title}`,
    `Company: ${job.company}`,
    job.description ? `Description: ${truncate(job.description, 1000)}` : ''
  ];

  return parts.filter(Boolean).join('\n\n');
}
