import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replaces {{variables}} in template with real values
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
    const body = JSON.parse(event.body);

    const {
      to,
      subject,
      template,      // "confirmation" or "reminder"
      data           // { pet_name, date, time, etc }
    } = body;

    if (!to || !subject || !template || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // Pick template file
    const templateFile =
      template === "reminder"
        ? "reminder.html"
        : "confirmation.html";

    // Full path to HTML
    const htmlPath = path.join(__dirname, "..", "email_templates", templateFile);

    // Load HTML from disk
    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    // Fill HTML with appointment/groomer data
    const html = fillTemplate(rawHtml, data);

    // Send via MailerSend
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
    console.error("SendEmail error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
