/**
 * JobsActor: Durable Object for AI-powered job classification
 * Uses Cloudflare AI Agents SDK for scalable inference
 */

import { DurableObject } from 'cloudflare:workers';
import { Env, ClassificationResult } from './types';

export class JobsActor extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/classify' && request.method === 'POST') {
      return this.handleClassify(request);
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      return this.handleStatus();
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Classify a job posting using AI
   */
  async handleClassify(request: Request): Promise<Response> {
    try {
      const { jobId, title, description, company } = await request.json();

      if (!jobId || !title) {
        return new Response('Missing required fields: jobId and title', { status: 400 });
      }

      console.log(`🤖 Classifying job: ${title} at ${company}`);

      // Use Cloudflare AI for classification
      const classification = await this.classifyJob(title, description, company);

      // Store state in Durable Object storage
      await this.ctx.storage.put(`job:${jobId}`, {
        jobId,
        title,
        company,
        classification,
        classifiedAt: new Date().toISOString()
      });

      return new Response(JSON.stringify(classification), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Classification failed:', error);
      return new Response(JSON.stringify({ error: 'Classification failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Get actor status
   */
  async handleStatus(): Promise<Response> {
    const keys = await this.ctx.storage.list();
    const count = Array.from(keys.keys()).length;

    return new Response(JSON.stringify({
      status: 'active',
      jobsClassified: count,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * AI-powered job classification
   */
  async classifyJob(
    title: string,
    description: string,
    company: string
  ): Promise<ClassificationResult> {
    const env = this.env as Env;

    // Create classification prompt
    const prompt = `You are an AI career advisor specializing in AI Product Management, Data Strategy, and Innovation roles.

Analyze this job posting and provide a structured assessment:

Job Title: ${title}
Company: ${company}
Description: ${description.substring(0, 2000)}

Evaluate this position on:
1. Fit Score (0-10): How well does this align with AI Product/Data Strategy/Innovation leadership roles?
2. Domain: Primary domain (e.g., "AI Product", "Data Strategy", "Innovation", "Product Operations")
3. Seniority: Level (e.g., "Senior", "Staff", "Principal", "Director", "VP", "C-Level")
4. Skills: Key technical and leadership skills required (list up to 5)
5. Reasoning: Brief explanation of the fit score

Respond in JSON format:
{
  "fit_score": <number 0-10>,
  "domain": "<domain>",
  "seniority": "<level>",
  "skills": ["skill1", "skill2", "skill3"],
  "reasoning": "<explanation>"
}`;

    try {
      // Use Cloudflare AI for text generation
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt,
        max_tokens: 512,
        temperature: 0.3
      });

      // Parse AI response
      const text = response.response || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          fit_score: parsed.fit_score || 5.0,
          domain: parsed.domain || 'Unknown',
          seniority: parsed.seniority || 'Unknown',
          skills: parsed.skills || [],
          reasoning: parsed.reasoning || 'No reasoning provided'
        };
      }

      throw new Error('Failed to parse AI response');
    } catch (error) {
      console.error('AI classification failed:', error);

      // Fallback: Rule-based classification
      return this.fallbackClassification(title, description);
    }
  }

  /**
   * Fallback rule-based classification
   */
  fallbackClassification(title: string, description: string): ClassificationResult {
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();

    // Calculate fit score based on keywords
    let fitScore = 5.0;

    const highValueKeywords = ['ai product', 'data strategy', 'innovation', 'product operations'];
    const mediumValueKeywords = ['machine learning', 'analytics', 'data science', 'product management'];

    for (const keyword of highValueKeywords) {
      if (titleLower.includes(keyword) || descLower.includes(keyword)) {
        fitScore += 1.5;
      }
    }

    for (const keyword of mediumValueKeywords) {
      if (titleLower.includes(keyword) || descLower.includes(keyword)) {
        fitScore += 0.5;
      }
    }

    fitScore = Math.min(10, fitScore);

    // Determine domain
    let domain = 'Product';
    if (titleLower.includes('ai') || descLower.includes('artificial intelligence')) {
      domain = 'AI Product';
    } else if (titleLower.includes('data')) {
      domain = 'Data Strategy';
    } else if (titleLower.includes('innovation')) {
      domain = 'Innovation';
    }

    // Determine seniority
    let seniority = 'Mid';
    if (titleLower.includes('senior') || titleLower.includes('sr')) {
      seniority = 'Senior';
    } else if (titleLower.includes('staff')) {
      seniority = 'Staff';
    } else if (titleLower.includes('principal')) {
      seniority = 'Principal';
    } else if (titleLower.includes('director') || titleLower.includes('head')) {
      seniority = 'Director';
    } else if (titleLower.includes('vp') || titleLower.includes('vice president')) {
      seniority = 'VP';
    }

    // Extract skills (simplified)
    const skills = ['Product Management', 'Strategy', 'Leadership'];

    return {
      fit_score: fitScore,
      domain,
      seniority,
      skills,
      reasoning: 'Fallback rule-based classification'
    };
  }
}
