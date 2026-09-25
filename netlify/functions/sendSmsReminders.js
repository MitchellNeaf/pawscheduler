// netlify/functions/sendSmsReminders.js
// Cron: runs every hour (e.g. cron-job.org hitting /.netlify/functions/sendSmsReminders)
// Reads each groomer's reminder_rules (array of hours, e.g. [48, 2]) and sends
// an SMS reminder for any appointment whose start time falls within a ±15min window
// of the scheduled reminder time.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── Token interpolation ──────────────────────────────────── */
function interpolate(template, vars) {
  return template
    .replace(/%first_name%/g, vars.first_name || "")
    .replace(/%pet%/g, vars.pet || "")
    .replace(/%date%/g, vars.date || "")
    .replace(/%time%/g, vars.time || "")
    .replace(/%services%/g, vars.services || "")
    .replace(/%confirm_link%/g, vars.confirm_link || "")
    .replace(/%business_name%/g, vars.business_name || "")
    // Legacy placeholders
    .replace(/\{client\}/g, vars.first_name || "")
    .replace(/\{pet\}/g, vars.pet || "")
    .replace(/\{time\}/g, vars.time || "")
    .replace(/\{confirm_link\}/g, vars.confirm_link || "");
}

/* ── Format helpers ───────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ── Default reminder message ─────────────────────────────── */
const DEFAULT_REMINDER = `Hi %first_name%, just a reminder that %pet% has a grooming appointment on %date% at %time%. Reply STOP to opt out.`;

/* ── Default confirmation message ────────────────────────── */
const DEFAULT_CONFIRMATION = `Hi %first_name%, please confirm %pet%'s appointment on %date% at %time%: %confirm_link%`;

/* ── Ensure confirm_token exists ─────────────────────────── */
async function ensureConfirmToken(appointmentId) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { data } = await supabase
    .from("appointments")
    .update({ confirm_token: token })
    .eq("id", appointmentId)
    .is("confirm_token", null)
    .select("confirm_token")
    .single();

  if (data?.confirm_token) return data.confirm_token;

  // Token already existed — fetch it
  const { data: existing } = await supabase
    .from("appointments")
    .select("confirm_token")
    .eq("id", appointmentId)
    .single();

  return existing?.confirm_token || null;
}

