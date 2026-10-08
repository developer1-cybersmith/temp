import { createClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

/**
 * Dedicated Supabase client for the agent graph. Kept separate from
 * pipeline-service.ts's singleton so the existing pipeline is never touched
 * by this parallel path (GENAI_POC_PRD.md §5.6).
 */
export const agentSupabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
