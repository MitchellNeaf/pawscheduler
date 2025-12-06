import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function handler(event, context) {
  try {
    // 1️⃣ Load all users from Supabase Auth Admin
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Supabase error:", error);
      return { statusCode: 500, body: "Failed to query users." };
    }

    const allUsers = data.users ?? [];

    // 2️⃣ Filter unverified
    const unverified = allUsers.filter(
      (u) => !u.email_confirmed_at
    );

    if (unverified.length === 0) {
      return { statusCode: 200, body: "No unverified users found." };
    }

    let sentCount = 0;

    // 3️⃣ Send emails
    for (const user of unverified) {
      try {
        await resend.emails.send({
          from: "PawScheduler <reminder@pawscheduler.com>",
          to: user.email,
          subject: "Please verify your PawScheduler account",
          html: `
            <p>Hi there! 👋</p>
            <p>You started signing up for PawScheduler but haven't verified your email yet.</p>
            <p>Please click the verification link sent earlier so you can finish setting up your account.</p>
            <p>If you need a new link, reply to this email and we’ll help you out.</p>
            <br/>
            <p>— The PawScheduler Team</p>
          `,
        });

        sentCount++;

        // 4️⃣ OPTIONAL tracking table update
        await supabase
          .from("signup_status")
          .update({ followup_sent: true })
          .eq("email", user.email);
      } catch (emailErr) {
        console.error("Failed sending to:", user.email, emailErr);
      }
    }

    return {
      statusCode: 200,
      body: `Sent follow-up emails to ${sentCount} unverified users.`,
    };
  } catch (err) {
    console.error("Fatal error:", err);
    return { statusCode: 500, body: "Server error." };
  }
}
