/**
 * optimizeRoute.js — Netlify function
 *
 * Given a date and a starting point, figures out a good order to visit
 * that day's appointments in, using Google's Distance Matrix API for
 * real drive times. Returns an ordered list — does NOT draw a route line
 * (that would be the Directions API, a separate cost, deliberately not
 * used here).
 *
 * How the order is chosen:
 *   • Timed appointments are fixed anchors, visited in time order — the
 *     route never puts a 2:00 stop before a 10:00 one.
 *   • Flexible appointments are slotted in wherever they add the least
 *     driving (before the first timed stop, between two, or at the end),
 *     preferring spots that don't make any timed stop late.
 *   • If the whole day is flexible, it's plain nearest-neighbor by
 *     distance (same as before).
 *   • Every stop gets an estimated arrival time; timed stops you'd reach
 *     late are flagged.
 *   • No-shows, waitlisted, tentative and not-yet-approved booking
 *     requests are left out.
 *
 * Usage is capped: Growth gets a limited number of free calls per
 * month (resets monthly), Pro is unlimited. This protects real,
 * per-call API cost from growing unbounded.
 *
 * POST body:
 *   {
 *     date: "2026-08-08",
 *     origin: { lat: number, lng: number }   // resolved client-side already
 *   }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Free route optimizations per month on Growth before it's blocked. Pro is unlimited.
const GROWTH_MONTHLY_LIMIT = 15;

// Arriving up to this many minutes after a timed appointment isn't flagged
const LATE_GRACE_MIN = 5;
// Google allows at most 25 origins, 25 destinations and 100 elements per
// request — 10×10 blocks stay inside all three limits.
const MATRIX_BLOCK = 10;
// Sources that mean "a client asked, the groomer hasn't approved yet"
const REQUEST_SOURCES = ["booking_page", "new_client_booking"];

const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (mins) => {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/* Fetch the full point×point matrix in blocks Google will accept.
   Billing is per element, so this costs the same as one big request. */
