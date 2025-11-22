import path from "path";
import fs from "fs";
import fetch from "node-fetch";

// Fix __dirname for ES modules on Netlify
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Simple templating function
function fillTemplate(template, data) {
  let output = template;
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    output = output.replace(regex, data[key] ?? "");
  }
  return output;
}

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { to, subject, template, data } = body;

    if (!to || !subject || !template || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // Path to: netlify/email_templates/
    const templatesDir = path.join(__dirname, "../email_templates");

    const fileName =
      template === "reminder" ? "reminder.html" : "confirmation.html";

    const htmlPath = path.join(templatesDir, fileName);

    // Load the template from disk
    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    // Fill placeholders
    const html = fillTemplate(rawHtml, data);

    // Send via MailerSend
    const msRes = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: {
          email: "noreply@pawscheduler.app",
          name: "PawScheduler"
        },
        to: [{ email: to }],
        subject,
        html
      })
    });

    const msText = await msRes.text();

    if (!msRes.ok) {
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
}
