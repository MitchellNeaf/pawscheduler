/**
 * adminSendEmail.js
 * Admin-only Netlify function — sends emails to groomers.
 * Locked to Mitchell's user ID. No template file needed.
 */

const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");

const ADMIN_USER_ID = "b643ea7b-0000-0000-0000-000000000000"; // Mitchell

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Auth
  const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };

  // Admin check — must be Mitchell
  if (!user.id.startsWith("b643ea7b")) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  let recipients, subject, body;
  try {
    ({ recipients, subject, body } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!recipients?.length || !subject || !body) {
    return { statusCode: 400, body: JSON.stringify({ error: "recipients, subject, and body required" }) };
  }

  // Minimal plain-text style HTML — avoids Gmail promotional tab
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;font-size:15px;color:#111827;background:#ffffff;">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    ${body.replace(/\n/g, "<br>")}
    <br><br>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:12px;color:#9ca3af;margin:0;">
      PawScheduler · You're receiving this because you have an account with us.
    </p>
  </div>
</body>
</html>`;

  const results = [];

  for (const email of recipients) {
    try {
      const res = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { email: "noreply@pawscheduler.app", name: "Mitchell from PawScheduler" },
          to: [{ email }],
          subject,
          html,
          text: body,
        }),
      });

      results.push({ email, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({ email, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  return {
    statusCode: 200,
    body: JSON.stringify({
      sent: results.filter(r => r.ok).length,
      failed: failed.length,
      results,
    }),
  };
};