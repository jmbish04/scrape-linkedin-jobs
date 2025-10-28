/**
 * Queue consumer for batch job processing
 * Handles classification requests from the queue
 */

import { Env, JobQueueMessage } from './types';
import { storeJobMetadata } from './database';

/**
 * Process a batch of jobs from the queue
 */
export async function processJobBatch(
  batch: MessageBatch<JobQueueMessage>,
  env: Env
): Promise<void> {
  console.log(`📬 Processing queue batch: ${batch.messages.length} jobs`);

  const results = await Promise.allSettled(
    batch.messages.map(msg => processJobMessage(msg, env))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`✅ Queue batch processed: ${successful} successful, ${failed} failed`);

  // Acknowledge all messages (even failed ones to avoid reprocessing)
  batch.ackAll();
}

/**
 * Process a single job message
 */
async function processJobMessage(
  message: Message<JobQueueMessage>,
  env: Env
): Promise<void> {
  const { jobId, title, description, company } = message.body;

  try {
    console.log(`🔄 Processing job ${jobId}: ${title}`);

    // Get or create Durable Object for this job
    const actorId = env.JOBS_ACTOR.idFromName(jobId);
    const actor = env.JOBS_ACTOR.get(actorId);

    // Send classification request to actor
    const response = await actor.fetch('https://actor/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, title, description, company })
    });

    if (!response.ok) {
      throw new Error(`Actor classification failed: ${response.statusText}`);
    }

    const classification = await response.json();

    // Store classification metadata in D1
    await storeJobMetadata(env, {
      job_id: jobId,
      fit_score: classification.fit_score,
      domain: classification.domain,
      seniority: classification.seniority,
      skills: JSON.stringify(classification.skills),
      classification_result: JSON.stringify(classification)
    });

    console.log(`✅ Job ${jobId} classified with fit score: ${classification.fit_score}`);
  } catch (error) {
    console.error(`❌ Failed to process job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Send jobs to queue for classification
 */
export async function enqueueJobs(
  env: Env,
  jobs: Array<{ id: string; title: string; description: string; company: string }>
): Promise<number> {
  console.log(`📤 Enqueuing ${jobs.length} jobs for classification...`);

  let enqueuedCount = 0;

  // Send in batches to respect queue limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);

    try {
      await env.JOBS_QUEUE.sendBatch(
        batch.map(job => ({
          body: {
            jobId: job.id,
            title: job.title,
            description: job.description || '',
            company: job.company
          }
        }))
      );

      enqueuedCount += batch.length;
    } catch (error) {
      console.error(`Failed to enqueue batch ${i / BATCH_SIZE + 1}:`, error);
    }
  }

  console.log(`✅ Enqueued ${enqueuedCount}/${jobs.length} jobs`);
  return enqueuedCount;
}
