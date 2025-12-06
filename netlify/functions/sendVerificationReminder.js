const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

// Sleep helper — wait N milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

    // 4️⃣ Rate limit: 1 email every 7 seconds (max 8/minute)
    for (const user of unverified) {
      try {
        const html = rawHtml
          .replace(/{{email}}/g, user.email)
          .replace(/{{business_name}}/g, "PawScheduler");

        // Send email
        const res = await fetch("https://api.mailersend.com/v1/email", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },

            // 👇👇 ADD THIS LINE — forwards replies to your Gmail
            reply_to: { email: "pawscheduler@gmail.com", name: "PawScheduler" },

            to: [{ email: user.email }],
            subject: "Please verify your PawScheduler account",
            html
          })
        });

        const msText = await res.text();
        console.log("MailerSend response:", msText);

        if (!res.ok) {
          console.error("MailerSend error =>", msText);
          continue;
        }

        sentCount++;

      } catch (err) {
        console.error("Email failed:", user.email, err);
      }

      // Wait 7 seconds before next email
      await sleep(7000);
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