/* ── Main handler ─────────────────────────────────────────── */
exports.handler = async (event) => {
  // Verify cron secret
  const secret = event.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const now = new Date();
  const WINDOW = 29; // ±29 minutes — pairs with 30-min cron to catch any appointment time

  try {
    // Load all active groomers eligible for reminders. Growth/Pro need a
    // real dedicated sms_number to be included; Basic doesn't, since they
    // now route through email instead of the shared SMS number.
    const { data: groomers, error: gErr } = await supabase
      .from("groomers")
      .select("id, full_name, email, sms_number, time_zone, reminder_message_template, sms_confirmation_template, reminder_rules, subscription_status, plan_tier, business_address, free_reminders_this_month, free_reminders_reset_at")
      // "free" is included: App.js and stripeWebhook set subscription_status
      // to "free" once a signup's trial date passes or a paid plan is
      // cancelled — without it, Free users never got their 25 reminders.
      .in("subscription_status", ["active", "trial", "free"])
      .or("sms_number.not.is.null,plan_tier.eq.basic,plan_tier.eq.free");

    if (gErr) throw gErr;

    console.log(`sendSmsReminders: found ${(groomers || []).length} groomer(s) with SMS numbers`);

    let sent = 0;
    let skipped = 0;

    for (const groomer of (groomers || [])) {
      const isBasic = groomer.plan_tier === "basic";
      const isFree = groomer.plan_tier === "free";
      const useEmail = isBasic || isFree; // neither ever has a dedicated number

      // Free tier gets a limited monthly allowance of email reminders —
      // a real taste of the feature, not the unlimited version Basic pays
      // for. Resets on a rolling monthly basis, same pattern as
      // route_optimizations_this_month elsewhere in the app.
      const FREE_REMINDER_CAP = 25;
      let freeRemindersThisMonth = groomer.free_reminders_this_month || 0;
      if (isFree) {
        const resetAt = groomer.free_reminders_reset_at ? new Date(groomer.free_reminders_reset_at) : null;
        if (!resetAt || now >= resetAt) {
          // New month — reset the counter and push the next reset out 30 days.
          const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await supabase
            .from("groomers")
            .update({ free_reminders_this_month: 0, free_reminders_reset_at: nextReset.toISOString() })
            .eq("id", groomer.id);
          freeRemindersThisMonth = 0;
        }
        if (freeRemindersThisMonth >= FREE_REMINDER_CAP) {
          console.log(`Skipping groomer ${groomer.id} — free plan, hit ${FREE_REMINDER_CAP}/mo reminder cap`);
          skipped++; continue;
        }
      }

      // Growth/Pro still need a real dedicated number — Basic and Free
      // don't, since both route through email instead.
      if (!useEmail && !groomer.sms_number) {
        console.log(`Skipping groomer ${groomer.id} — ${groomer.plan_tier} with no sms_number assigned yet`);
        skipped++; continue;
      }

      const rules = Array.isArray(groomer.reminder_rules) && groomer.reminder_rules.length
        ? groomer.reminder_rules
        : [48];

      const tz = groomer.time_zone || "America/New_York";
      console.log(`Processing groomer ${groomer.id} (${groomer.full_name}) — rules: ${JSON.stringify(rules)}, tz: ${tz}`);

      for (const hoursAhead of rules) {
        const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
        const targetDateStr = targetTime.toLocaleDateString("en-CA", { timeZone: tz });
        const targetHour = targetTime.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
        const [th, tm] = targetHour.split(":").map(Number);
        const targetMinutesInDay = th * 60 + tm;

        console.log(`  Rule ${hoursAhead}hr: targeting ${targetDateStr} at ${targetHour} (${targetMinutesInDay} min)`);

        const { data: appts } = await supabase
          .from("appointments")
          .select(`
            id, date, time, duration_min, services, confirmed, confirm_token,
            sms_reminder_sent_at, is_tentative,
            pets ( name, clients ( id, full_name, phone, email, sms_opt_in ) )
          `)
          .eq("groomer_id", groomer.id)
          .eq("date", targetDateStr)
          .eq("reminder_enabled", true)
          .eq("is_tentative", false)
          .or("no_show.is.null,no_show.eq.false");

        console.log(`  Found ${(appts || []).length} appointment(s) on ${targetDateStr} with reminder_enabled`);

        for (const appt of (appts || [])) {
          // Re-check the Free cap on every send — checking only once per
          // groomer let a single run blow past 25 when many were due at once.
          if (isFree && freeRemindersThisMonth >= FREE_REMINDER_CAP) {
            console.log(`  Skipping appt ${appt.id} — free plan hit ${FREE_REMINDER_CAP}/mo cap mid-run`);
            skipped++; continue;
          }

          const client = appt.pets?.clients;
          if (useEmail) {
            if (!client?.email) {
              console.log(`  Skipping appt ${appt.id} — ${groomer.plan_tier} account, client has no email on file`);
              skipped++; continue;
            }
          } else if (!client?.phone || !client?.sms_opt_in) {
            console.log(`  Skipping appt ${appt.id} — no phone or sms_opt_in false (phone: ${client?.phone}, opt_in: ${client?.sms_opt_in})`);
            skipped++; continue;
          }

          // Check time window match
          // Flexible appointments have no time. They used to be treated as
          // midnight (reminder fired around midnight) and the text read
          // "...at ." — now they're matched as 9:00 AM and say "a flexible time".
          const [ah, am] = (appt.time || "09:00").slice(0, 5).split(":").map(Number);
          const apptMinutes = ah * 60 + am;
          const diff = Math.abs(apptMinutes - targetMinutesInDay);
          if (diff > WINDOW) {
            console.log(`  Skipping appt ${appt.id} at ${appt.time} — outside window (diff: ${diff} min, max: ${WINDOW})`);
            skipped++; continue;
          }

          // ── Atomically claim this send BEFORE building/sending anything.
          // This is the fix for the actual bug: the old code checked
          // sms_reminder_sent_at, then sent the SMS, then marked it sent —
          // leaving a window where two overlapping runs (a slow cron tick
          // still finishing, or a manual resend colliding with the
          // scheduled one) could both read "not sent yet" and both send.
          // Claiming first via a conditional UPDATE makes this atomic:
          // only one concurrent run can ever win the claim for a given
          // appointment, using the same time-based threshold the old
          // dedup check used so a later, legitimately-due reminder for a
          // shorter rule can still fire once enough time has passed.
          const claimCutoff = new Date(now.getTime() - (hoursAhead - 1) * 3600000).toISOString();
          const { data: claimed } = await supabase
            .from("appointments")
            .update({ sms_reminder_sent_at: now.toISOString() })
            .eq("id", appt.id)
            .or(`sms_reminder_sent_at.is.null,sms_reminder_sent_at.lt.${claimCutoff}`)
            .select("id")
            .maybeSingle();

          if (!claimed) {
            console.log(`  Skipping appt ${appt.id} — already claimed/sent (concurrent run or too recent)`);
            skipped++; continue;
          }

          console.log(`  ✓ Claimed appt ${appt.id} (${appt.pets?.name}, ${appt.date} ${appt.time}) for ${client.phone}`);

          // Build confirm link
          const token = await ensureConfirmToken(appt.id);
          const confirmLink = token
            ? `${process.env.URL || "https://app.pawscheduler.app"}/confirm/${token}`
            : "";

          // Never send a confirmation reminder with a missing link — a
          // broken, truncated message is worse than a delayed one. Undo
          // the claim so a later run can retry once the token is available.
          if (!confirmLink) {
            console.error(`  No confirm token for appt ${appt.id} — rolling back claim, will retry next run`);
            await supabase.from("appointments").update({ sms_reminder_sent_at: null }).eq("id", appt.id);
            skipped++; continue;
          }

          // Build token vars
          const firstName = (client.full_name || "").split(" ")[0];
          const services = Array.isArray(appt.services) ? appt.services.join(", ") : appt.services || "";

          if (useEmail) {
            // ── Basic/Free: email instead of SMS, same confirm-link flow ──
            try {
              const res = await fetch(`${process.env.URL || "https://app.pawscheduler.app"}/.netlify/functions/sendEmail`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY },
                body: JSON.stringify({
                  to: client.email,
                  subject: `Reminder: ${appt.pets?.name || "Your pet"}'s appointment ${fmtDate(appt.date)}`,
                  template: "basic_reminder_email",
                  data: {
                    first_name: firstName,
                    pet: appt.pets?.name || "",
                    date: fmtDate(appt.date),
                    time: appt.time ? fmtTime(appt.time) : "a flexible time",
                    services,
                    confirm_link: confirmLink,
                    business_name: groomer.full_name || "",
                    business_address: groomer.business_address || "",
                  },
                }),
              });

              if (!res.ok) {
                const err = await res.text();
                console.error(`Email reminder failed for appt ${appt.id}:`, err);
                await supabase.from("appointments").update({ sms_reminder_sent_at: null }).eq("id", appt.id);
                skipped++;
                continue;
              }

              if (isFree) {
                await supabase
                  .from("groomers")
                  .update({ free_reminders_this_month: freeRemindersThisMonth + 1 })
                  .eq("id", groomer.id);
                freeRemindersThisMonth++;
              }

              console.log(`  ✅ Email reminder sent successfully for appt ${appt.id}`);
              sent++;
            } catch (emailErr) {
              console.error(`Email reminder failed for appt ${appt.id}:`, emailErr.message);
              await supabase.from("appointments").update({ sms_reminder_sent_at: null }).eq("id", appt.id);
              skipped++;
            }
            continue; // skip the SMS path entirely for Basic/Free
          }

          const vars = {
            first_name: firstName,
            pet: appt.pets?.name || "",
            date: fmtDate(appt.date),
            time: appt.time ? fmtTime(appt.time) : "a flexible time",
            services,
            confirm_link: confirmLink,
            business_name: groomer.full_name || "",
          };

          // Use custom template or default
          const template = groomer.reminder_message_template || DEFAULT_REMINDER;
          const body = interpolate(template, vars);

          // Send via Telnyx REST API
          try {
            const res = await fetch("https://api.telnyx.com/v2/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.TELNYX_API_KEY}`,
              },
              body: JSON.stringify({
                from: groomer.sms_number,
                to: client.phone,
                text: body,
              }),
            });

            if (!res.ok) {
              const err = await res.text();
              console.error(`SMS failed for appt ${appt.id}:`, err);
              // Roll back the claim so this can be retried, rather than
              // silently marking a failed send as sent forever.
              await supabase.from("appointments").update({ sms_reminder_sent_at: null }).eq("id", appt.id);
              skipped++;
              continue;
            }

            // Track sent message for usage reporting
            let telnyxMsgId = null;
            try { telnyxMsgId = (await res.json())?.data?.id || null; } catch {}
            await supabase.from("sms_messages").insert({
              groomer_id: groomer.id,
              client_id: client.id,
              client_phone: client.phone,
              direction: "outbound",
              body,
              telnyx_msg_id: telnyxMsgId,
              message_type: "reminder",
            });

            console.log(`  ✅ SMS sent successfully for appt ${appt.id}`);
            sent++;
          } catch (smsErr) {
            console.error(`SMS failed for appt ${appt.id}:`, smsErr.message);
            // Same rollback on unexpected network/exception failure.
            await supabase.from("appointments").update({ sms_reminder_sent_at: null }).eq("id", appt.id);
            skipped++;
          }
        }
      }
    }

    console.log(`sendSmsReminders complete — sent: ${sent}, skipped: ${skipped}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ sent, skipped }),
    };
  } catch (err) {
    console.error("sendSmsReminders error:", err);
    return { statusCode: 500, body: err.message };
  }
};
