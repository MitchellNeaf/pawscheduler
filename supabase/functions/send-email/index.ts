import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  // --- CORS PRE-FLIGHT ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const { to, subject, text } = await req.json();
    const apiKey = Deno.env.get("MAILERSEND_API_KEY");

    const msRes = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "reminder@pawscheduler.app", name: "PawScheduler" },
        to: [{ email: to }],
        subject,
        text,
      }),
    });

    let safeJson;
    try {
      safeJson = await msRes.json();
    } catch {
      safeJson = { note: "Mailersend returned non-JSON response" };
    }

    return new Response(
      JSON.stringify({
        success: msRes.ok,
        status: msRes.status,
        mailersend: safeJson,
      }),
      {
        status: msRes.ok ? 200 : 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
