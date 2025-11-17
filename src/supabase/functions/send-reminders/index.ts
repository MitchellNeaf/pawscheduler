// supabase/functions/send-reminders/index.ts

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@3.2.0";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

  // Tomorrow's date (YYYY-MM-DD)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  const nextDay = `${y}-${m}-${d}`;

  // Pull appointments for tomorrow
  const { data: appts, error } = await supabase
    .from("appointments")
    .select(`
      id,
      date,
      time,
      reminder_enabled,
      reminder_sent,
      pets (
        name,
        clients (
          full_name,
          email
        )
      ),
      groomers (
        full_name,
        email,
        slug
      )
    `)
    .eq("date", nextDay)
    .eq("reminder_enabled", true)
    .eq("reminder_sent", false);

  if (error) {
    console.error("DB error:", error);
    return new Response("Error fetching appointments", { status: 500 });
  }

  if (!appts || appts.length === 0) {
    return new Response("No reminders to send.");
  }

  for (const appt of appts) {
    const clientEmail = appt.pets.clients.email;
    const clientName = appt.pets.clients.full_name;
    const petName = appt.pets.name;
    const groomerName = appt.groomers.full_name;
    const groomerEmail = appt.groomers.email;

    const time = appt.time;

    const html = `
      <div style="font-family:sans-serif;line-height:1.5">
        <h2>Your grooming appointment is tomorrow</h2>
        <p>Hi ${clientName},</p>
        <p>This is a reminder that <strong>${petName}</strong> has a grooming appointment tomorrow with <strong>${groomerName}</strong>.</p>
        <p><strong>Time:</strong> ${time}</p>
        <p>Powered by <strong>PawScheduler</strong></p>
      </div>
    `;

    // Send email via Resend
    try {
      await resend.emails.send({
        from: "PawScheduler <reminder@pawscheduler.com>",
        to: clientEmail,
        subject: `Reminder: ${petName}'s appointment is tomorrow`,
        html,
      });

      // Mark reminder_sent = true
      await supabase
        .from("appointments")
        .update({ reminder_sent: true })
        .eq("id", appt.id);
    } catch (e) {
      console.error("Error sending email:", e);
    }
  }

  return new Response("Reminders processed");
});
