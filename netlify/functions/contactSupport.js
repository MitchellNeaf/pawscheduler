const fetch = require("node-fetch");

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return { statusCode: 400, body: "Missing fields" };
    }

    const html = `
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong><br>${message}</p>
    `;

    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: { email: "noreply@pawscheduler.app", name: "PawScheduler" },
        reply_to: { email, name }, // Reply goes to the user
        to: [{ email: "pawscheduler@gmail.com" }], // YOUR inbox
        subject: "New Contact Form Message",
        html
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("MailerSend Error:", text);
      return { statusCode: 500, body: "Failed to send email" };
    }

    return { statusCode: 200, body: "Success" };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};
