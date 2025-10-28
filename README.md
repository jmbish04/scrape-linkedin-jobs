# LinkedIn Jobs Intelligence Worker

> AI-augmented Cloudflare Worker for automated job discovery, vectorization, and classification

## Overview

This Cloudflare Worker implements a sophisticated job intelligence pipeline that:

- **Scrapes** job postings from multiple sources (LinkedIn + Indeed via ts-jobspy)
- **Vectorizes** job descriptions using Cloudflare AI embeddings
- **Classifies** jobs using AI-powered Durable Objects
- **Stores** structured data in D1 and semantic vectors in Vectorize
- **Orchestrates** end-to-end workflow using Queues and Workflows

## Architecture

```
Cron Trigger (08:00 UTC)
    ↓
Workflow Engine
    ↓
┌─────────────────────────────────────────────┐
│ 1. Scrape (ts-jobspy + linkedin-jobs-api)   │
│ 2. Normalize & Deduplicate                  │
│ 3. Persist to D1 Database                   │
│ 4. Generate Embeddings (Vectorize)          │
│ 5. Enqueue for Classification               │
└─────────────────────────────────────────────┘
    ↓
Queue → JobsActor (Durable Object)
    ↓
AI Classification (Cloudflare AI)
    ↓
Store Metadata (fit_score, domain, seniority)
```

## Target Roles

- AI Product Manager
- Data Strategy Lead
- Innovation Strategist
- Head of Product Operations
- AI Program Manager

## Target Locations

- Remote
- San Francisco Bay Area
- Seattle
- New York
- Austin

## Features

### 1. Dual-Source Scraping
- **Primary**: `ts-jobspy` (aggregates Indeed + LinkedIn)
- **Fallback**: `linkedin-jobs-api` (triggers if < 30 results)
- Automatic deduplication by URL + company + title

### 2. AI Vectorization
- Uses `@cf/baai/bge-base-en-v1.5` embedding model
- Stores vectors in Cloudflare Vectorize
- Enables semantic job search

### 3. Intelligent Classification
- AI-powered job scoring (0-10 fit score)
- Extracts domain, seniority, skills
- Powered by Durable Objects + Cloudflare AI

### 4. Scalable Processing
- Queue-based batch processing
- Workflow orchestration
- Automatic retry logic

## API Endpoints

### `GET /`
Health check and API documentation

### `GET /jobs?limit=50`
Get top jobs by fit score
```json
{
  "jobs": [...],
  "count": 50
}
```

### `GET /jobs/search?q={query}`
Text-based job search
```bash
curl https://your-worker.workers.dev/jobs/search?q=AI+Product
```

### `GET /jobs/semantic?q={query}&limit=10`
Semantic search using vector embeddings
```bash
curl https://your-worker.workers.dev/jobs/semantic?q=machine+learning+leadership
```

### `GET /jobs/similar?id={jobId}`
Find similar jobs based on embeddings
```bash
curl https://your-worker.workers.dev/jobs/similar?id=abc123
```

### `POST /trigger`
Manually trigger scraping workflow
```bash
curl -X POST https://your-worker.workers.dev/trigger
```

### `GET /status`
System status and statistics
```json
{
  "status": "operational",
  "stats": {
    "totalJobs": 1234,
    "classifiedJobs": 890,
    "unclassifiedJobs": 344
  }
}
```

### `GET /runs`
Recent scraper run history

## Setup & Deployment

### Prerequisites
- Cloudflare account with Workers paid plan
- Wrangler CLI installed
- Node.js 18+

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Cloudflare Resources

#### Create D1 Database
```bash
wrangler d1 create linkedin_jobs
```

Copy the database ID to `wrangler.toml`

#### Create KV Namespace
```bash
wrangler kv:namespace create "JOBS_KV"
```

#### Create R2 Bucket
```bash
wrangler r2 bucket create linkedin-jobs-storage
```

#### Create Queue
```bash
wrangler queues create linkedin-jobs-queue
```

#### Create Vectorize Index
```bash
wrangler vectorize create linkedin-jobs-vectors \
  --dimensions=768 \
  --metric=cosine
```

