// src/components/AddToHomeScreenBanner.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

export default function AddToHomeScreenBanner({ userId }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until we know
  const [deferredPrompt, setDeferredPrompt] = useState(null); // Android/Chrome's real install prompt

  // Load whether this groomer already dismissed it
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("groomers")
      .select("has_dismissed_add_to_home")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setDismissed(!!data?.has_dismissed_add_to_home));
  }, [userId]);

  // Capture Android/Chrome's native install prompt when it fires
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Decide whether to actually show the banner — no longer gated on
  // deferredPrompt existing. Chrome doesn't always fire beforeinstallprompt
  // (e.g. after a prior decline in the session), and hiding entirely in
  // that case means someone never finds out installing is even possible.
  useEffect(() => {
    if (dismissed || isStandalone()) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [dismissed]);

  const handleDismiss = async () => {
    setVisible(false);
    if (!userId) return;
    const { error } = await supabase
      .from("groomers")
      .update({ has_dismissed_add_to_home: true })
      .eq("id", userId);
    if (error) console.error("Failed to save add-to-home dismissal:", error.message);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      // They're actually installed now — isStandalone() will also catch
      // this going forward, but marking it explicitly is harmless.
      handleDismiss();
    } else {
      // Declined, not dismissed — just hide for now, don't permanently
      // suppress it. They might install later if Chrome offers again.
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-emerald-600 text-white px-4 py-3 shadow-lg">
      <div className="max-w-lg mx-auto flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">📲</span>
        <div className="flex-1 min-w-0">
          {isIOS() ? (
            <>
              <p className="text-sm font-bold">Add PawScheduler to your Home Screen</p>
              <p className="text-xs text-emerald-50 mt-0.5">
                Tap <strong>Share</strong> (the box with an arrow, at the bottom of Safari), then{" "}
                <strong>"Add to Home Screen."</strong> You'll get notifications even when the app isn't open.
              </p>
            </>
          ) : deferredPrompt ? (
            <>
              <p className="text-sm font-bold">Install PawScheduler</p>
              <p className="text-xs text-emerald-50 mt-0.5">
                Get one-tap access from your home screen, plus notifications even when the app isn't open.
              </p>
              <button
                onClick={handleInstallClick}
                className="mt-2 bg-white text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg"
              >
                Install App
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold">Install PawScheduler</p>
              <p className="text-xs text-emerald-50 mt-0.5">
                On your phone: tap the <strong>⋮ menu</strong> in your browser, then{" "}
                <strong>"Add to Home screen"</strong> or <strong>"Install app."</strong> On a computer, look
                for a small install icon in your browser's address bar. You'll get notifications even when
                the app isn't open.
              </p>
            </>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-emerald-100 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}