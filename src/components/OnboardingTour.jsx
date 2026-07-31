// src/components/OnboardingTour.jsx
// Reusable spotlight-style tour engine — pass in `steps` and `completionField`
// so it can drive the main Schedule-page walkthrough, or a page-specific tour
// like the Profile tour, without duplicating this engine.
// Uses data-tour="step-id" attributes to find and highlight elements.
// Stores completion on the groomers row at whatever column `completionField` names.

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

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
      bottom: 24,
      left: 16,
      right: 16,
      width: "auto",
      maxWidth: 420,
      margin: "0 auto",
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
    top = rect.top - PAD - 8 - 200;
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
export default function OnboardingTour({ userId, onComplete, steps, completionField = "onboarding_complete" }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false);

  const STEPS = steps;
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
        .update({ [completionField]: true })
        .eq("id", userId);
    } catch (_) {}
  }, [userId, completionField]);

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

  const bubbleStyle = window.innerWidth < 640
    ? {
        position: "fixed",
        bottom: 24,
        left: 16,
        right: 16,
        width: "auto",
      }
    : getBubbleStyle(rect, current.placement);
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