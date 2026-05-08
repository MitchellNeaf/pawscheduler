// src/pages/ConfirmPage.jsx
// Linked from SMS confirmation messages: /confirm/:token
// One tap — no login required.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";

export default function ConfirmPage() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"); // "loading" | "success" | "already" | "error"
  const [appt, setAppt] = useState(null);

  useEffect(() => {
    if (!token) { setStatus("error"); return; }

    (async () => {
      // Look up the appointment by confirm_token
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, date, time, confirmed, confirm_token,
          pets ( name, clients ( full_name ) )
        `)
        .eq("confirm_token", token)
        .maybeSingle();

      if (error || !data) {
        console.error("ConfirmPage lookup error:", error, "data:", data);
        setStatus("error");
        return;
      }

      if (data.confirmed) {
        setAppt(data);
        setStatus("already");
        return;
      }

      // Update directly — we already verified the token matches via the SELECT above
      const { error: updateErr } = await supabase
        .from("appointments")
        .update({ confirmed: true, confirm_token: null })
        .eq("id", data.id)
        .eq("confirm_token", token);

      if (updateErr) {
        console.error("confirm update error:", updateErr);
        setStatus("error");
        return;
      }

      setAppt(data);
      setStatus("success");
    })();
  }, [token]);

  const fmtDate = (d) => {
    if (!d) return "";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
  };

  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">

        {status === "loading" && (
          <>
            <div className="text-4xl animate-pulse">🐾</div>
            <p className="text-[var(--text-3)] text-sm">Confirming your appointment…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-6xl">✅</div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">You're confirmed!</h1>
            {appt && (
              <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 text-left space-y-1.5 text-sm">
                <div><span className="font-semibold text-[var(--text-2)]">Pet:</span> <span className="text-[var(--text-1)]">{appt.pets?.name}</span></div>
                <div><span className="font-semibold text-[var(--text-2)]">Date:</span> <span className="text-[var(--text-1)]">{fmtDate(appt.date)}</span></div>
                <div><span className="font-semibold text-[var(--text-2)]">Time:</span> <span className="text-[var(--text-1)]">{fmtTime(appt.time)}</span></div>
              </div>
            )}
            <p className="text-[var(--text-3)] text-xs">You can close this page.</p>
          </>
        )}

        {status === "already" && (
          <>
            <div className="text-6xl">✅</div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Already confirmed</h1>
            {appt && (
              <div className="rounded-2xl border border-[var(--border-med)] bg-[var(--surface)] p-4 text-left space-y-1.5 text-sm">
                <div><span className="font-semibold text-[var(--text-2)]">Pet:</span> <span className="text-[var(--text-1)]">{appt.pets?.name}</span></div>
                <div><span className="font-semibold text-[var(--text-2)]">Date:</span> <span className="text-[var(--text-1)]">{fmtDate(appt.date)}</span></div>
                <div><span className="font-semibold text-[var(--text-2)]">Time:</span> <span className="text-[var(--text-1)]">{fmtTime(appt.time)}</span></div>
              </div>
            )}
            <p className="text-[var(--text-3)] text-xs">This appointment is already confirmed. You can close this page.</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-6xl">❌</div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Link not found</h1>
            <p className="text-[var(--text-2)] text-sm">This confirmation link may have already been used or has expired. Your appointment may already be confirmed.</p>
            <p className="text-[var(--text-3)] text-xs">If you have questions, contact your groomer directly.</p>
          </>
        )}

      </div>
    </main>
  );
}