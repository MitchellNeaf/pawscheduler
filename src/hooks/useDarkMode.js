/**
 * useDarkMode — manages dark mode state for PawScheduler.
 *
 * Reads/writes the `pawscheduler_dark` key in localStorage.
 * Adds/removes the `.dark` class on <html> to trigger Tailwind dark mode.
 *
 * Usage:
 *   import useDarkMode from "../hooks/useDarkMode";
 *   const { isDark, toggle } = useDarkMode();
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "pawscheduler_dark";

export default function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    // Read saved preference, fall back to system preference
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return saved === "true";
    } catch (_) {}
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(isDark));
    } catch (_) {}
  }, [isDark]);

  const toggle = () => setIsDark((prev) => !prev);

  return { isDark, toggle };
}