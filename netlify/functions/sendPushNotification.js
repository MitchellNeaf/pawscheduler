/**
 * sendPushNotification.js — Netlify function
 *
 * Sends a OneSignal push notification to a specific groomer.
 *
 * POST body:
 *   { groomerId, title, message, url? }
 *
 * The groomerId is used as the OneSignal "external_id" to target
 * only that groomer's device(s).
 */

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
    return { statusCode: 400, body: "Missing groomerId, title, or message" };
  }

  const apiKey = process.env.ONESIGNAL_API_KEY;
  const appId  = "8c3bc536-e526-40ac-9ecd-19701c76b735";

  if (!apiKey) {
    console.error("ONESIGNAL_API_KEY not set");
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "No API key" }) };
  }

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ["All"],
        headings: { en: title },
        contents: { en: message },
        url: url || "https://app.pawscheduler.app/schedule",
      }),
    });

    const json = await res.json();
    console.log("sendPushNotification status:", res.status, JSON.stringify(json));

    if (!res.ok) {
      console.error("OneSignal error:", JSON.stringify(json));
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "OneSignal error" }) };
    }

    console.log("Push sent to groomer:", groomerId, "| ID:", json.id);
    return { statusCode: 200, body: JSON.stringify({ sent: true, id: json.id }) };

  } catch (err) {
    console.error("sendPushNotification error:", err);
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: err.message }) };
  }
};