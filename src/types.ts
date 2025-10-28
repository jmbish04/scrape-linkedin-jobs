/**
 * Type definitions for LinkedIn Jobs Intelligence Worker
 */

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  BUCKET: R2Bucket;
  JOBS_QUEUE: Queue<JobQueueMessage>;
  JOBS_ACTOR: DurableObjectNamespace;
  JOBS_VECTORIZE: VectorizeIndex;
  AI: Ai;
  JOBS_WORKFLOW: Workflow;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  posted_date: string | null;
  source: 'jobspy' | 'linkedin-api';
  created_at?: string;
  updated_at?: string;
}

export interface JobMetadata {
  job_id: string;
  fit_score: number;
  domain: string;
  seniority: string;
  skills: string;
  classification_result: string;
  classified_at?: string;
}

export interface ScraperRun {
  id: string;
  started_at: string;
  completed_at?: string;
  jobs_found: number;
  jobs_new: number;
  jobs_updated: number;
  status: 'running' | 'completed' | 'failed';
  errors?: string;
  source: string;
}

export interface JobQueueMessage {
  jobId: string;
  title: string;
  description: string;
  company: string;
}

export interface ClassificationResult {
  fit_score: number;
  domain: string;
  seniority: string;
  skills: string[];
  reasoning: string;
}

export interface ScraperConfig {
  searchTerms: string[];
  locations: string[];
  resultsWanted: number;
  hoursOld: number;
  countryIndeed: string;
  dateSincePosted: string;
  jobType: string;
  remoteFilter: string;
  experienceLevel: string;
}

export const SCRAPER_CONFIG: ScraperConfig = {
  searchTerms: [
    'AI Product Manager',
    'Data Strategy Lead',
    'Innovation Strategist',
    'Head of Product Operations',
    'AI Program Manager'
  ],
  locations: [
    'Remote',
    'San Francisco Bay Area',
    'Seattle',
    'New York',
    'Austin'
  ],
  resultsWanted: 100,
  hoursOld: 168, // 1 week
  countryIndeed: 'USA',
  dateSincePosted: 'past Week',
  jobType: 'full time',
  remoteFilter: 'hybrid',
  experienceLevel: 'senior'
};
