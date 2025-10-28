-- =====================================================
-- D1 Database Schema: LinkedIn Jobs Intelligence
-- =====================================================

-- Jobs Table: Core structured job data
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  url TEXT UNIQUE NOT NULL,
  description TEXT,
  salary_min REAL,
  salary_max REAL,
  posted_date TEXT,
  source TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Job Metadata: AI Classification Results
CREATE TABLE IF NOT EXISTS job_metadata (
  job_id TEXT PRIMARY KEY,
  fit_score REAL,
  domain TEXT,
  seniority TEXT,
  skills TEXT,
  classification_result TEXT,
  classified_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Scraper Runs: Track execution metadata
CREATE TABLE IF NOT EXISTS scraper_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  jobs_found INTEGER DEFAULT 0,
  jobs_new INTEGER DEFAULT 0,
  jobs_updated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  errors TEXT,
  source TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date ON jobs(posted_date);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_job_metadata_fit_score ON job_metadata(fit_score);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(started_at);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedup ON jobs(url, company, title);
