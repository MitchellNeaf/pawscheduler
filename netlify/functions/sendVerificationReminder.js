const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function(event) {
  try {
    // 1️⃣ INIT SUPABASE (admin privileges)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 2️⃣ Load all users
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error("Supabase error:", error);
      return { statusCode: 500, body: "Failed to load users." };
    }

    const allUsers = data?.users ?? [];
    const unverified = allUsers.filter(u => !u.email_confirmed_at);

    if (unverified.length === 0) {
      return {
        statusCode: 200,
        body: "No unverified users found."
      };
    }

    // 3️⃣ Load reminder email template
    const templatesDir = path.join(__dirname, "..", "email_templates");
    const htmlPath = path.join(templatesDir, "reminder.html");
    const rawHtml = fs.readFileSync(htmlPath, "utf8");

    let sentCount = 0;

    for (const user of unverified) {
      try {
        // Replace simple variables inside template
        const html = rawHtml
          .replace(/{{email}}/g, user.email)
          .replace(/{{business_name}}/g, "PawScheduler");

        // 4️⃣ Send via MailerSend (same as your working function)
        const res = await fetch("https://api.mailersend.com/v1/email", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
            to: [{ email: user.email }],
            subject: "Please verify your PawScheduler account",
            html
          })
        });

        const msText = await res.text();

        console.log("MailerSend response:", msText);


        if (!res.ok) {
          console.error("MailerSend error =>", msText);
          continue; // don't crash, skip to next
        }

        sentCount++;

      } catch (err) {
        console.error("Email failed:", user.email, err);
      }
    }

    return {
      statusCode: 200,
      body: `Sent ${sentCount} verification reminder emails`
    };

  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: "Server error."
    };
  }
};
