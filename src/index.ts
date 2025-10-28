/**
 * =====================================================
 * Cloudflare Worker: Core Job Intelligence System
 * AI-augmented job discovery, vectorization, and classification
 * =====================================================
 */

import { Env, JobQueueMessage } from './types';
import { getTopJobs, searchJobs, getRecentRuns, getUnclassifiedJobs } from './database';
import { semanticSearch, findSimilarJobs } from './vectorize';
import { processJobBatch, enqueueJobs } from './queue';
import { scrapeAllJobs } from './scraper';
import { upsertJobs, createScraperRun, updateScraperRun } from './database';
import { vectorizeJobs } from './vectorize';

// Export Durable Object and Workflow
export { JobsActor } from './actor';
export { JobsWorkflow } from './workflow';

/**
 * Main Worker Export
 */
export default {
  /**
   * Cron Trigger: Runs daily at 08:00 UTC
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('⏰ Cron trigger fired: Starting daily job scraping workflow...');

    try {
      // Trigger workflow
      const workflow = await env.JOBS_WORKFLOW.create();
      console.log(`🔄 Workflow started: ${workflow.id}`);

      // Wait for workflow completion (optional)
      ctx.waitUntil(
        workflow.get().then(result => {
          console.log('✅ Workflow completed:', result);
        })
      );
    } catch (error) {
      console.error('❌ Cron job failed:', error);

      // Log error to KV for monitoring
      await env.KV.put(
        'last_error',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          error: String(error),
          type: 'cron'
        })
      );
    }
  },

  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handlers
      let response: Response;

      switch (path) {
        case '/':
          response = handleRoot();
          break;

        case '/jobs':
          response = await handleGetJobs(env, url);
          break;

        case '/jobs/search':
          response = await handleSearchJobs(env, url);
          break;

        case '/jobs/semantic':
          response = await handleSemanticSearch(env, url);
          break;

        case '/jobs/similar':
          response = await handleSimilarJobs(env, url);
          break;

        case '/trigger':
          response = await handleManualTrigger(env, ctx);
          break;

        case '/status':
          response = await handleStatus(env);
          break;

        case '/runs':
          response = await handleGetRuns(env);
          break;

        default:
          response = new Response('Not Found', { status: 404 });
      }

      // Add CORS headers to response
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error('Request failed:', error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  },

  /**
   * Queue Consumer Handler
   */
  async queue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
    await processJobBatch(batch, env);
  }
};

/**
 * Root endpoint
 */
function handleRoot(): Response {
  return new Response(
    JSON.stringify({
      name: 'LinkedIn Jobs Intelligence Worker',
      version: '1.0.0',
      status: 'operational',
      endpoints: {
        '/jobs': 'Get top jobs by fit score',
        '/jobs/search?q={query}': 'Search jobs by text',
        '/jobs/semantic?q={query}': 'Semantic search using AI embeddings',
        '/jobs/similar?id={jobId}': 'Find similar jobs',
        '/trigger': 'Manually trigger scraping workflow',
        '/status': 'System status and statistics',
        '/runs': 'Recent scraper runs'
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Get top jobs by fit score
 */
async function handleGetJobs(env: Env, url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const jobs = await getTopJobs(env, limit);

  return new Response(JSON.stringify({ jobs, count: jobs.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Search jobs by text query
 */
async function handleSearchJobs(env: Env, url: URL): Response {
  const query = url.searchParams.get('q');
  if (!query) {
    return new Response('Missing query parameter', { status: 400 });
  }

  const jobs = await searchJobs(env, query);

  return new Response(JSON.stringify({ jobs, count: jobs.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Semantic search using vector embeddings
 */
async function handleSemanticSearch(env: Env, url: URL): Response {
  const query = url.searchParams.get('q');
  const topK = parseInt(url.searchParams.get('limit') || '10');

  if (!query) {
    return new Response('Missing query parameter', { status: 400 });
  }

  const results = await semanticSearch(env, query, topK);

  return new Response(JSON.stringify({ results, count: results.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Find similar jobs
 */
async function handleSimilarJobs(env: Env, url: URL): Response {
  const jobId = url.searchParams.get('id');
  if (!jobId) {
    return new Response('Missing job ID parameter', { status: 400 });
  }

  const similar = await findSimilarJobs(env, jobId);

  return new Response(JSON.stringify({ similar, count: similar.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Manually trigger workflow
 */
async function handleManualTrigger(env: Env, ctx: ExecutionContext): Response {
  console.log('🔄 Manual workflow trigger received...');

  const workflow = await env.JOBS_WORKFLOW.create();

  ctx.waitUntil(
    workflow.get().then(result => {
      console.log('✅ Manual workflow completed:', result);
    })
  );

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Workflow triggered successfully',
      workflowId: workflow.id
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * System status and statistics
 */
async function handleStatus(env: Env): Response {
  try {
    // Get stats from DB
    const totalJobs = await env.DB.prepare('SELECT COUNT(*) as count FROM jobs')
      .first<{ count: number }>();

    const classifiedJobs = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM job_metadata'
    ).first<{ count: number }>();

    const recentRuns = await getRecentRuns(env, 5);

    const lastRun = await env.KV.get('latest_run', 'json');

    return new Response(
      JSON.stringify({
        status: 'operational',
        timestamp: new Date().toISOString(),
        stats: {
          totalJobs: totalJobs?.count || 0,
          classifiedJobs: classifiedJobs?.count || 0,
          unclassifiedJobs: (totalJobs?.count || 0) - (classifiedJobs?.count || 0)
        },
        lastRun,
        recentRuns: recentRuns.slice(0, 3)
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        error: String(error)
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Get recent scraper runs
 */
async function handleGetRuns(env: Env): Response {
  const runs = await getRecentRuns(env, 20);

  return new Response(JSON.stringify({ runs, count: runs.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
