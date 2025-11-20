import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  // CORS
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

    const res = await fetch("https://api.mailersend.com/v1/email", {
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

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
