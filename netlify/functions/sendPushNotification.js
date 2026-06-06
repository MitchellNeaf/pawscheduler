/**
 * sendPushNotification.js — Netlify function
 * Sends a OneSignal push to a specific groomer using their saved player ID.
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

  let groomerId, title, message, url;
  try {
    ({ groomerId, title, message, url } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!groomerId || !title || !message) {
    return { statusCode: 400, body: "Missing fields" };
  }

  const apiKey = process.env.ONESIGNAL_API_KEY;
  const appId  = "8c3bc536-e526-40ac-9ecd-19701c76b735";

  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "No API key" }) };
  }

  // Load groomer's saved OneSignal player ID
  const { data: groomer } = await supabase
    .from("groomers")
    .select("onesignal_player_id")
    .eq("id", groomerId)
    .single();

  const playerId = groomer?.onesignal_player_id;

  // Build payload — target by player ID if available, else send to all
  const payload = playerId
    ? {
        app_id: appId,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: message },
        url: url || "https://app.pawscheduler.app/schedule",
      }
    : {
        app_id: appId,
        included_segments: ["All"],
        headings: { en: title },
        contents: { en: message },
        url: url || "https://app.pawscheduler.app/schedule",
      };

  console.log("Sending push to groomer:", groomerId, "| player:", playerId || "ALL");

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    console.log("Push status:", res.status, JSON.stringify(json));

    if (!res.ok) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "OneSignal error" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true, id: json.id }) };

  } catch (err) {
    console.error("sendPushNotification error:", err);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: err.message }) };
  }
};