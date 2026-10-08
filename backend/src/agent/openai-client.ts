import OpenAI from 'openai';
import { config } from '../config/environment.js';

/**
 * Dedicated OpenAI client for tool-calling (GENAI_POC_PRD.md §4: "No existing
 * tool-calling pattern in this codebase ... this PRD introduces tool-calling
 * for the first time"). Mirrors ai-router.ts's client setup exactly, but
 * kept separate since ai-router.ts's client is a private module-level const
 * and ai-router.ts must remain untouched.
 */
export const agentOpenai = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: config.GITHUB_PAT,
});

export const AGENT_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
