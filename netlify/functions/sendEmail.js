import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    const body = JSON.parse(event.body);

    const { to, subject, text } = body;

    if (!to || !subject || !text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: {
          email: "noreply@pawscheduler.app",  // <-- FIXED
          name: "PawScheduler"
        },
        to: [{ email: to }],
        subject,
        text
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: errText })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("MailerSend error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
