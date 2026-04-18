/**
 * grooming.js — shared constants and helpers for PawScheduler
 *
 * Import from any page:
 *   import { SERVICE_OPTIONS, DEFAULT_PRICING, calcAmount } from "../utils/grooming";
 *   (adjust relative path as needed, e.g. "../../utils/grooming" from a subfolder)
 */

// ─── Standard service names ───────────────────────────────────────────────────
// Use these everywhere — no variations, no aliases.
export const SERVICE_OPTIONS = [
  "Bath",
  "Full Groom",
  "Nails",
  "Teeth",
  "Deshed",
  "Anal Glands",
  "Puppy Trim",
  "Other",
];

// ─── Default pricing ──────────────────────────────────────────────────────────
// Keyed by service name → slot_weight (1 = S/M, 2 = Large, 3 = XL)
// Groomers can override via groomers.service_pricing (JSONB), merged at runtime.
export const DEFAULT_PRICING = {
  "Bath":        { 1: 25, 2: 40, 3: 60 },
  "Full Groom":  { 1: 45, 2: 65, 3: 90 },
  "Nails":       { 1: 15, 2: 15, 3: 20 },
  "Teeth":       { 1: 15, 2: 15, 3: 20 },
  "Deshed":      { 1: 35, 2: 55, 3: 75 },
  "Anal Glands": { 1: 15, 2: 15, 3: 20 },
  "Puppy Trim":  { 1: 40, 2: 55, 3: 75 },
  "Other":       { 1: 0,  2: 0,  3: 0  },
};

// ─── Price calculator ─────────────────────────────────────────────────────────
/**
 * Sum prices for selected services based on pet size (slot_weight).
 *
 * @param {string[]} services   - Array of selected service names
 * @param {number}   slotWeight - 1 (S/M), 2 (Large), or 3 (XL)
 * @param {object}   pricing    - Groomer's merged pricing (or omit to use defaults)
 * @returns {number} Total amount in dollars
 */
export function calcAmount(services, slotWeight, pricing) {
  const p = { ...DEFAULT_PRICING, ...(pricing || {}) };
  const sz = slotWeight || 1;
  return services.reduce((sum, svc) => {
    const row = p[svc];
    return sum + (row ? (row[sz] ?? row[1] ?? 0) : 0);
  }, 0);
}

// ─── Slot weight labels ───────────────────────────────────────────────────────
export const SLOT_WEIGHT_LABELS = {
  1: "Small/Medium",
  2: "Large",
  3: "XL",
};

// ─── Legacy service name normalization (for Revenue.jsx) ─────────────────────
const LEGACY_SERVICE_MAP = {
  "Wash":            "Bath",
  "Cut":             "Full Groom",
  "Nail Trim":       "Nails",
  "Teeth Cleaning":  "Teeth",
  "Deshedding":      "Deshed",
  "Bath Only":       "Bath",
  "Ear Cleaning":    "Other",
  "Tick Treatment":  "Other",
};

export function normalizeServiceName(s) {
  return LEGACY_SERVICE_MAP[s] || s;
}