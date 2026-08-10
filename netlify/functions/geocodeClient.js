/**
 * geocodeClient.js — Netlify function
 *
 * Geocodes a client's address (street/city/state/zip) into lat/lng
 * using the Google Geocoding API, and saves it to the client record.
 * Called whenever a client's address is added or changed — geocoding
 * is cached (geocoded_at), so an unchanged address is never re-geocoded.
 *
 * POST body:
 *   { clientId: string }
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

  let clientId;
  try {
    ({ clientId } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId required" }) };
  }

  try {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, street, city, state, zip, groomer_id")
      .eq("id", clientId)
      .eq("groomer_id", user.id)
      .single();

    if (clientErr || !client) {
      return { statusCode: 404, body: JSON.stringify({ error: "Client not found" }) };
    }

    const { data: groomer } = await supabase
      .from("groomers")
      .select("plan_tier")
      .eq("id", user.id)
      .single();

    if (groomer?.plan_tier !== "growth" && groomer?.plan_tier !== "pro") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Service areas and the map are a Growth and Pro feature. Upgrade your plan to use this." }),
      };
    }

    if (!client.street || !client.city) {
      return { statusCode: 422, body: JSON.stringify({ error: "Client needs at least a street and city to geocode." }) };
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set." }) };
    }

    const addressParts = [client.street, client.city, client.state, client.zip].filter(Boolean);
    const address = addressParts.join(", ");

    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    const geoJson = await geoRes.json();

    if (geoJson.status !== "OK" || !geoJson.results?.[0]) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Could not geocode this address (${geoJson.status}). Double-check the street/city/state/zip.` }),
      };
    }

    const { lat, lng } = geoJson.results[0].geometry.location;

    const { error: updateErr } = await supabase
      .from("clients")
      .update({ lat, lng, geocoded_at: new Date().toISOString() })
      .eq("id", clientId);

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, lat, lng }),
    };
  } catch (err) {
    console.error("geocodeClient error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Something went wrong." }),
    };
  }
};