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

// ─── Get effective services for a groomer ────────────────────────────────────
/**
 * Returns the groomer's custom services if set, otherwise the default list.
 * Each service is { name, pricing: { 1: price, 2: price, 3: price } }
 *
 * @param {object|null} customServices - groomer.custom_services from DB
 * @param {object}      servicePricing - groomer.service_pricing from DB
 * @returns {{ name: string, pricing: object }[]}
 */
export function getEffectiveServices(customServices, servicePricing) {
  if (customServices && Array.isArray(customServices) && customServices.length > 0) {
    return customServices;
  }
  // Build from defaults merged with groomer's pricing overrides
  const merged = { ...DEFAULT_PRICING, ...(servicePricing || {}) };
  return SERVICE_OPTIONS.map(name => ({
    name,
    pricing: merged[name] || { 1: 0, 2: 0, 3: 0 },
  }));
}

/**
 * Get just the service names from effective services.
 */
export function getServiceNames(customServices, servicePricing) {
  return getEffectiveServices(customServices, servicePricing).map(s => s.name);
}

/**
 * Build a pricing object from effective services for use with calcAmount.
 */
export function buildPricingFromServices(services) {
  return Object.fromEntries(services.map(s => [s.name, s.pricing]));
}
// ─── Daycare ─────────────────────────────────────────────────────────────────
/* A service marked isDaycare in the groomer's custom_services is a daycare
   stay with one flat daily price (stored in `pricing` for every size, so
   calcAmount already charges it correctly). A daycare booking has a
   drop-off time (`time`) and a pick-up time (`time` + `duration_min`).
   Daycare dogs never count against grooming capacity — they're capped
   separately by the groomer's max_daycare_parallel (dogs at the same time). */
export const DAYCARE_DEFAULT_LIMIT = 10;

export function getDaycareNames(customServices) {
  return new Set(
    (Array.isArray(customServices) ? customServices : [])
      .filter((s) => s && typeof s === "object" && s.isDaycare)
      .map((s) => s.name)
  );
}

export function isDaycareAppointment(appt, daycareNames) {
  if (!appt || !daycareNames || daycareNames.size === 0) return false;
  const list = Array.isArray(appt.services)
    ? appt.services
    : String(appt.services || "").split(",").map((s) => s.trim());
  return list.some((name) => daycareNames.has(name));
}

export const clockToMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

export const minToClock = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* Most daycare dogs present at any one moment between startMin and endMin
   (minutes since midnight), checked every 15 minutes. `appts` need services,
   time, duration_min, no_show and waitlist. A daycare booking with no time
   (made before drop-off/pick-up times existed) counts for the whole day. */
export function maxDaycareOverlap(appts, daycareNames, startMin, endMin, excludeId = null) {
  const stays = (appts || [])
    .filter((a) => a.id !== excludeId && a.no_show !== true && a.waitlist !== true && isDaycareAppointment(a, daycareNames))
    .map((a) => {
      const s = clockToMin(a.time);
      return s == null ? [0, 24 * 60] : [s, s + (a.duration_min || 60)];
    });
  let most = 0;
  for (let t = startMin; t < endMin; t += 15) {
    const here = stays.filter(([s, e]) => s <= t && t < e).length;
    if (here > most) most = here;
  }
  return most;
}
