import { useEffect, useState } from "react";

export default function ThemeToggle({ className = "" }) {
  // Initial state: respect saved pref or OS setting
  const getInitial = () => {
    if (typeof localStorage !== "undefined" && localStorage.theme) {
      return localStorage.theme === "dark";
    }
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  };

  const [dark, setDark] = useState(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.theme = "dark";
    } else {
      root.classList.remove("dark");
      localStorage.theme = "light";
    }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition
                  border-gray-300 text-gray-800 hover:bg-gray-100
                  dark:border-white/20 dark:text-white dark:hover:bg-white/10 ${className}`}
      aria-label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
