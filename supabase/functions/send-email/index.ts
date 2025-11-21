import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle preflight CORS request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Authorization check
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) {
    return new Response(
      JSON.stringify({ code: 401, message: "Missing authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { to, subject, text } = await req.json();

    const msRes = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("MAILERSEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: { email: "reminder@pawscheduler.com" },
        to: [{ email: to }],
        subject,
        text,
      }),
    });

    const bodyText = await msRes.text();

    return new Response(
      JSON.stringify({
        ok: msRes.ok,
        status: msRes.status,
        mailersend_response: bodyText,
      }),
      {
        status: msRes.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
