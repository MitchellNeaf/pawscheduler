const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

// Template filler
function fillTemplate(template, data) {
  let output = template;
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    output = output.replace(regex, data[key] ?? "");
  }
  return output;
}

exports.handler = async () => {
  try {
    // -------------------------------
    // 1. SETUP SUPABASE
    // -------------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Convert 7 PM EST → UTC
    // Netlify cron uses UTC, so we do nothing here.
    // Cron schedule will be set in netlify.toml.

    // -------------------------------
    // 2. GET TOMORROW'S DATE
    // -------------------------------
    const now = new Date();
    now.setDate(now.getDate() + 1);
    const tomorrow = now.toISOString().slice(0, 10);

    // -------------------------------
    // 3. FETCH ALL APPOINTMENTS FOR TOMORROW
    // -------------------------------
    const { data: appts, error } = await supabase
      .from("appointments")
      .select(`
        id,
        date,
        time,
        duration_min,
        services,
        amount,
        notes,
        reminder_enabled,
        reminder_sent,
        pet_id,
        groomer_id,
        pets (
          name,
          clients ( email )
        )
      `)
      .eq("date", tomorrow)
      .eq("reminder_enabled", true)
      .eq("reminder_sent", false);

    if (error) throw error;
    if (!appts || appts.length === 0) {
      return { statusCode: 200, body: "No reminders to send." };
    }

    // -------------------------------
    // 4. LOAD REMINDER TEMPLATE
    // -------------------------------
    const templatesDir = path.join(__dirname, "..", "email_templates");
    const rawHtml = fs.readFileSync(
      path.join(templatesDir, "reminder.html"),
      "utf8"
    );

    // -------------------------------
    // 5. PROCESS EACH APPOINTMENT
    // -------------------------------
    for (const a of appts) {
      const email = a.pets?.clients?.email;
      if (!email) continue;

      // Fetch groomer profile (branding)
      const { data: groomer } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", a.groomer_id)
        .single();

      const html = fillTemplate(rawHtml, {
        logo_url: groomer?.logo_url || "",
        business_name: groomer?.business_name || "",
        business_address: groomer?.business_address || "",
        business_phone: groomer?.business_phone || "",
        groomer_email: groomer?.email || "",
        pet_name: a.pets?.name || "",
        date: a.date,
        time: a.time?.slice(0, 5),
        duration_min: a.duration_min || "",
        services: Array.isArray(a.services)
          ? a.services.join(", ")
          : a.services,
        price: a.amount ?? "",
        notes_block: a.notes
          ? `<tr><td><strong>Notes:</strong> ${a.notes}</td></tr>`
          : ""
      });

      // -------------------------------
      // 6. SEND EMAIL THROUGH MAILERSEND
      // -------------------------------
      const res = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
          to: [{ email }],
          subject: "Grooming Appointment Reminder",
          html
        })
      });

      if (!res.ok) {
        console.error("MailerSend Failure:", await res.text());
        continue;
      }

      // -------------------------------
      // 7. MARK AS SENT
      // -------------------------------
      await supabase
        .from("appointments")
        .update({ reminder_sent: true })
        .eq("id", a.id);
    }

    return {
      statusCode: 200,
      body: "Reminders sent successfully."
    };

  } catch (err) {
    console.error("Nightly Reminders Error:", err);
    return { statusCode: 500, body: err.message };
  }
};
