// src/pages/ReportCard.jsx
// Public-facing report card view — linked from SMS/email. No login required.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

const anonSupabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

/* Mood tag → emoji + label lookup, matches the picker groomers use */
const MOOD_TAGS = {
  happy:     { emoji: "😁", label: "Happy" },
  relaxed:   { emoji: "😌", label: "Relaxed" },
  cuddly:    { emoji: "🥰", label: "Cuddly" },
  sleepy:    { emoji: "😴", label: "Sleepy" },
  spicy:     { emoji: "🌶️", label: "A Little Spicy" },
  restless:  { emoji: "🚀", label: "Restless" },
  nervous:   { emoji: "😬", label: "A Bit Nervous" },
  brave:     { emoji: "🦁", label: "Brave" },
  excited:   { emoji: "🎉", label: "Excited" },
  cozy:      { emoji: "🐻", label: "Cozy" },
};

export default function ReportCard() {
  const { token } = useParams();
  const [card, setCard] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    if (!token) { setStatus("error"); return; }

    (async () => {
      const { data, error } = await anonSupabase
        .from("report_cards")
        .select(`
          id, before_photo_url, after_photo_url, mood_tags, notes, created_at,
          pets ( name ),
          groomers ( full_name, business_name, logo_url, brand_color )
        `)
        .eq("view_token", token)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        return;
      }

      setCard(data);
      setStatus("ok");
    })();
  }, [token]);

  const fmtDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
  };

  if (status === "loading") {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 40 }} className="pulse">🐾</div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🐾</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Report card not found</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>This link may be incorrect or the report card may have been removed.</p>
        </div>
      </main>
    );
  }

  const groomer = card.groomers;
  const petName = card.pets?.name || "Your pet";
  const groomerName = groomer?.business_name || groomer?.full_name || "Your groomer";
  const brand = groomer?.brand_color || "#c17d8f";
  const tags = Array.isArray(card.mood_tags) ? card.mood_tags : [];

  return (
    <main style={{ minHeight: "100vh", background: "#fdf6f4", padding: "32px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header card */}
        <div style={{
          background: `linear-gradient(135deg, ${brand}, #9c5f70)`,
          borderRadius: 24, padding: "32px 24px", textAlign: "center",
          color: "white", marginBottom: 20, boxShadow: "0 20px 50px rgba(156,95,112,.25)",
        }}>
          {groomer?.logo_url && (
            <img
              src={groomer.logo_url}
              alt={groomerName}
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", margin: "0 auto 14px", border: "3px solid rgba(255,255,255,.5)" }}
            />
          )}
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {groomerName}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 4px" }}>
            {petName}'s Report Card 🐾
          </h1>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{fmtDate(card.created_at)}</div>
        </div>

        {/* Photos */}
        {(card.before_photo_url || card.after_photo_url) && (
          <div style={{
            display: "grid",
            gridTemplateColumns: card.before_photo_url && card.after_photo_url ? "1fr 1fr" : "1fr",
            gap: 10, marginBottom: 20,
          }}>
            {card.before_photo_url && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9c8388", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, textAlign: "center" }}>
                  Before
                </div>
                <img src={card.before_photo_url} alt="Before" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: "3px solid white", boxShadow: "0 8px 24px rgba(156,95,112,.15)" }} />
              </div>
            )}
            {card.after_photo_url && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9c8388", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, textAlign: "center" }}>
                  After
                </div>
                <img src={card.after_photo_url} alt="After" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: "3px solid white", boxShadow: "0 8px 24px rgba(156,95,112,.15)" }} />
              </div>
            )}
          </div>
        )}

        {/* Mood tags */}
        {tags.length > 0 && (
          <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 4px 20px rgba(156,95,112,.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9c8388", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              How {petName} did today
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {tags.map((tag) => {
                const info = MOOD_TAGS[tag];
                if (!info) return null;
                return (
                  <span key={tag} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "#fbe7ea", color: "#7a3b49", fontWeight: 600, fontSize: 13,
                    padding: "6px 12px", borderRadius: 999,
                  }}>
                    <span style={{ fontSize: 15 }}>{info.emoji}</span> {info.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {card.notes && (
          <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 4px 20px rgba(156,95,112,.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9c8388", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Notes from your groomer
            </div>
            <p style={{ fontSize: 15, color: "#3d2b30", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {card.notes}
            </p>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 12, color: "#9c8388", marginTop: 24 }}>
          Sent with 🐾 by {groomerName} via PawScheduler
        </div>
      </div>
    </main>
  );
}