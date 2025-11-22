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

    if (!to || !subject || !template || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // ----------------------------------
    // Load branding IF groomer_id is present
    // (Does NOT require it)
    // ----------------------------------
    if (data.groomer_id) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: groomer } = await supabase
        .from("groomers")
        .select("*")
        .eq("id", data.groomer_id)
        .single();

      data.logo_url = groomer?.logo_url || "";
      data.business_name = groomer?.business_name || "";
      data.business_address = groomer?.business_address || "";
      data.business_phone = groomer?.business_phone || "";
      data.groomer_email = groomer?.email || "";
    }

    // ----------------------------------
    // Load template file
    // ----------------------------------
    const templatesDir = path.join(__dirname, "..", "email_templates");

    const fileName =
      template === "reminder" ? "reminder.html" : "confirmation.html";

    const htmlPath = path.join(templatesDir, fileName);

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
