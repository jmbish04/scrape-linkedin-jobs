/**
 * Database service for D1 operations
 * Handles persistence, deduplication, and querying
 */

import { Job, JobMetadata, ScraperRun, Env } from './types';
import { generateUUID } from './utils';

/**
 * Insert or update jobs in D1 with deduplication
 */
export async function upsertJobs(env: Env, jobs: Job[]): Promise<{ new: number; updated: number }> {
  let newCount = 0;
  let updatedCount = 0;

  for (const job of jobs) {
    try {
      // Check if job exists
      const existing = await env.DB.prepare(
        'SELECT id FROM jobs WHERE url = ? AND company = ? AND title = ?'
      )
        .bind(job.url, job.company, job.title)
        .first<{ id: string }>();

      if (existing) {
        // Update existing job
        await env.DB.prepare(`
          UPDATE jobs
          SET description = ?,
              location = ?,
              salary_min = ?,
              salary_max = ?,
              posted_date = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .bind(
            job.description,
            job.location,
            job.salary_min,
            job.salary_max,
            job.posted_date,
            existing.id
          )
          .run();

        updatedCount++;
      } else {
        // Insert new job
        await env.DB.prepare(`
          INSERT INTO jobs (id, title, company, location, url, description, salary_min, salary_max, posted_date, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            job.id,
            job.title,
            job.company,
            job.location,
            job.url,
            job.description,
            job.salary_min,
            job.salary_max,
            job.posted_date,
            job.source
          )
          .run();

        newCount++;
      }
    } catch (error) {
      console.error(`Failed to upsert job ${job.id}:`, error);
    }
  }

  console.log(`💾 Database: ${newCount} new, ${updatedCount} updated`);
  return { new: newCount, updated: updatedCount };
}

/**
 * Store job classification metadata
 */
export async function storeJobMetadata(env: Env, metadata: JobMetadata): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO job_metadata (job_id, fit_score, domain, seniority, skills, classification_result)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        metadata.job_id,
        metadata.fit_score,
        metadata.domain,
        metadata.seniority,
        metadata.skills,
        metadata.classification_result
      )
      .run();
  } catch (error) {
    console.error(`Failed to store metadata for job ${metadata.job_id}:`, error);
  }
}

/**
 * Create scraper run record
 */
export async function createScraperRun(env: Env, source: string): Promise<string> {
  const runId = generateUUID();

  await env.DB.prepare(`
    INSERT INTO scraper_runs (id, source, status)
    VALUES (?, ?, 'running')
  `)
    .bind(runId, source)
    .run();

  return runId;
}

/**
 * Update scraper run with results
 */
export async function updateScraperRun(
  env: Env,
  runId: string,
  data: {
    jobs_found: number;
    jobs_new: number;
    jobs_updated: number;
    status: 'completed' | 'failed';
    errors?: string;
  }
): Promise<void> {
  await env.DB.prepare(`
    UPDATE scraper_runs
    SET completed_at = CURRENT_TIMESTAMP,
        jobs_found = ?,
        jobs_new = ?,
        jobs_updated = ?,
        status = ?,
        errors = ?
    WHERE id = ?
  `)
    .bind(
      data.jobs_found,
      data.jobs_new,
      data.jobs_updated,
      data.status,
      data.errors || null,
      runId
    )
    .run();
}

/**
 * Get unclassified jobs (jobs without metadata)
 */
export async function getUnclassifiedJobs(env: Env, limit: number = 100): Promise<Job[]> {
  const result = await env.DB.prepare(`
    SELECT j.* FROM jobs j
    LEFT JOIN job_metadata m ON j.id = m.job_id
    WHERE m.job_id IS NULL
    ORDER BY j.created_at DESC
    LIMIT ?
  `)
    .bind(limit)
    .all<Job>();

  return result.results || [];
}

/**
 * Get top jobs by fit score
 */
export async function getTopJobs(env: Env, limit: number = 50): Promise<any[]> {
  const result = await env.DB.prepare(`
    SELECT j.*, m.fit_score, m.domain, m.seniority, m.skills
    FROM jobs j
    INNER JOIN job_metadata m ON j.id = m.job_id
    WHERE m.fit_score >= 7.0
    ORDER BY m.fit_score DESC, j.posted_date DESC
    LIMIT ?
  `)
    .bind(limit)
    .all();

  return result.results || [];
}

/**
 * Search jobs by text query
 */
export async function searchJobs(env: Env, query: string, limit: number = 20): Promise<Job[]> {
  const searchPattern = `%${query}%`;
  const result = await env.DB.prepare(`
    SELECT * FROM jobs
    WHERE title LIKE ? OR description LIKE ? OR company LIKE ?
    ORDER BY posted_date DESC
    LIMIT ?
  `)
    .bind(searchPattern, searchPattern, searchPattern, limit)
    .all<Job>();

  return result.results || [];
}

/**
 * Get recent scraper runs
 */
export async function getRecentRuns(env: Env, limit: number = 10): Promise<ScraperRun[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM scraper_runs
    ORDER BY started_at DESC
    LIMIT ?
  `)
    .bind(limit)
    .all<ScraperRun>();

  return result.results || [];
}
