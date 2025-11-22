export async function sendEmail({ to, subject, template, data }) {
  try {
    const res = await fetch("/.netlify/functions/sendEmail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ to, subject, template, data })
    });

    if (!res.ok) {
      throw new Error("Failed to send email");
    }

    return true;

  } catch (err) {
    console.error("Email fetch failed:", err);
    return false;
  }
}
