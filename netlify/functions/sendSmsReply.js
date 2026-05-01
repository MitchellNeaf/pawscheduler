// netlify/functions/sendSmsReply.js
// Groomer replies to a client from the inbox
// Stores outbound message in sms_messages

const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Auth check
  const token = event.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { toPhone, message } = body;

  if (!toPhone || !message?.trim()) {
    return { statusCode: 400, body: "Missing toPhone or message" };
  }

  // Get groomer's SMS number (dedicated or shared)
  const { data: groomer } = await supabase
    .from("groomers")
    .select("id, sms_number, plan_tier")
    .eq("id", user.id)
    .single();

  if (!groomer) {
    return { statusCode: 404, body: "Groomer not found" };
  }

  // Plan gate — basic+ can use SMS inbox
  const allowedPlans = ["basic", "starter", "pro"];
  if (!allowedPlans.includes(groomer.plan_tier)) {
    return { statusCode: 403, body: "SMS inbox requires Basic plan or higher" };
  }

  const fromNumber = groomer.sms_number || process.env.TELNYX_PHONE_NUMBER;

  console.log("Sending SMS from:", fromNumber, "to:", toPhone);
  console.log("Groomer plan:", groomer.plan_tier);

  // Send via Telnyx
  const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromNumber,
      to:   toPhone,
      text: message.trim(),
    }),
  });

  const telnyxBody = await telnyxRes.text();
  console.log("Telnyx response status:", telnyxRes.status);
  console.log("Telnyx response body:", telnyxBody);

  if (!telnyxRes.ok) {
    console.error("Telnyx send failed:", telnyxBody);
    return { statusCode: 500, body: "Failed to send message" };
  }

  let telnyxData;
  try {
    telnyxData = JSON.parse(telnyxBody);
  } catch {
    telnyxData = {};
  }

  // telnyxData already parsed above
  const telnyxMsgId = telnyxData?.data?.id;

  // Find client record
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("phone", toPhone)
    .eq("groomer_id", user.id)
    .single();

  // Store outbound message
  const { error: insertError } = await supabase
    .from("sms_messages")
    .insert({
      groomer_id:    user.id,
      client_phone:  toPhone,
      client_id:     client?.id || null,
      direction:     "outbound",
      body:          message.trim(),
      telnyx_msg_id: telnyxMsgId || null,
    });

  if (insertError) {
    console.error("Failed to store outbound SMS:", insertError);
    // Don't fail — message was sent, just log
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, message_id: telnyxMsgId }),
  };
};