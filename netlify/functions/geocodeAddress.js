/**
 * geocodeAddress.js — Netlify function
 *
 * One-off geocoding for an arbitrary typed address — used when a
 * groomer types a starting point for route optimization that isn't
 * their saved business address. Nothing is saved; just returns lat/lng.
 *
 * POST body: { address: string }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  let address;
  try {
    ({ address } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!address?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "address required" }) };
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set." }) };
  }

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    const geoJson = await geoRes.json();

    if (geoJson.status !== "OK" || !geoJson.results?.[0]) {
      return { statusCode: 422, body: JSON.stringify({ error: `Could not find that address (${geoJson.status}).` }) };
    }

    const { lat, lng } = geoJson.results[0].geometry.location;
    const formattedAddress = geoJson.results[0].formatted_address;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, lat, lng, formattedAddress }),
    };
  } catch (err) {
    console.error("geocodeAddress error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Something went wrong." }) };
  }
};