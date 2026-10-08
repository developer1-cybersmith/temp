import type { BaseDomain } from './types.js';
import { genericDomain } from './generic/index.js';
import { usedCarsDomain } from './used-cars/index.js';

/**
 * Registry of domain configs keyed by canonical industry string.
 * The industry string comes from wb_users.industry column.
 */
const domainRegistry: Record<string, BaseDomain> = {
  generic: genericDomain,
  used_cars: usedCarsDomain,
};

/**
 * Aliases map common industry strings to canonical domain keys.
 * Handles variations users might type in the dashboard.
 */
const aliases: Record<string, string> = {
  '': 'generic',
  'general': 'generic',
  'general services': 'generic',
  'general business': 'generic',
  'used cars': 'used_cars',
  'car dealer': 'used_cars',
  'car dealership': 'used_cars',
  'automobile': 'used_cars',
  'automotive': 'used_cars',
  'second hand cars': 'used_cars',
  'auto dealer': 'used_cars',
};

/**
 * Resolve industry string → domain config.
 * Always returns a valid domain (falls back to generic).
 */
export function getDomain(industry?: string | null): BaseDomain {
  const key = (industry || '').toLowerCase().trim();

  // Direct match in registry
  if (domainRegistry[key]) return domainRegistry[key];

  // Alias match
  const aliased = aliases[key];
  if (aliased && domainRegistry[aliased]) return domainRegistry[aliased];

  // Fallback to generic
  return genericDomain;
}
