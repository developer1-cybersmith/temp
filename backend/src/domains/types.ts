// ─── Domain Layer Types ─────────────────────────────────────────
// Each industry domain implements BaseDomain to provide config for
// the generic pipeline (pipeline-service.ts) and AI router (ai-router.ts).
// Domains are CONFIG objects — not code copies.

/** Bilingual template with English and Hinglish variants */
export interface BilingualTemplate {
  en: string;
  hi: string;
}

/** A single intent definition */
export interface IntentDefinition {
  name: string;
  description: string;
  leadScore: 'high' | 'medium' | 'low';
  autoReply: boolean;
  escalate: boolean;
}

/** Regex patterns for heuristic intent detection */
export interface DomainPatterns {
  photoRequest: RegExp;
  negotiation: RegExp;
  hinglishHint: RegExp;
  /** Customer fact extraction — key is fact type, regex tests against customer messages */
  customerFacts: Record<string, { regex: RegExp; label: string }>;
  /** AI action tracking — key is action type, regex tests against AI messages */
  aiActions: Record<string, { regex: RegExp; label: string }>;
}

/** Variables available when building the analysis prompt */
export interface AnalysisPromptVars {
  currentDate: string;
  currentTime: string;
  dayOfWeek: string;
  tomorrowDate: string;
  businessName: string;
  industry: string;
  services: string;
  conversationHistory: string;
  customerMessage: string;
}

/** Variables available when building the reply prompt */
export interface ReplyPromptVars {
  businessName: string;
  industry: string;
  services: string;
  conversationMemory: string;
  inventoryInfo: string;
  knowledgeContext: string;
  language: string;
}

/** Variables available when building the follow-up prompt */
export interface FollowUpPromptVars {
  businessName: string;
  industry: string;
  services: string;
  customerName: string;
  stage: string;
  recentHistory: string;
}

/** Location reply template set — 4 variants depending on available data */
export interface LocationTemplates {
  full: BilingualTemplate;        // address + maps link
  addressOnly: BilingualTemplate; // address only
  mapsOnly: BilingualTemplate;    // maps link only
  none: BilingualTemplate;        // no location data available
}

/** Photo reply template set — 4 variants depending on state */
export interface PhotoTemplates {
  sentWithProduct: BilingualTemplate;    // photos sent + product name known
  sentGeneric: BilingualTemplate;        // photos sent, no product name
  pendingWithProduct: BilingualTemplate; // no photos yet, product name known
  pendingGeneric: BilingualTemplate;     // no photos, no product name
}

/** LLM call parameters */
export interface LlmCallParams {
  temperature?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/** Negotiation configuration */
export interface NegotiationConfig {
  maxDiscountPercentCap: number;
  defaultDiscountPercent: number;
  maxRounds: number;
  floorPriceAttributeKeys: string[];
  discountPercentAttributeKeys: string[];
}

/** Operational limits */
export interface OperationalLimits {
  historyLoadLimit: number;
  historyLlmLimit: number;
  maxPhotosPerRequest: number;
  confidenceThreshold: number;
  browseItemLimit: number;
}

/** Fallback messages when AI can't generate a proper response */
export interface FallbackMessages {
  genericAcknowledgement: string;
  aiFailure: string;
  photoFallback: string;
  followUpFallback: (customerName: string) => string;
}

// ═══════════════════════════════════════════════════════════════
// THE MAIN INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface BaseDomain {
  /** Unique domain identifier, e.g. "used_cars", "generic" */
  id: string;
  /** Human-readable name, e.g. "Used Car Dealership" */
  displayName: string;

  // ─── Domain Vocabulary ──────────────────────────────────
  productNoun: string;               // "car" / "product"
  productNounPlural: string;         // "cars" / "products"
  venueNoun: string;                 // "showroom" / "store"
  defaultAppointmentService: string; // "Test Drive" / "Visit"

  // ─── Intent System ──────────────────────────────────────
  intents: IntentDefinition[];
  inventoryIntents: string[];
  autoReplyIntents: string[];

  // ─── Regex Patterns ─────────────────────────────────────
  patterns: DomainPatterns;

  // ─── LLM Prompts (functions returning prompt strings) ───
  analysisPrompt: { buildSystemPrompt(vars: AnalysisPromptVars): string };
  replyPrompt: { buildSystemPrompt(vars: ReplyPromptVars): string };
  followUpPrompt: { buildSystemPrompt(vars: FollowUpPromptVars): string };

  // ─── Deterministic Reply Templates ──────────────────────
  locationTemplates: LocationTemplates;
  photoTemplates: PhotoTemplates;

  // ─── Negotiation ────────────────────────────────────────
  negotiationConfig: NegotiationConfig;

  // ─── Operational Limits ─────────────────────────────────
  limits: OperationalLimits;

  // ─── LLM Parameters Per Function ────────────────────────
  llmParams: {
    analysis: LlmCallParams;
    reply: LlmCallParams;
    summary: LlmCallParams;
    followUp: LlmCallParams;
  };

  // ─── Fallback Messages ──────────────────────────────────
  fallbacks: FallbackMessages;

  // ─── Price Formatting ───────────────────────────────────
  /** Format price for WhatsApp chat display (e.g., "₹5.5 lakh") */
  formatPrice(value: number): string;
  /** Format price for inventory context sent to LLM (e.g., "5.5L") */
  formatInventoryPrice(price: number): string;
}
