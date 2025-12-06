const { createClient } = require("@supabase/supabase-js");

exports.handler = async function(event) {
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

    const unverified = users.filter(u => !u.email_confirmed_at);
    console.log("Unverified users:", unverified.length);

    if (unverified.length === 0) {
      console.log("No unverified users found.");
      return {
        statusCode: 200,
        body: "No unverified users found."
      };
    }

    let sentCount = 0;

    // 2️⃣ Loop + resend verification email
    for (const user of unverified) {
      const { email } = user;

      console.log("Sending verification to:", email);

      const { error: genError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email
      });

      if (genError) {
        console.error("❌ Resend failed for:", email, "-", genError.message);
        continue;
      }

      console.log("✅ Successfully resent to:", email);
      sentCount++;
    }

    console.log("=== Resend Completed ===");
    console.log("Total emails successfully sent:", sentCount);

    return {
      statusCode: 200,
      body: `Resent Supabase verification emails to ${sentCount} users.`
    };

  } catch (err) {
    console.error("Server error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
