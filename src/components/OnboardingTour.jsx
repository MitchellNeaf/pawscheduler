// src/components/OnboardingTour.jsx
// Spotlight-style onboarding tour for new groomers.
// Uses data-tour="step-id" attributes to find and highlight elements.
// Stores completion in Supabase groomers.onboarding_complete.

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/* ─── Step definitions ──────────────────────────────────────────────────── */
const STEPS = [
  {
    id: "welcome",
    emoji: "🐾",
    title: "Welcome to PawScheduler!",
    body: "You're all set up. Let's take a 30-second tour of the key features so you can hit the ground running. You can skip anytime.",
    target: null,
    placement: "center",
    cta: "Let's go →",
  },
  {
    id: "tour-schedule-date",
    emoji: "📅",
    title: "Navigate Your Schedule",
    body: "Use the arrows to move between days, or tap the date to jump anywhere on the calendar. Hit 'Today' to snap back to now.",
    target: "tour-schedule-date",
    placement: "bottom",
    cta: "Got it →",
  },
  {
    id: "tour-view-toggle",
    emoji: "⊞",
    title: "Three Views",
    body: "Switch between List (your appointments in order), Grid (time-block view showing capacity), and Month (full calendar overview). Grid is great for spotting open slots at a glance.",
    target: "tour-view-toggle",
    placement: "bottom",
    cta: "Nice →",
  },
  {
    id: "tour-add-appointment",
    emoji: "➕",
    title: "Book an Appointment",
    body: "In Grid view, tap any open slot to book instantly. In List view, use the + button. You can pick the pet, services, duration, and price — and reminders fire automatically.",
    target: "tour-add-appointment",
    placement: "bottom",
    cta: "Understood →",
  },
  {
    id: "tour-nav-clients",
    emoji: "👥",
    title: "Clients & Pets",
    body: "All your clients and their pets live here. Add a client first, then add their pet with breed, size, behavioral tags, default services, and vaccination records.",
    target: "tour-nav-clients",
    placement: "bottom",
    cta: "Makes sense →",
  },
  {
    id: "tour-nav-profile",
    emoji: "⚙️",
    title: "Set Up Your Profile",
    body: "This is where you configure everything: working hours, services and pricing, your public booking link, SMS reminder templates, and intake form questions. Do this first.",
    target: "tour-nav-profile",
    placement: "bottom",
    cta: "Will do →",
  },
  {
    id: "tour-booking-link",
    emoji: "🔗",
    title: "Your Client Booking Page",
    body: "Share your personal booking link with clients and they can request appointments directly — no back-and-forth texting. Find it under Profile → Schedule tab. You can approve or auto-accept bookings.",
    target: null,
    placement: "center",
    cta: "One more →",
  },
  {
    id: "done",
    emoji: "🎉",
    title: "You're Ready!",
    body: "That's the core of PawScheduler. Head to Profile to set your hours and services, then start adding clients. Hit Help anytime if you get stuck.",
    target: null,
    placement: "center",
    cta: "Start using PawScheduler",
    isFinal: true,
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getRect(targetId) {
  if (!targetId) return null;
  const el = document.querySelector(`[data-tour="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    bottom: r.bottom,
    right: r.right,
  };
}

const PAD = 10; // spotlight padding around target

/* ─── Bubble position calculator ─────────────────────────────────────────── */
function getBubbleStyle(rect, placement, bubbleWidth = 300) {
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(bubbleWidth, window.innerWidth - 32),
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = Math.min(bubbleWidth, vw - 32);
  let top, left;

  if (placement === "bottom") {
    top = rect.bottom + PAD + 8;
    left = rect.left + rect.width / 2 - bw / 2;
  } else if (placement === "top") {
    top = rect.top - PAD - 8 - 200; // approx bubble height
    left = rect.left + rect.width / 2 - bw / 2;
  } else if (placement === "right") {
    top = rect.top + rect.height / 2 - 100;
    left = rect.right + PAD + 8;
  } else {
    top = rect.top + rect.height / 2 - 100;
    left = rect.left - bw - PAD - 8;
  }

  // Clamp to viewport
  left = Math.max(16, Math.min(left, vw - bw - 16));
  top = Math.max(16, Math.min(top, vh - 260));

  return { position: "fixed", top, left, width: bw };
}

/* ─── Arrow indicator ────────────────────────────────────────────────────── */
function ArrowIndicator({ rect, placement }) {
  if (!rect || placement === "center") return null;

  // A small animated pulsing dot pointing at the target
  const style = {
    position: "fixed",
    zIndex: 10001,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#059669",
    boxShadow: "0 0 0 4px rgba(5,150,105,0.3)",
    animation: "ps-pulse 1.5s ease-in-out infinite",
  };

  if (placement === "bottom") {
    style.top = rect.bottom + PAD + 2;
    style.left = rect.left + rect.width / 2 - 6;
  } else if (placement === "top") {
    style.top = rect.top - PAD - 14;
    style.left = rect.left + rect.width / 2 - 6;
  }

  return <div style={style} />;
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function OnboardingTour({ userId, onComplete }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false);

  const current = STEPS[step];

  // Measure target and scroll into view
  const measureTarget = useCallback(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    // Scroll element into view
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    // Wait for scroll then measure
    setTimeout(() => {
      setRect(getRect(current.target));
    }, 350);
  }, [current.target]);

  // Re-measure on resize/scroll
  useEffect(() => {
    setVisible(false);
    measureTarget();
    const timer = setTimeout(() => setVisible(true), 400);

    const handleResize = () => setRect(getRect(current.target));
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [step, measureTarget, current.target]);

  const markComplete = useCallback(async () => {
    if (!userId) return;
    try {
      const { supabase } = await import("../supabase");
      await supabase
        .from("groomers")
        .update({ onboarding_complete: true })
        .eq("id", userId);
    } catch (_) {}
  }, [userId]);

  const handleNext = useCallback(async () => {
    if (current.isFinal) {
      await markComplete();
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  }, [current.isFinal, markComplete, onComplete]);

  const handleSkip = useCallback(async () => {
    await markComplete();
    onComplete();
  }, [markComplete, onComplete]);

  // Lock body scroll while touring
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const bubbleStyle = getBubbleStyle(rect, current.placement);
  const progress = ((step) / (STEPS.length - 1)) * 100;

  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "auto" }}>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes ps-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(5,150,105,0.3); }
          50% { box-shadow: 0 0 0 10px rgba(5,150,105,0.05); }
        }
        @keyframes ps-fadein {
          from { opacity: 0; transform: translateY(6px) translate(var(--tx,0), var(--ty,0)); }
          to   { opacity: 1; transform: translateY(0) translate(var(--tx,0), var(--ty,0)); }
        }
        .ps-bubble {
          animation: ps-fadein 0.25s ease forwards;
        }
      `}</style>

      {/* Dark overlay — uses box-shadow cutout trick for spotlight */}
      {rect ? (
        <div
          onClick={handleSkip}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "transparent",
            boxShadow: `
              0 0 0 9999px rgba(0,0,0,0.6),
              0 0 0 ${PAD}px rgba(0,0,0,0.6)
            `,
            borderRadius: 8,
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          onClick={handleSkip}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        />
      )}

      {/* Spotlight border glow */}
      {rect && (
        <div
          style={{
            position: "fixed",
            zIndex: 10000,
            pointerEvents: "none",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 8,
            border: "2px solid rgba(5,150,105,0.8)",
            boxShadow: "0 0 16px rgba(5,150,105,0.4)",
          }}
        />
      )}

      {/* Arrow indicator */}
      <ArrowIndicator rect={rect} placement={current.placement} />

      {/* Callout bubble */}
      {visible && (
        <div
          className="ps-bubble"
          style={{
            ...bubbleStyle,
            zIndex: 10002,
            background: "white",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.15)",
            padding: "20px 20px 16px",
            pointerEvents: "auto",
          }}
        >
          {/* Progress bar */}
          <div style={{
            height: 3,
            background: "#e5e7eb",
            borderRadius: 99,
            marginBottom: 16,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: "#059669",
              borderRadius: 99,
              transition: "width 0.3s ease",
            }} />
          </div>

          {/* Emoji + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>{current.emoji}</span>
            <h3 style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 700,
              color: "#111827",
              lineHeight: 1.3,
            }}>
              {current.title}
            </h3>
          </div>

          {/* Body */}
          <p style={{
            margin: "0 0 16px",
            fontSize: "0.875rem",
            color: "#4b5563",
            lineHeight: 1.6,
          }}>
            {current.body}
          </p>

          {/* Step counter + buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 500 }}>
              {step + 1} of {STEPS.length}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {!current.isFinal && (
                <button
                  onClick={handleSkip}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    color: "#6b7280",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Skip tour
                </button>
              )}
              <button
                onClick={handleNext}
                style={{
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#059669",
                  color: "white",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(5,150,105,0.35)",
                }}
              >
                {current.cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}