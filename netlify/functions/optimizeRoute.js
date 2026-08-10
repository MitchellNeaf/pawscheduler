/**
 * optimizeRoute.js — Netlify function
 *
 * Given a date and a starting point, figures out a good order to visit
 * that day's appointments in, using Google's Distance Matrix API for
 * real drive times and a nearest-neighbor heuristic to sequence stops.
 * Returns an ordered list — does NOT draw a route line (that would be
 * the Directions API, a separate cost, deliberately not used here).
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
      .select("id, plan_tier, route_optimizations_this_month, route_optimizations_reset_at")
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
    const { data: appts, error: apptsErr } = await supabase
      .from("appointments")
      .select(`
        id, time, appointment_group_id,
        pets ( name, clients ( id, full_name, lat, lng ) )
      `)
      .eq("groomer_id", user.id)
      .eq("date", date)
      .order("time", { ascending: true });

    if (apptsErr) {
      return { statusCode: 500, body: JSON.stringify({ error: apptsErr.message }) };
    }

    if (!appts?.length) {
      return { statusCode: 422, body: JSON.stringify({ error: "No appointments on this date." }) };
    }

    // Dedupe to one stop per client (multi-pet appointments for the same
    // client share one location; a client with two separate appointments
    // the same day also only needs to be visited once).
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
      if (!stopsByClient.has(client.id)) {
        stopsByClient.set(client.id, {
          clientId: client.id,
          clientName: client.full_name,
          petNames: [appt.pets.name],
          lat: client.lat,
          lng: client.lng,
          earliestTime: appt.time,
        });
      } else {
        stopsByClient.get(client.id).petNames.push(appt.pets.name);
      }
    }

    const stops = Array.from(stopsByClient.values());

    if (stops.length === 0) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: "None of today's clients have a location set yet. Add one from their client page first.",
          skipped,
        }),
      };
    }

    // ── Build the distance matrix: origin + every stop, against each other ──
    const points = [origin, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
    const pointsParam = points.map((p) => `${p.lat},${p.lng}`).join("|");

    const matrixRes = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(pointsParam)}&destinations=${encodeURIComponent(pointsParam)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    const matrixJson = await matrixRes.json();

    if (matrixJson.status !== "OK") {
      return { statusCode: 502, body: JSON.stringify({ error: `Distance calculation failed (${matrixJson.status}).` }) };
    }

    // rows[i].elements[j] = distance/duration from point i to point j
    const elements = matrixJson.rows.map((row) => row.elements);

    // ── Nearest-neighbor ordering, starting from the origin (index 0) ──
    const visited = new Set([0]);
    const order = [0];
    let current = 0;

    while (visited.size < points.length) {
      let nearest = null;
      let nearestDist = Infinity;
      for (let j = 0; j < points.length; j++) {
        if (visited.has(j)) continue;
        const el = elements[current][j];
        if (el?.status !== "OK") continue;
        if (el.distance.value < nearestDist) {
          nearestDist = el.distance.value;
          nearest = j;
        }
      }
      if (nearest === null) break; // no reachable unvisited point — stop here
      visited.add(nearest);
      order.push(nearest);
      current = nearest;
    }

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
      orderedStops.push({
        clientName: stop.clientName,
        petNames: stop.petNames,
        lat: stop.lat,
        lng: stop.lng,
        legDistanceMiles: leg?.distance ? (leg.distance.value / 1609.34).toFixed(1) : null,
        legDurationMinutes: leg?.duration ? Math.round(leg.duration.value / 60) : null,
      });
    }

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