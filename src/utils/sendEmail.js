// src/utils/sendEmail.js
console.log("SUPABASE URL =", process.env.REACT_APP_SUPABASE_URL);
console.log("SUPABASE KEY =", process.env.REACT_APP_SUPABASE_ANON_KEY);

export async function sendEmail({ to, subject, text }) {
  const endpoint = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/send-email`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`, // OK when JWT verify is OFF
    },
    body: JSON.stringify({ to, subject, text }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    console.error("Failed to parse JSON:", err);
  }

  if (!res.ok) {
    console.error("Email send error:", data);
    return { success: false, error: data };
  }

  return { success: true, data };
}
