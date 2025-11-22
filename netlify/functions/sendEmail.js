const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

function fillTemplate(template, data) {
  let output = template;
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    output = output.replace(regex, data[key] ?? "");
  }
  return output;
}

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { to, subject, template, data } = body;

    if (!to || !subject || !template || !data || !data.groomer_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields or groomer_id" })
      };
    }

    // -------------------------------
    // 1. SETUP SUPABASE
    // -------------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // -------------------------------
    // 2. FETCH GROOMER BRANDING
    // -------------------------------
    const { data: groomer, error: groomerErr } = await supabase
      .from("groomers")
      .select("*")
      .eq("id", data.groomer_id)
      .single();

    if (groomerErr) {
      console.error("Groomer fetch error:", groomerErr);
    }

    // Attach branding automatically
    data.logo_url = groomer?.logo_url || "";
    data.business_name = groomer?.business_name || "";
    data.business_address = groomer?.business_address || "";
    data.business_phone = groomer?.business_phone || "";
    data.groomer_email = groomer?.email || "";

    // -------------------------------
    // 3. LOAD EMAIL TEMPLATE
    // -------------------------------
    const templatesDir = path.join(__dirname, "..", "email_templates");

    const fileName =
      template === "reminder" ? "reminder.html" : "confirmation.html";

    const htmlPath = path.join(templatesDir, fileName);

    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    // -------------------------------
    // 4. APPLY TEMPLATE REPLACEMENTS
    // -------------------------------
    const html = fillTemplate(rawHtml, data);

    // -------------------------------
    // 5. SEND EMAIL VIA MAILERSEND
    // -------------------------------
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
