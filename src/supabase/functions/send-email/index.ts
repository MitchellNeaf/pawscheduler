// supabase/functions/send-email/index.ts

import { serve } from "https://deno.land/std/http/server.ts";
import { Resend } from "npm:resend@3.2.0";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405 }
      );
    }

    const { to, subject, text } = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' field" }),
        { status: 400 }
      );
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    const result = await resend.emails.send({
      from: "PawScheduler <reminder@pawscheduler.com>",
      to,
      subject: subject || "PawScheduler Test Email",
      text: text || "This is a test email sent from the send-email function.",
    });

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
