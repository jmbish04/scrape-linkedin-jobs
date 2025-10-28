/**
 * Workflow orchestration for job classification pipeline
 * Coordinates scraping → vectorization → classification
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env } from './types';
import { scrapeAllJobs } from './scraper';
import { upsertJobs, createScraperRun, updateScraperRun, getUnclassifiedJobs } from './database';
import { vectorizeJobs } from './vectorize';
import { enqueueJobs } from './queue';

export class JobsWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<any>, step: WorkflowStep) {
    const config = event.payload || {};

    // Step 1: Create scraper run record
    const runId = await step.do('create-run', async () => {
      console.log('📝 Creating scraper run record...');
      return await createScraperRun(this.env, 'workflow');
    });

    // Step 2: Scrape jobs from multiple sources
    const jobs = await step.do('scrape-jobs', async () => {
      console.log('🔍 Starting job scraping...');
      return await scrapeAllJobs();
    });

    // Step 3: Persist jobs to D1 (with deduplication)
    const { new: newJobs, updated: updatedJobs } = await step.do('persist-jobs', async () => {
      console.log(`💾 Persisting ${jobs.length} jobs to database...`);
      return await upsertJobs(this.env, jobs);
    });

    // Step 4: Vectorize all jobs (upsert is idempotent, safe to re-vectorize)
    const vectorizedCount = await step.do('vectorize-jobs', async () => {
      console.log('📊 Generating embeddings...');
      // Vectorize all jobs - the upsert operation in Vectorize is idempotent
      return await vectorizeJobs(this.env, jobs);
    });

    // Step 5: Get unclassified jobs and enqueue for classification
    const enqueuedCount = await step.do('enqueue-classification', async () => {
      console.log('📤 Enqueuing jobs for AI classification...');
      const unclassified = await getUnclassifiedJobs(this.env, 100);

      return await enqueueJobs(
        this.env,
        unclassified.map(j => ({
          id: j.id,
          title: j.title,
          description: j.description || '',
          company: j.company
        }))
      );
    });

    // Step 6: Update scraper run with final stats
    await step.do('finalize-run', async () => {
      console.log('✅ Finalizing scraper run...');
      await updateScraperRun(this.env, runId, {
        jobs_found: jobs.length,
        jobs_new: newJobs,
        jobs_updated: updatedJobs,
        status: 'completed'
      });
    });

    // Step 7: Save snapshot to KV
    await step.do('save-snapshot', async () => {
      console.log('💾 Saving run snapshot to KV...');
      await this.env.KV.put(
        'latest_run',
        JSON.stringify({
          runId,
          timestamp: new Date().toISOString(),
          stats: {
            jobs_found: jobs.length,
            jobs_new: newJobs,
            jobs_updated: updatedJobs,
            vectorized: vectorizedCount,
            enqueued: enqueuedCount
          }
        }),
        {
          metadata: { updated: new Date().toISOString() }
        }
      );
    });

    console.log(`
🎉 Workflow completed successfully!
   - Jobs found: ${jobs.length}
   - New jobs: ${newJobs}
   - Updated jobs: ${updatedJobs}
   - Vectorized: ${vectorizedCount}
   - Enqueued for classification: ${enqueuedCount}
    `);

    return {
      success: true,
      runId,
      stats: {
        jobs_found: jobs.length,
        jobs_new: newJobs,
        jobs_updated: updatedJobs,
        vectorized: vectorizedCount,
        enqueued: enqueuedCount
      }
    };
  }
}
