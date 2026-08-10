/**
 * geocodeBusinessAddress.js — Netlify function
 *
 * Geocodes the groomer's own business_address into lat/lng, used as
 * the default starting point for route optimization. Same pattern as
 * geocodeClient.js, but for the groomer's own single address.
 *
 * POST body: (none required — uses the authenticated groomer)
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

  try {
    const { data: groomer, error: groomerErr } = await supabase
      .from("groomers")
      .select("id, business_address, plan_tier")
      .eq("id", user.id)
      .single();

    if (groomerErr || !groomer) {
      return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found" }) };
    }

    if (groomer.plan_tier !== "growth" && groomer.plan_tier !== "pro") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "This is a Growth and Pro feature. Upgrade your plan to use this." }),
      };
    }

    if (!groomer.business_address?.trim()) {
      return { statusCode: 422, body: JSON.stringify({ error: "Add a business address in Profile first." }) };
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set." }) };
    }

    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(groomer.business_address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    const geoJson = await geoRes.json();

    if (geoJson.status !== "OK" || !geoJson.results?.[0]) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Could not geocode this address (${geoJson.status}). Double-check it in Profile.` }),
      };
    }

    const { lat, lng } = geoJson.results[0].geometry.location;

    const { error: updateErr } = await supabase
      .from("groomers")
      .update({ business_lat: lat, business_lng: lng, business_geocoded_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, lat, lng }),
    };
  } catch (err) {
    console.error("geocodeBusinessAddress error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Something went wrong." }),
    };
  }
};