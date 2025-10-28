# Deployment Guide

## Step-by-Step Deployment

### 1. Prerequisites

- Cloudflare account with **Workers Paid Plan** ($5/month - required for Durable Objects)
- Wrangler CLI installed globally: `npm install -g wrangler`
- Node.js 18+ installed
- Git configured

### 2. Clone and Install

```bash
git clone <your-repo>
cd scrape-linkedin-jobs
npm install
```

### 3. Authenticate Wrangler

```bash
wrangler login
```

### 4. Create Cloudflare Resources

#### A. Create D1 Database
```bash
wrangler d1 create linkedin_jobs
```

Output:
```
✅ Successfully created DB 'linkedin_jobs'
database_id = "abc123..."
```

Copy the `database_id` and update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "linkedin_jobs"
database_id = "abc123..."  # <-- Update this
```

#### B. Create KV Namespace
```bash
wrangler kv:namespace create "KV"
```

Update `wrangler.toml` with the returned ID:
```toml
[[kv_namespaces]]
binding = "KV"
id = "xyz789..."  # <-- Update this
```

#### C. Create R2 Bucket
```bash
wrangler r2 bucket create linkedin-jobs-storage
```

#### D. Create Queue
```bash
wrangler queues create linkedin-jobs-queue
```

#### E. Create Vectorize Index
```bash
wrangler vectorize create linkedin-jobs-vectors \
  --dimensions=768 \
  --metric=cosine \
  --description="Job embeddings for semantic search"
```

Update `wrangler.toml` if the index name differs.

### 5. Update Configuration

Edit `wrangler.toml` and replace:
- `account_id` with your Cloudflare account ID
- All resource IDs from steps above

Get your account ID:
```bash
wrangler whoami
```

### 6. Run Database Migrations

```bash
wrangler d1 migrations apply linkedin_jobs
```

Verify tables were created:
```bash
wrangler d1 execute linkedin_jobs --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### 7. Deploy Worker

```bash
wrangler deploy
```

Output:
```
✅ Deployed scrape-linkedin-jobs
   https://scrape-linkedin-jobs.your-subdomain.workers.dev
```

### 8. Verify Deployment

Test the health endpoint:
```bash
curl https://scrape-linkedin-jobs.your-subdomain.workers.dev/
```

Check system status:
```bash
curl https://scrape-linkedin-jobs.your-subdomain.workers.dev/status
```

### 9. Trigger First Run

Manually trigger the workflow:
```bash
curl -X POST https://scrape-linkedin-jobs.your-subdomain.workers.dev/trigger
```

Monitor logs in real-time:
```bash
wrangler tail
```

### 10. Verify Data

Check if jobs were scraped:
```bash
wrangler d1 execute linkedin_jobs --command "SELECT COUNT(*) FROM jobs;"
```

View top jobs:
```bash
curl https://scrape-linkedin-jobs.your-subdomain.workers.dev/jobs?limit=5
```

## Configuration Checklist

- [ ] D1 Database created and ID updated
- [ ] KV Namespace created and ID updated
- [ ] R2 Bucket created
- [ ] Queue created
- [ ] Vectorize Index created
- [ ] Account ID updated in wrangler.toml
- [ ] Database migrations applied
- [ ] Worker deployed successfully
- [ ] Health endpoint responding
- [ ] First workflow triggered
- [ ] Jobs appearing in database

## Scheduled Runs

The worker will automatically run daily at **08:00 UTC** via the cron trigger.

To change the schedule, edit `wrangler.toml`:
```toml
[triggers]
crons = ["0 8 * * *"]  # Format: "minute hour day month dayOfWeek"
```

Examples:
- Every 6 hours: `"0 */6 * * *"`
- Twice daily (8 AM & 8 PM UTC): `["0 8 * * *", "0 20 * * *"]`
- Weekdays only at 9 AM: `"0 9 * * 1-5"`

## Troubleshooting

### "Error: No account ID found"
Run `wrangler whoami` and update `account_id` in `wrangler.toml`.

### "Error: D1 database not found"
Ensure you ran `wrangler d1 migrations apply linkedin_jobs` after creating the database.

### "Error: Durable Object namespace not found"
Verify you're on the Workers Paid Plan ($5/month). Durable Objects are not available on the free tier.

### "Error: Vectorize index not found"
Re-create the index:
```bash
wrangler vectorize create linkedin-jobs-vectors --dimensions=768 --metric=cosine
```

### Jobs not appearing
1. Check logs: `wrangler tail`
2. Verify scrapers are working: Test manually via `/trigger`
3. Check for rate limiting from job sites
4. Review search terms in `src/types.ts`

## Monitoring

### Real-time Logs
```bash
wrangler tail --format pretty
```

### Recent Runs
```bash
curl https://your-worker.workers.dev/runs | jq
```

### Check Last Run Status
```bash
curl https://your-worker.workers.dev/status | jq .lastRun
```

### Database Queries
```bash
# Count jobs by source
wrangler d1 execute linkedin_jobs --command "SELECT source, COUNT(*) FROM jobs GROUP BY source;"

# Top companies
wrangler d1 execute linkedin_jobs --command "SELECT company, COUNT(*) as count FROM jobs GROUP BY company ORDER BY count DESC LIMIT 10;"

# Recent jobs
wrangler d1 execute linkedin_jobs --command "SELECT title, company, posted_date FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

## Updating

To deploy changes:
```bash
git pull
npm install
wrangler deploy
```

To update database schema:
1. Create new migration in `migrations/`
2. Run `wrangler d1 migrations apply linkedin_jobs`
3. Deploy worker

## Cost Management

### Free Tier Limits
- Workers: 100,000 requests/day
- D1: 5M reads/month, 100K writes/month
- Vectorize: 30M queries/month
- AI: Generous free tier for embeddings/LLM

### Paid Plan ($5/month)
- Workers: 10M requests/month included
- D1: 25B reads, 50M writes included
- Vectorize: 30M queries included
- Durable Objects: 1M requests included

For ~500 jobs/day:
- ~15K jobs/month
- ~30K DB writes (upserts + metadata)
- ~15K vectorize inserts
- ~15K AI classification requests

**Total cost: $5-10/month** (well within paid plan limits)

## Security

### Secrets Management
Store sensitive data as secrets (never in code):
```bash
wrangler secret put LINKEDIN_API_KEY
wrangler secret put WEBHOOK_SECRET
```

Access in code:
```typescript
const apiKey = env.LINKEDIN_API_KEY;
```

### Rate Limiting
Consider adding rate limiting to public endpoints:
```typescript
// In src/index.ts
const rateLimiter = new RateLimiter(env.KV);
if (!await rateLimiter.allow(clientIP)) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

## Production Checklist

- [ ] Custom domain configured (optional)
- [ ] Secrets configured (if needed)
- [ ] Rate limiting implemented (optional)
- [ ] Monitoring dashboard set up
- [ ] Alerts configured for errors
- [ ] Backup strategy defined
- [ ] Cost alerts enabled in Cloudflare dashboard
- [ ] Documentation reviewed with team
- [ ] Access controls configured

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/workers/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **Community**: https://discord.cloudflare.com
- **Status**: https://www.cloudflarestatus.com/
