// src/utils/sendEmail.js

export async function sendEmail({ to, subject, text }) {
  const url = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/send-email`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ to, subject, text }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    console.error("Email send error:", data || res.statusText);
    return { success: false, error: data };
  }

  console.log("Email sent:", data);
  return { success: true, data };
}
