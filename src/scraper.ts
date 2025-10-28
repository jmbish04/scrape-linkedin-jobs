/**
 * Dual-Source Job Scraper
 * Primary: ts-jobspy (aggregates Indeed + LinkedIn)
 * Fallback: linkedin-jobs-api
 */

import { scrapeJobs } from 'ts-jobspy';
import linkedIn from 'linkedin-jobs-api';
import { Job, SCRAPER_CONFIG } from './types';
import { generateJobId } from './utils';

export interface RawJobData {
  title: string;
  company: string;
  location?: string;
  url: string;
  description?: string;
  salary?: string;
  posted_date?: string;
  source: 'jobspy' | 'linkedin-api';
}

/**
 * Primary scraper using ts-jobspy
 */
export async function scrapeWithJobSpy(
  searchTerm: string,
  location: string,
  resultsWanted: number = 100
): Promise<RawJobData[]> {
  try {
    console.log(`🔍 Scraping with JobSpy: "${searchTerm}" in "${location}"`);

    const results = await scrapeJobs({
      siteName: ['linkedin', 'indeed'],
      searchTerm,
      location,
      resultsWanted,
      hoursOld: 168, // 1 week
      countryIndeed: 'USA'
    });

    console.log(`✅ JobSpy retrieved ${results.length} jobs`);

    return results.map((job: any) => ({
      title: job.title || job.position || '',
      company: job.company || '',
      location: job.location || '',
      url: job.job_url || job.jobUrl || '',
      description: job.description || job.job_description || '',
      salary: job.salary || job.compensation || null,
      posted_date: job.date_posted || job.date || null,
      source: 'jobspy' as const
    }));
  } catch (error) {
    console.error('❌ JobSpy scraper failed:', error);
    return [];
  }
}

/**
 * Fallback scraper using linkedin-jobs-api
 */
export async function scrapeWithLinkedInAPI(
  keyword: string,
  location: string,
  limit: number = 50
): Promise<RawJobData[]> {
  try {
    console.log(`🔍 Fallback: LinkedIn API for "${keyword}" in "${location}"`);

    const queryOptions = {
      keyword,
      location,
      dateSincePosted: 'past Week',
      jobType: 'full time',
      remoteFilter: 'hybrid',
      experienceLevel: 'senior',
      limit: String(limit),
      sortBy: 'recent'
    };

    const results = await linkedIn.query(queryOptions);
    console.log(`✅ LinkedIn API retrieved ${results.length} jobs`);

    return results.map((job: any) => ({
      title: job.position || job.title || '',
      company: job.company || '',
      location: job.location || '',
      url: job.jobUrl || job.url || '',
      description: job.description || '',
      salary: null,
      posted_date: job.date || null,
      source: 'linkedin-api' as const
    }));
  } catch (error) {
    console.error('❌ LinkedIn API scraper failed:', error);
    return [];
  }
}

/**
 * Orchestrates dual-source scraping with fallback logic
 */
export async function scrapeAllJobs(): Promise<Job[]> {
  const allJobs: Job[] = [];
  const { searchTerms, locations, resultsWanted } = SCRAPER_CONFIG;

  for (const searchTerm of searchTerms) {
    for (const location of locations) {
      // Stage 1: Primary scraper (ts-jobspy)
      let rawJobs = await scrapeWithJobSpy(searchTerm, location, resultsWanted);

      // Stage 2: Fallback if insufficient results
      if (rawJobs.length < 30) {
        console.log(`⚠️  Low results (${rawJobs.length}), triggering fallback...`);
        const fallbackJobs = await scrapeWithLinkedInAPI(searchTerm, location, 50);
        rawJobs = [...rawJobs, ...fallbackJobs];
      }

      // Stage 3: Normalize to Job format
      const normalizedJobs = rawJobs.map(raw => normalizeJob(raw));
      allJobs.push(...normalizedJobs);

      // Rate limiting - be respectful
      await sleep(2000);
    }
  }

  console.log(`✅ Total jobs scraped: ${allJobs.length}`);
  return allJobs;
}

/**
 * Normalize raw job data to standard Job format
 */
function normalizeJob(raw: RawJobData): Job {
  const id = generateJobId(raw.url, raw.company, raw.title);

  return {
    id,
    title: raw.title.trim(),
    company: raw.company.trim(),
    location: raw.location?.trim() || null,
    url: raw.url.trim(),
    description: raw.description?.trim() || null,
    salary_min: parseSalary(raw.salary)?.min || null,
    salary_max: parseSalary(raw.salary)?.max || null,
    posted_date: normalizeDate(raw.posted_date),
    source: raw.source
  };
}

/**
 * Parse salary string to min/max range
 */
function parseSalary(salary: string | null | undefined): { min: number; max: number } | null {
  if (!salary) return null;

  // Example: "$120K - $180K" or "$120,000 - $180,000"
  const match = salary.match(/\$?([\d,]+)k?\s*-\s*\$?([\d,]+)k?/i);
  if (match) {
    const min = parseFloat(match[1].replace(/,/g, ''));
    const max = parseFloat(match[2].replace(/,/g, ''));
    return {
      min: match[1].includes('K') || match[1].includes('k') ? min * 1000 : min,
      max: match[2].includes('K') || match[2].includes('k') ? max * 1000 : max
    };
  }

  return null;
}

/**
 * Normalize date string to ISO format
 */
function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;

  try {
    // Handle relative dates like "2 days ago"
    if (date.includes('ago')) {
      const now = new Date();
      if (date.includes('day')) {
        const days = parseInt(date);
        now.setDate(now.getDate() - days);
      } else if (date.includes('hour')) {
        const hours = parseInt(date);
        now.setHours(now.getHours() - hours);
      }
      return now.toISOString().split('T')[0];
    }

    // Try to parse as regular date
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (error) {
    console.warn('Failed to parse date:', date);
  }

  return null;
}

/**
 * Utility: Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
