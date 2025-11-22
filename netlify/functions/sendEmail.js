const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

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
    const body = JSON.parse(event.body);
    const {
      to,
      subject,
      template,
      data
    } = body;

    if (!to || !subject || !template || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // Resolve path to template directory
    const templatesDir = path.join(__dirname, "..", "..", "email_templates");


    const fileName = template === "reminder"
      ? "reminder.html"
      : "confirmation.html";

    const htmlPath = path.join(templatesDir, fileName);

    // Read template
    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    // Fill HTML
    const html = fillTemplate(rawHtml, data);

    // Send email
    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MAILERSEND_API_KEY}`,
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
