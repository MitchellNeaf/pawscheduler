const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");

exports.handler = async function (event) {
  try {
    console.log("=== Resend All Verifications Started ===");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1️⃣ Load all users
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error("Error loading users:", error);
      return { statusCode: 500, body: "Failed to load users." };
    }

    const users = data?.users ?? [];
    console.log("Total users:", users.length);

    const unverified = users.filter((u) => !u.email_confirmed_at);
    console.log("Unverified users:", unverified.length);

    if (unverified.length === 0) {
      console.log("No unverified users found.");
      return {
        statusCode: 200,
        body: "No unverified users found.",
      };
    }

    let sentCount = 0;

    // 2️⃣ Loop users + send emails
    for (const user of unverified) {
      const { email } = user;

      console.log("Generating Supabase link for:", email);

      // Generate verification link
      const { data: linkData, error: genError } =
        await supabase.auth.admin.generateLink({
          type: "signup",
          email,
        });

      if (genError) {
        console.error("❌ generateLink failed:", email, genError.message);
        continue;
      }

      const actionLink = linkData?.properties?.action_link;
      if (!actionLink) {
        console.error("❌ No action_link returned for:", email);
        continue;
      }

      // 3️⃣ Send via MailerSend
      console.log("Sending MailerSend verification email to:", email);

      const res = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
          reply_to: {
            email: "pawscheduler@gmail.com",
            name: "PawScheduler",
          },
          to: [{ email }],
          subject: "Verify your PawScheduler account",
          html: `
            <p>Hi there,</p>
            <p>Click the button below to verify your PawScheduler account:</p>

            <p>
              <a href="${actionLink}"
                 style="background:#059669;color:white;padding:12px 20px;
                 border-radius:6px;text-decoration:none;font-weight:600;">
                Verify My Account
              </a>
            </p>

            <p>If you didn’t request this, you can ignore this email.</p>
          `,
        }),
      });

      const text = await res.text();
      console.log("MailerSend response:", text);

      if (!res.ok) {
        console.error("❌ MailerSend error for:", email, text);
        continue;
      }

      console.log("✅ Email sent successfully to:", email);
      sentCount++;
    }

    console.log("=== Resend Completed ===");
    console.log("Total emails sent:", sentCount);

    return {
      statusCode: 200,
      body: `Verification emails sent: ${sentCount}`,
    };
  } catch (err) {
    console.error("Server error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
