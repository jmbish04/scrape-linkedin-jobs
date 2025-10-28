/**
 * Cloudflare Worker: LinkedIn Jobs Scraper
 * Purpose: Query LinkedIn Jobs daily for AI / Data Systems / Innovation leadership roles.
 * Save results to D1 or KV (depending on your binding setup).
 */

import linkedIn from 'linkedin-jobs-api';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndStoreJobs(env));
  },
  async fetch(request, env, ctx) {
    return new Response("LinkedIn Jobs Worker is running ✅", { status: 200 });
  }
};

async function fetchAndStoreJobs(env) {
  const queryOptions = {
    keyword: 'AI Product Manager OR Data Strategy Lead OR Innovation Strategist OR Head of Product Operations',
    location: 'Remote OR San Francisco OR Mountain View OR New York',
    dateSincePosted: 'past Week',
    jobType: 'full time',
    remoteFilter: 'hybrid',
    experienceLevel: 'senior',
    limit: '25',
    sortBy: 'recent',
    under_10_applicants: false,
  };

  try {
    const results = await linkedIn.query(queryOptions);
    console.log(`✅ Retrieved ${results.length} jobs from LinkedIn.`);

    // Optional: store in D1 (if bound)
    if (env.JOBS_DB) {
      const insertStmt = env.JOBS_DB.prepare(
        `INSERT INTO jobs (title, company, location, date, jobUrl)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const job of results) {
        await insertStmt.bind(
          job.position,
          job.company,
          job.location,
          job.date,
          job.jobUrl
        ).run();
      }
      console.log("💾 Jobs stored in D1 successfully.");
    }

    // Optional: save JSON snapshot in KV (if bound)
    if (env.JOBS_KV) {
      await env.JOBS_KV.put("latest_jobs", JSON.stringify(results), {
        metadata: { updated: new Date().toISOString() },
      });
      console.log("🪣 Jobs stored in KV snapshot.");
    }

  } catch (err) {
    console.error("❌ LinkedIn Jobs query failed:", err);
  }
}
