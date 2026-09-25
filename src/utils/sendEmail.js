import { supabase } from "../supabase";

/* The sendEmail function only accepts requests it can verify (see
   netlify/functions/sendEmail.js). This attaches the logged-in groomer's
   access token when there is one; public pages (booking page, signup)
   send without it and are limited to their specific notification emails.
   Drop-in replacement for fetch("/.netlify/functions/sendEmail", init). */
export async function emailFetch(init = {}) {
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch {}

  return fetch("/.netlify/functions/sendEmail", {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function sendEmail({ to, subject, template, data }) {
  try {
    const res = await emailFetch({
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
