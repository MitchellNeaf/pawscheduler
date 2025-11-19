// supabase/functions/send-email/index.ts

import { serve } from "https://deno.land/std/http/server.ts";
import { Resend } from "npm:resend@3.2.0";

serve(async (req: Request) => {
  // --- CORS PRE-FLIGHT HANDLER ---
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

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' field" }),
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const resend = new Resend(Deno.env.get("MAILERSEND_API_KEY")!);

    const result = await resend.emails.send({
      from: "PawScheduler <reminder@pawscheduler.com>",
      to,
      subject,
      text,
    });

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        },
      }
    );

  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});
