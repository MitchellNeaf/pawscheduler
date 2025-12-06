const { createClient } = require("@supabase/supabase-js");

exports.handler = async function(event) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1️⃣ Load all users
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error(error);
      return { statusCode: 500, body: "Failed to load users." };
    }

    const users = data?.users ?? [];
    const unverified = users.filter(u => !u.email_confirmed_at);

    if (unverified.length === 0) {
      return {
        statusCode: 200,
        body: "No unverified users found."
      };
    }

    let sentCount = 0;

    // 2️⃣ Loop through and send verification via Supabase generate_link
    for (const user of unverified) {
      const { email } = user;

      // Supabase will send verification email automatically
      const { error: genError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email
      });

      if (genError) {
        console.error("Resend failed for", email, genError.message);
        continue;
      }

      sentCount++;
    }

    return {
      statusCode: 200,
      body: `Resent Supabase verification emails to ${sentCount} users.`
    };

  } catch (err) {
    console.error("Server error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
