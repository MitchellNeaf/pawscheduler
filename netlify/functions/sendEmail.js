const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── Who may send what ─────────────────────────────────────────
   This endpoint used to send ANY email to ANY address for anyone who
   found its URL — a free spam/phishing relay on our domain. Now every
   request must be one of:
     1. Internal: another Netlify function, proven by the x-internal-secret
        header. Trusted as before.
     2. A logged-in groomer (Supabase access token). May only email
        themselves, one of their own clients, or the PawScheduler inbox.
     3. Public (no login) — only these, with the recipient forced
        server-side so the caller can't choose it:
          • booking/cancellation alerts → that groomer's own email
          • referral signup notice     → the PawScheduler inbox          */
const ADMIN_EMAIL = "pawscheduler@gmail.com";
const PUBLIC_GROOMER_ALERTS = new Set(["groomer_notification", "groomer_cancellation"]);
const PUBLIC_ADMIN_TEMPLATES = new Set(["referral_signup_notification"]);
// Set INTERNAL_API_SECRET in Netlify env vars; the service-role key is a
// fallback so internal emails keep working until you do.
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const norm = (e) => String(e || "").trim().toLowerCase();

async function authorize(event, to, template, data) {
  const headers = event.headers || {};

  // 1. Internal call from another function
  if (safeEqual(headers["x-internal-secret"], INTERNAL_SECRET)) {
    return { ok: true, to };
  }

  // Booking-page alerts: the recipient is always the groomer who owns the
  // slug, whoever is calling (a client, or a groomer testing a booking page).
  if (PUBLIC_GROOMER_ALERTS.has(template) && data.groomer_slug) {
    const { data: groomer } = await supabase
      .from("groomers")
      .select("id, email")
      .eq("slug", String(data.groomer_slug))
      .maybeSingle();
    if (!groomer?.email) return { ok: false, status: 404, error: "Groomer not found" };
    escapeAll(data); // client-typed text (notes, names) must not become HTML
    delete data.groomer_slug;
    data.groomer_id = groomer.id;
    return { ok: true, to: groomer.email };
  }

  // 2. Logged-in groomer
  const token = (headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (token && token !== "undefined") {
    const { data: auth, error } = await supabase.auth.getUser(token);
    const user = auth?.user;
    if (error || !user) return { ok: false, status: 401, error: "Unauthorized" };

    // Branding always comes from the sender's own account
    if (data.groomer_id) data.groomer_id = user.id;

    const target = norm(to);
    if (target === norm(user.email) || target === ADMIN_EMAIL) return { ok: true, to };

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("groomer_id", user.id)
      .ilike("email", target.replace(/[\\%_]/g, (c) => "\\" + c))
      .limit(1)
      .maybeSingle();
    if (client) return { ok: true, to };

    console.warn(`sendEmail: groomer ${user.id} tried to email a non-client address`);
    return { ok: false, status: 403, error: "You can only email your own clients." };
  }

  // 3. Public (no login)
  if (PUBLIC_ADMIN_TEMPLATES.has(template)) {
    escapeAll(data);
    return { ok: true, to: ADMIN_EMAIL };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

function escapeAll(data) {
  for (const k of Object.keys(data)) {
    if (typeof data[k] === "string") data[k] = escapeHtml(data[k]);
  }
}

function fillTemplate(template, data) {
  let output = template;
  // Handle {{#if key}}...{{/if}} blocks
  output = output.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (match, key, block) => {
    return data[key] ? block : "";
  });
  // Replace {{key}} placeholders
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    output = output.replace(regex, data[key] ?? "");
  }
  return output;
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const { subject, template, data } = body;
    let { to } = body;

    if (!to || !subject || !template || !data || typeof data !== "object") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    const auth = await authorize(event, to, template, data);
    if (!auth.ok) {
      return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
    }
    to = auth.to;

    // ----------------------------------
    // Load branding IF groomer_id is present
    // (Does NOT require it)
    // ----------------------------------
    if (data.groomer_id) {
      const { data: groomer } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", data.groomer_id)
        .single();

      data.logo_url = groomer?.logo_url || "";
      // Profile saves the business name into full_name; business_name is
      // never set by the app, so fall back or every email shows a blank name.
      data.business_name = groomer?.business_name || groomer?.full_name || "";
      data.business_address = groomer?.business_address || "";
      data.business_phone = groomer?.business_phone || "";
      data.groomer_email = groomer?.email || "";
    }

    // ----------------------------------
    // Load template file
    // ----------------------------------
    const templatesDir = path.join(__dirname, "..", "email_templates");

    let fileName;
    if (template === "reminder") {
      fileName = "reminder.html";
    } else if (template === "groomer_notification") {
      fileName = "groomer_notification.html";
    } else if (template === "groomer_cancellation") {
      fileName = "groomer_cancellation.html";
    } else if (template === "waiver_request") {
      fileName = "waiver_request.html";
    } else if (template === "intake_notification") {
      fileName = "intake_notification.html";
    } else if (template === "telnyx_info_submitted") {
      fileName = "telnyx_info_submitted.html";
    } else if (template === "basic_reminder_email") {
      fileName = "basic_reminder_email.html";
    } else if (template === "referral_signup_notification") {
      fileName = "referral_signup_notification.html";
    } else if (template === "intake_email") {
      fileName = "intake_email.html";
    } else if (template === "payment_request") {
      fileName = "payment_request.html";
    } else if (template === "booking_approved") {
      fileName = "booking_approved.html";
    } else if (template === "booking_declined") {
      fileName = "booking_declined.html";
    } else if (template === "booking_waitlisted") {
      fileName = "booking_waitlisted.html";
    } else if (template === "booking_request") {
      fileName = "booking_request.html";
    } else if (template === "report_card") {
      fileName = "report_card.html";
    } else {
      fileName = "confirmation.html";
    }

    const htmlPath = path.join(templatesDir, fileName);

    // Pre-process template-specific fields
    if (template === "groomer_notification" || template === "groomer_cancellation") {
      data.notes_row = data.notes
        ? `<tr><td style="padding:12px 16px;color:#6b7280;font-weight:600;">Notes</td>
           <td style="padding:12px 16px;color:#111827;">${data.notes}</td></tr>`
        : "";
    }

    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    const html = fillTemplate(rawHtml, data);

    // ----------------------------------
    // Send via MailerSend
    // ----------------------------------
    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
        to: [{ email: to }],
        subject,
        html
      })
    });

    const msText = await res.text();

    if (!res.ok) {
      console.error("MailerSend Error:", msText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: msText })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("SendEmail Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
