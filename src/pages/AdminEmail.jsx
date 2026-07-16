/**
 * 
 * adminSendEmail.js
 * Admin-only Netlify function — sends emails to groomers.
 * Locked to Mitchell's user ID. No template file needed. Update
 */

const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");


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

  // Simple branded HTML wrapper
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#059669;padding:20px 28px;">
      <span style="color:#fff;font-size:18px;font-weight:700;">🐾 PawScheduler</span>
    </div>
    <div style="padding:28px;color:#111827;font-size:15px;line-height:1.7;">
      ${body.replace(/\n/g, "<br/>")}
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      PawScheduler · You're receiving this because you have an account with us.
    </div>
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
          from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
          to: [{ email }],
          subject,
          html,
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