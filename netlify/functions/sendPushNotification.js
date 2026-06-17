/**
 * sendPushNotification.js — Netlify function
 * Sends a OneSignal push to a specific groomer.
 *
 * Primary targeting: external_id (set via OneSignal.login(groomerId) client-side).
 * This is more reliable than player_id, which can go stale if a device
 * re-subscribes, clears cache, or reinstalls the PWA — external_id always
 * tracks the current session for that login.
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

  // Primary: target by external_id (groomer's Supabase user ID)
  const primaryPayload = {
    app_id: appId,
    include_aliases: { external_id: [groomerId] },
    target_channel: "push",
    headings: { en: title },
    contents: { en: message },
    url: url || "https://app.pawscheduler.app/schedule",
  };

  console.log("Sending push to groomer (external_id):", groomerId);

  try {
    let res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key ${apiKey}`,
      },
      body: JSON.stringify(primaryPayload),
    });

    let json = await res.json();
    console.log("Push status (external_id):", res.status, JSON.stringify(json));

    // If external_id targeting found no matching subscribers, fall back
    // to the legacy stored player_id in case it's still valid.
    const noSubscribers = json?.errors?.invalid_external_user_ids || json?.recipients === 0;

    if (!res.ok || noSubscribers) {
      const { data: groomer } = await supabase
        .from("groomers")
        .select("onesignal_player_id")
        .eq("id", groomerId)
        .single();

      const playerId = groomer?.onesignal_player_id;

      if (playerId) {
        console.log("Falling back to player_id:", playerId);
        const fallbackPayload = {
          app_id: appId,
          include_player_ids: [playerId],
          headings: { en: title },
          contents: { en: message },
          url: url || "https://app.pawscheduler.app/schedule",
        };

        res = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `key ${apiKey}`,
          },
          body: JSON.stringify(fallbackPayload),
        });

        json = await res.json();
        console.log("Push status (player_id fallback):", res.status, JSON.stringify(json));
      }
    }

    if (!res.ok) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "OneSignal error", details: json }) };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true, id: json.id }) };

  } catch (err) {
    console.error("sendPushNotification error:", err);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: err.message }) };
  }
};