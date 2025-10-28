/**
 * Vectorization service using Cloudflare AI
 * Generates embeddings and stores in Vectorize
 */

import { Env, Job } from './types';
import { extractEmbeddingText, chunkArray } from './utils';

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const BATCH_SIZE = 10; // Process embeddings in batches

/**
 * Generate embedding for a single job
 */
export async function generateJobEmbedding(env: Env, job: Job): Promise<number[]> {
  const text = extractEmbeddingText(job);

  try {
    const response = await env.AI.run(EMBEDDING_MODEL, {
      text: [text]
    });

    // Response format: { data: [[embedding values]] }
    if (response && response.data && response.data[0]) {
      return response.data[0] as number[];
    }

    throw new Error('Invalid embedding response format');
  } catch (error) {
    console.error(`Failed to generate embedding for job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Store job embedding in Vectorize
 */
export async function storeJobVector(
  env: Env,
  job: Job,
  embedding: number[]
): Promise<void> {
  try {
    await env.JOBS_VECTORIZE.upsert([
      {
        id: job.id,
        values: embedding,
        metadata: {
          title: job.title,
          company: job.company,
          location: job.location || '',
          url: job.url,
          source: job.source,
          posted_date: job.posted_date || ''
        }
      }
    ]);
  } catch (error) {
    console.error(`Failed to store vector for job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Vectorize multiple jobs in batches
 */
export async function vectorizeJobs(env: Env, jobs: Job[]): Promise<number> {
  let successCount = 0;
  const batches = chunkArray(jobs, BATCH_SIZE);

  console.log(`📊 Vectorizing ${jobs.length} jobs in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} jobs)`);

    await Promise.allSettled(
      batch.map(async (job) => {
        try {
          const embedding = await generateJobEmbedding(env, job);
          await storeJobVector(env, job, embedding);
          successCount++;
        } catch (error) {
          console.error(`Failed to vectorize job ${job.id}:`, error);
        }
      })
    );

    // Rate limiting between batches
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Vectorized ${successCount}/${jobs.length} jobs`);
  return successCount;
}

/**
 * Semantic search using vector similarity
 */
export async function semanticSearch(
  env: Env,
  queryText: string,
  topK: number = 10,
  filter?: Record<string, any>
): Promise<any[]> {
  try {
    // Generate embedding for query
    const response = await env.AI.run(EMBEDDING_MODEL, {
      text: [queryText]
    });

    if (!response || !response.data || !response.data[0]) {
      throw new Error('Failed to generate query embedding');
    }

    const queryVector = response.data[0] as number[];

    // Search Vectorize
    const results = await env.JOBS_VECTORIZE.query(queryVector, {
      topK,
      returnValues: false,
      returnMetadata: 'all',
      filter
    });

    return results.matches || [];
  } catch (error) {
    console.error('Semantic search failed:', error);
    throw error;
  }
}

/**
 * Find similar jobs to a given job
 */
export async function findSimilarJobs(
  env: Env,
  jobId: string,
  topK: number = 5
): Promise<any[]> {
  try {
    // Get the job's vector
    const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?')
      .bind(jobId)
      .first<Job>();

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Use the job's title and description for semantic search
    const queryText = extractEmbeddingText(job);
    const results = await semanticSearch(env, queryText, topK + 1); // +1 to exclude self

    // Filter out the original job
    return results.filter(r => r.id !== jobId);
  } catch (error) {
    console.error(`Failed to find similar jobs for ${jobId}:`, error);
    throw error;
  }
}
