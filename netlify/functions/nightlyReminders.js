import fetch from "node-fetch";
import { supabase } from "../../supabaseClient"; // you already have this

export async function handler() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateStr = tomorrow.toISOString().split("T")[0];

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(`
      id, date, time, duration_min, services, notes, price,
      reminder_enabled, reminder_sent,
      pets(name),
      groomers ( business_name, business_phone, business_address, logo_url, email )
    `)
    .eq("date", dateStr)
    .eq("reminder_enabled", true)
    .eq("reminder_sent", false);

  if (error) {
    console.error(error);
    return { statusCode: 500, body: "DB Error" };
  }

  for (const appt of appts) {
    const html = buildReminderHTML(appt);  // we generate this automatically

    await fetch("/.netlify/functions/sendEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: appt.groomers.email,
        subject: "Appointment Reminder",
        html
      })
    });

    await supabase
      .from("appointments")
      .update({ reminder_sent: true })
      .eq("id", appt.id);
  }

  return { statusCode: 200, body: "Reminders sent" };
}