async function fetchMatrix(points, apiKey) {
  const n = points.length;
  const elements = Array.from({ length: n }, () => new Array(n).fill(null));
  const coords = points.map((p) => `${p.lat},${p.lng}`);
  const blocks = [];
  for (let oi = 0; oi < n; oi += MATRIX_BLOCK) {
    for (let di = 0; di < n; di += MATRIX_BLOCK) blocks.push([oi, di]);
  }
  await Promise.all(blocks.map(async ([oi, di]) => {
    const origins = coords.slice(oi, oi + MATRIX_BLOCK).join("|");
    const dests = coords.slice(di, di + MATRIX_BLOCK).join("|");
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(dests)}&key=${apiKey}`
    );
    const json = await res.json();
    if (json.status !== "OK") {
      const err = new Error(`Distance calculation failed (${json.status}).`);
      err.status = json.status;
      throw err;
    }
    json.rows.forEach((row, r) => {
      row.elements.forEach((el, c) => { elements[oi + r][di + c] = el; });
    });
  }));
  return elements;
}

/* Walk a route (list of point indexes, starting with the origin 0) and
   work out arrival/start times. stops[i-1] describes point i. */
function simulate(route, stops, elements, dayStartMin) {
  let clock = dayStartMin;
  let totalLate = 0;
  let lateStops = 0;
  const legs = [];
  for (let k = 1; k < route.length; k++) {
    const leg = elements[route[k - 1]][route[k]];
    const driveMin = leg?.status === "OK" ? leg.duration.value / 60 : 0;
    const stop = stops[route[k] - 1];
    const arrive = clock + driveMin;
    let start = arrive;
    let late = 0;
    let wait = 0;
    if (stop.timeMin != null) {
      if (arrive < stop.timeMin) { wait = stop.timeMin - arrive; start = stop.timeMin; }
      else late = arrive - stop.timeMin;
      if (late > LATE_GRACE_MIN) { totalLate += late; lateStops++; }
    }
    legs.push({ arrive, start, late, wait });
    clock = start + stop.durationMin;
  }
  return { legs, totalLate, lateStops };
}

/* Drive seconds for a route — the insertion cost */
function routeDriveSeconds(route, elements) {
  let total = 0;
  for (let k = 1; k < route.length; k++) {
    const el = elements[route[k - 1]][route[k]];
    total += el?.status === "OK" ? el.duration.value : 1e7; // unreachable = huge
  }
  return total;
}

/* Nearest-neighbor by distance from the origin — used when every stop is
   flexible (identical to the original behavior). */
function nearestNeighbor(n, elements) {
  const visited = new Set([0]);
  const order = [0];
  let current = 0;
  while (visited.size < n) {
    let nearest = null;
    let nearestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const el = elements[current][j];
      if (el?.status !== "OK") continue;
      if (el.distance.value < nearestDist) { nearestDist = el.distance.value; nearest = j; }
    }
    if (nearest === null) break; // no reachable unvisited point — stop here
    visited.add(nearest);
    order.push(nearest);
    current = nearest;
  }
  return order;
}

/* Timed stops in time order, then flexible stops inserted one at a time
   at their cheapest spot. "Cheapest" = fewest late timed stops, then
   least total lateness, then least added driving. */
function planRoute(stops, elements, dayStartMin) {
  const idx = stops.map((_, i) => i + 1); // point indexes
  const timed = idx.filter((p) => stops[p - 1].timeMin != null)
    .sort((a, b) => stops[a - 1].timeMin - stops[b - 1].timeMin);
  const flexible = idx.filter((p) => stops[p - 1].timeMin == null);

  if (timed.length === 0) return nearestNeighbor(stops.length + 1, elements);

  let route = [0, ...timed];
  const remaining = new Set(flexible);
  while (remaining.size) {
    let best = null;
    for (const p of remaining) {
      for (let pos = 1; pos <= route.length; pos++) {
        const candidate = [...route.slice(0, pos), p, ...route.slice(pos)];
        const sim = simulate(candidate, stops, elements, dayStartMin);
        const score = [sim.lateStops, Math.round(sim.totalLate), routeDriveSeconds(candidate, elements)];
        if (!best || score[0] < best.score[0] ||
            (score[0] === best.score[0] && (score[1] < best.score[1] ||
            (score[1] === best.score[1] && score[2] < best.score[2])))) {
          best = { score, candidate, p };
        }
      }
    }
    route = best.candidate;
    remaining.delete(best.p);
  }
  return route;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let date, origin;
  try {
    ({ date, origin } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!date) {
    return { statusCode: 400, body: JSON.stringify({ error: "date required" }) };
  }
  if (!origin?.lat || !origin?.lng) {
    return { statusCode: 400, body: JSON.stringify({ error: "A starting point is required." }) };
  }

  try {
    // ── Load groomer, check tier + usage cap ──────────────────
    const { data: groomer, error: groomerErr } = await supabase
      .from("groomers")
      .select("id, plan_tier, time_zone, custom_services, route_optimizations_this_month, route_optimizations_reset_at")
      .eq("id", user.id)
      .single();

    if (groomerErr || !groomer) {
      return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found" }) };
    }

    if (groomer.plan_tier !== "growth" && groomer.plan_tier !== "pro") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Route optimization is a Growth and Pro feature. Upgrade your plan to use this." }),
      };
    }

    // Reset the counter if we've rolled into a new month since it was last reset
    let usageCount = groomer.route_optimizations_this_month || 0;
    const resetAt = new Date(groomer.route_optimizations_reset_at);
    const now = new Date();
    const monthRolled = now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth();

    if (monthRolled) {
      usageCount = 0;
      await supabase
        .from("groomers")
        .update({ route_optimizations_this_month: 0, route_optimizations_reset_at: now.toISOString() })
        .eq("id", user.id);
    }

    if (groomer.plan_tier === "growth" && usageCount >= GROWTH_MONTHLY_LIMIT) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: `You've used all ${GROWTH_MONTHLY_LIMIT} free route optimizations this month. Resets next month, or upgrade to Pro for unlimited.`,
          limitReached: true,
          usage: { used: usageCount, limit: GROWTH_MONTHLY_LIMIT },
        }),
      };
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set." }) };
    }

    // ── Load that day's appointments with geocoded client locations ──
    const { data: allAppts, error: apptsErr } = await supabase
      .from("appointments")
      .select(`
        id, time, duration_min, is_flexible, is_tentative, no_show, waitlist,
        confirmed, source, appointment_group_id, services,
        pets ( name, clients ( id, full_name, lat, lng ) )
      `)
      .eq("groomer_id", user.id)
      .eq("date", date)
      .order("time", { ascending: true });

    if (apptsErr) {
      return { statusCode: 500, body: JSON.stringify({ error: apptsErr.message }) };
    }

    // Leave out appointments the groomer isn't actually driving to.
    // Daycare dogs come to the groomer, so they're never route stops.
    const daycareNames = new Set(
      (Array.isArray(groomer.custom_services) ? groomer.custom_services : [])
        .filter((s) => s && s.isDaycare).map((s) => s.name)
    );
    const isDaycare = (a) => (Array.isArray(a.services) ? a.services : String(a.services || "").split(",").map((x) => x.trim()))
      .some((n) => daycareNames.has(n));
    const excluded = [];
    const appts = (allAppts || []).filter((a) => {
      const name = a.pets?.clients?.full_name || a.pets?.name || "Unknown";
      let reason = null;
      if (a.no_show === true) reason = "no-show";
      else if (a.waitlist === true) reason = "waitlisted";
      else if (a.is_tentative === true) reason = "tentative";
      else if (a.confirmed !== true && REQUEST_SOURCES.includes(a.source)) reason = "request not approved yet";
      else if (isDaycare(a)) reason = "daycare";
      if (reason) excluded.push({ name, reason });
      return !reason;
    });

    if (!appts.length) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: excluded.length
            ? "No appointments to route on this date (the rest are no-shows, waitlisted, tentative or unapproved requests)."
            : "No appointments on this date.",
          excluded,
        }),
      };
    }

    // Dedupe to one stop per client (multi-pet appointments for the same
    // client share one location; a client with two separate appointments
    // the same day also only needs to be visited once). A stop is timed if
    // any of its appointments has a set time — the earliest one wins.
    const stopsByClient = new Map();
    const skipped = [];

    for (const appt of appts) {
      const client = appt.pets?.clients;
      if (!client) continue;
      if (!client.lat || !client.lng) {
        if (!skipped.find((s) => s.id === client.id)) {
          skipped.push({ id: client.id, name: client.full_name });
        }
        continue;
      }
      const timeMin = appt.is_flexible ? null : toMin(appt.time);
      const dur = appt.duration_min || 60;
      if (!stopsByClient.has(client.id)) {
        stopsByClient.set(client.id, {
          clientId: client.id,
          clientName: client.full_name,
          petNames: [appt.pets.name],
          lat: client.lat,
          lng: client.lng,
          timeMin,
          durationMin: dur,
          groups: new Set(appt.appointment_group_id ? [appt.appointment_group_id] : []),
        });
      } else {
        const stop = stopsByClient.get(client.id);
        stop.petNames.push(appt.pets.name);
        if (timeMin != null && (stop.timeMin == null || timeMin < stop.timeMin)) stop.timeMin = timeMin;
        // Multi-pet groups are one combined block (durations add up); a
        // separate appointment for the same client adds its time too.
        stop.durationMin += dur;
      }
    }

    const stops = Array.from(stopsByClient.values());

    if (stops.length === 0) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: "None of today's clients have a location set yet. Add one from their client page first.",
          skipped,
          excluded,
        }),
      };
    }

    // ── When does the day start? Working-hours start for that weekday
    // (8:00 if none), pulled earlier if the first timed stop needs it, or
    // "now" if routing today and the day is already underway. ──
    const [y, m, d] = String(date).split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const { data: hours } = await supabase
      .from("working_hours")
      .select("start_time")
      .eq("groomer_id", user.id)
      .eq("weekday", weekday)
      .maybeSingle();
    let dayStartMin = toMin(hours?.start_time) ?? 8 * 60;

    const tz = groomer.time_zone || "America/New_York";
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
    const nowMin = toMin(now.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }));
    const startsNow = date === todayStr && nowMin > dayStartMin;
    if (startsNow) dayStartMin = nowMin;

    // ── Distance matrix: origin + every stop, against each other ──
    const points = [origin, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
    let elements;
    try {
      elements = await fetchMatrix(points, process.env.GOOGLE_MAPS_API_KEY);
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
    }

    // Planned day: don't assume a start so late that the first timed stop
    // is missed just because of the drive there.
    if (!startsNow) {
      const firstTimed = stops.reduce((mn, s, i) =>
        s.timeMin != null && (mn == null || s.timeMin < stops[mn].timeMin) ? i : mn, null);
      if (firstTimed != null) {
        const leg = elements[0][firstTimed + 1];
        const driveMin = leg?.status === "OK" ? leg.duration.value / 60 : 0;
        dayStartMin = Math.min(dayStartMin, stops[firstTimed].timeMin - driveMin);
      }
    }

    const order = planRoute(stops, elements, dayStartMin);
    const sim = simulate(order, stops, elements, dayStartMin);

    // Build the final ordered stop list (skip index 0, that's the origin)
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    const orderedStops = [];

    for (let i = 1; i < order.length; i++) {
      const fromIdx = order[i - 1];
      const toIdx = order[i];
      const leg = elements[fromIdx][toIdx];
      totalDistanceMeters += leg?.distance?.value || 0;
      totalDurationSeconds += leg?.duration?.value || 0;

      const stop = stops[toIdx - 1]; // -1 because points[0] is the origin
      const timing = sim.legs[i - 1];
      orderedStops.push({
        clientName: stop.clientName,
        petNames: stop.petNames,
        lat: stop.lat,
        lng: stop.lng,
        legDistanceMiles: leg?.distance ? (leg.distance.value / 1609.34).toFixed(1) : null,
        legDurationMinutes: leg?.duration ? Math.round(leg.duration.value / 60) : null,
        time: stop.timeMin != null ? fromMin(stop.timeMin) : null, // null = flexible
        durationMin: stop.durationMin,
        eta: fromMin(timing.arrive),
        lateMinutes: timing.late > LATE_GRACE_MIN ? Math.round(timing.late) : 0,
      });
    }

    // Unreachable stops (no drivable route) — say so instead of dropping silently
    const routed = new Set(order);
    stops.forEach((s, i) => {
      if (!routed.has(i + 1)) skipped.push({ id: s.clientId, name: `${s.clientName} (no drivable route found)` });
    });

    const totalDistanceMiles = (totalDistanceMeters / 1609.34).toFixed(1);
    const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

    // ── Save the plan — this is what makes it persist across visits.
    // Re-optimizing the same day replaces the plan and resets progress
    // back to stop 0, since the order may have genuinely changed. ────
    await supabase
      .from("route_plans")
      .upsert(
        {
          groomer_id: user.id,
          date,
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          stops: orderedStops,
          current_stop_index: 0,
          total_distance_miles: totalDistanceMiles,
          total_duration_minutes: totalDurationMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "groomer_id,date" }
      );

    // ── Increment usage counter ──────────────────────────────
    await supabase
      .from("groomers")
      .update({ route_optimizations_this_month: usageCount + 1 })
      .eq("id", user.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        stops: orderedStops,
        totalDistanceMiles,
        totalDurationMinutes,
        currentStopIndex: 0,
        skipped,
        excluded,
        lateStops: sim.lateStops,
        usage: {
          used: usageCount + 1,
          limit: groomer.plan_tier === "growth" ? GROWTH_MONTHLY_LIMIT : null,
        },
      }),
    };
  } catch (err) {
    console.error("optimizeRoute error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Something went wrong." }) };
  }
};

// Exposed for tests only
exports._internal = { planRoute, simulate, nearestNeighbor, fetchMatrix, toMin, fromMin };