### 3. Run Database Migrations
```bash
wrangler d1 migrations apply linkedin_jobs
```

### 4. Deploy Worker
```bash
wrangler deploy
```

### 5. Verify Deployment
```bash
curl https://your-worker.workers.dev/status
```

## Development

### Local Development
```bash
npm run dev
```

### Run Migrations (Local)
```bash
npm run d1:migrations
```

### Tail Logs
```bash
npm run tail
```

### Test Workflow Manually
```bash
curl -X POST https://your-worker.workers.dev/trigger
```

## Database Schema

### `jobs`
- `id` (TEXT PRIMARY KEY) - SHA256 hash of url+company+title
- `title` (TEXT) - Job title
- `company` (TEXT) - Company name
- `location` (TEXT) - Job location
- `url` (TEXT UNIQUE) - Job posting URL
- `description` (TEXT) - Full job description
- `salary_min` (REAL) - Minimum salary
- `salary_max` (REAL) - Maximum salary
- `posted_date` (TEXT) - ISO date string
- `source` ('jobspy' | 'linkedin-api')

### `job_metadata`
- `job_id` (TEXT PRIMARY KEY) - Foreign key to jobs.id
- `fit_score` (REAL) - AI-generated fit score (0-10)
- `domain` (TEXT) - Job domain (e.g., "AI Product")
- `seniority` (TEXT) - Seniority level
- `skills` (TEXT) - JSON array of skills
- `classification_result` (TEXT) - Full AI response

### `scraper_runs`
- `id` (TEXT PRIMARY KEY)
- `started_at` (TEXT) - ISO timestamp
- `completed_at` (TEXT) - ISO timestamp
- `jobs_found` (INTEGER)
- `jobs_new` (INTEGER)
- `jobs_updated` (INTEGER)
- `status` ('running' | 'completed' | 'failed')
- `errors` (TEXT)

## Configuration

Edit `src/types.ts` to customize:

```typescript
export const SCRAPER_CONFIG: ScraperConfig = {
  searchTerms: [
    'AI Product Manager',
    'Data Strategy Lead',
    // ... add more roles
  ],
  locations: [
    'Remote',
    'San Francisco',
    // ... add more locations
  ],
  resultsWanted: 100 // per source per run
};
```

## Monitoring

### Check Last Run
```bash
curl https://your-worker.workers.dev/status | jq .lastRun
```

### View Recent Runs
```bash
curl https://your-worker.workers.dev/runs
```

### Stream Real-time Logs
```bash
wrangler tail
```

## Customization

### Change Cron Schedule
Edit `wrangler.toml`:
```toml
[triggers]
crons = ["0 8 * * *"]  # Daily at 08:00 UTC
```

### Adjust Classification Model
Edit `src/actor.ts` to change the AI model:
```typescript
const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
  // ... or use a different model
});
```

### Add Custom Search Terms
Edit `src/types.ts`:
```typescript
export const SCRAPER_CONFIG = {
  searchTerms: [
    'Your Custom Role',
    // ...
  ]
};
```

## Troubleshooting

### Issue: No jobs found
- Check that scrapers are not rate-limited
- Verify search terms match real job postings
- Review logs: `wrangler tail`

### Issue: Classification not working
- Verify Durable Objects are enabled in your account
- Check AI bindings are configured
- Review actor logs

### Issue: Vectorize errors
- Ensure index dimensions match model (768 for bge-base-en-v1.5)
- Verify Vectorize binding in wrangler.toml

## Cost Estimates

Based on Cloudflare pricing (as of 2024):

- **Workers**: ~$5/month (paid plan required for DO/Vectorize)
- **D1**: Free tier covers ~5M reads/month
- **Vectorize**: Free tier covers 30M queries/month
- **AI**: Free tier covers significant usage
- **Queues**: Free tier covers 1M operations/month

Daily scraping of ~500 jobs/day = ~15K jobs/month fits comfortably in free tiers.

## License

MIT

## Contributing

This is a demonstration project. Feel free to fork and customize for your needs.

## Support

For issues with Cloudflare services:
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Discord](https://discord.cloudflare.com)
