const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

// Send failure alert to admin
async function alertAdmin(jobName, error) {
  try {
    await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
        to: [{ email: "pawscheduler@gmail.com" }],
        subject: `⚠️ PawScheduler: ${jobName} failed`,
        text: `The nightly job "${jobName}" failed at ${new Date().toISOString()}\n\nError: ${error?.message || String(error)}`,
      }),
    });
  } catch (e) {
    console.error("Failed to send admin alert:", e);
  }
}


exports.handler = async (event) => {
  try {
    // -------------------------------------------------
    // 🔐 SECURITY — cron protection
    // -------------------------------------------------
    const secret =
      event.headers["x-cron-secret"] || event.headers["X-Cron-Secret"];
    if (secret !== process.env.CRON_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const DRY_RUN = process.env.DRY_RUN_SMS === "true";

    const { data: appts, error } = await supabase.rpc("sms_reminder_candidates");

    // Load groomer reminder templates (for customizable messages)
    const groomerIds = [...new Set((appts || []).map(a => a.groomer_id).filter(Boolean))];
    const groomerTemplates = {};
    if (groomerIds.length) {
      const { data: groomers } = await supabase
        .from("groomers")
        .select("id, reminder_message_template")
        .in("id", groomerIds);
      (groomers || []).forEach(g => {
        groomerTemplates[g.id] = g.reminder_message_template || null;
      });
    }

    if (error) {
      console.error("RPC Error:", error);
      throw error;
    }

    if (!appts || appts.length === 0) {
      return { statusCode: 200, body: "No SMS reminders to send." };
    }

    // -------------------------------------------------
    // Group appointments by appointment_group_id so
    // multi-pet bookings get ONE message listing all pets
    // -------------------------------------------------
    const groups = [];
    const seenIds = new Set();

    for (const a of appts) {
      if (seenIds.has(a.appointment_id)) continue;
      seenIds.add(a.appointment_id);

      if (a.appointment_group_id) {
        // Find all siblings in this group
        const siblings = appts.filter(
          (x) => x.appointment_group_id === a.appointment_group_id
        );
        siblings.forEach((s) => seenIds.add(s.appointment_id));
        groups.push(siblings);
      } else {
        groups.push([a]);
      }
    }

    let sentCount = 0;
    let dryRunCount = 0;
    let failCount = 0;

    for (const group of groups) {
      const primary = group[0];
      if (!primary.phone) continue;

      const timeStr = (primary.appt_time || "").slice(0, 5);
      const petNames = group.map((a) => a.pet_name).filter(Boolean);

      // Build message — list all pets if multi-pet group
      const petDisplay = petNames.length > 1
        ? petNames.slice(0, -1).join(", ") + " & " + petNames[petNames.length - 1]
        : petNames[0] || "your pet";

      // Build confirmation link
      const confirmLink = primary.confirm_token
        ? `https://app.pawscheduler.app/.netlify/functions/confirmAppointmentSms?token=${primary.confirm_token}`
        : null;

      // Use groomer's custom template or default
      const template = groomerTemplates[primary.groomer_id] || null;
      let message;
      if (template) {
        // Replace placeholders in custom template
        message = template
          .replace("{client}", primary.client_name || "there")
          .replace("{pet}", petDisplay)
          .replace("{time}", timeStr)
          .replace("{confirm_link}", confirmLink || "")
          .trim();
      } else {
        message = `Hi ${primary.client_name}, reminder that ${petDisplay} has a grooming appointment tomorrow at ${timeStr}.${confirmLink ? ` Confirm here: ${confirmLink}` : ""} Reply STOP to opt out.`;
      }

      if (DRY_RUN) {
        console.log("DRY RUN SMS:", {
          appointment_ids: group.map((a) => a.appointment_id),
          to: primary.phone,
          message,
        });
        dryRunCount += 1;
        continue;
      }

      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.TELNYX_PHONE_NUMBER,
          to: primary.phone,
          text: message,
        }),
      });

      if (!res.ok) {
        failCount += 1;
        console.error("Telnyx send failed:", {
          appointment_ids: group.map((a) => a.appointment_id),
          status: res.status,
          body: await res.text(),
        });
        continue;
      }

      // Mark all appointments in the group as sent
      const markPromises = group.map((a) =>
        supabase
          .from("appointments")
          .update({ sms_reminder_sent_at: new Date().toISOString() })
          .eq("id", a.appointment_id)
      );

      const markResults = await Promise.all(markPromises);
      const markErrors = markResults.filter((r) => r.error);
      if (markErrors.length) {
        failCount += 1;
        console.error("Failed to mark sms_reminder_sent_at for group:", markErrors);
        continue;
      }

      sentCount += 1;
    }

    const summary = DRY_RUN
      ? `DRY RUN complete. Would send ${dryRunCount} SMS.`
      : `SMS reminders complete. Sent ${sentCount}. Failed ${failCount}.`;

    return { statusCode: 200, body: summary };
  } catch (err) {
    console.error("SMS Reminder Fatal Error:", err);
    await alertAdmin("sendSmsReminders", err);
    return { statusCode: 500, body: err.message };
  }
};