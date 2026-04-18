/**
 * DarkModeToggle — a self-contained toggle button.
 *
 * Drop this anywhere in your layout/nav. It reads and writes
 * dark mode state via the useDarkMode hook.
 *
 * Usage:
 *   import DarkModeToggle from "../components/DarkModeToggle";
 *   <DarkModeToggle />
 *
 * Or pass isDark + toggle from a parent that already uses the hook:
 *   const { isDark, toggle } = useDarkMode();
 *   <DarkModeToggle isDark={isDark} onToggle={toggle} />
 */
import useDarkMode from "../hooks/useDarkMode";

export default function DarkModeToggle({ isDark: isDarkProp, onToggle }) {
  // If not controlled externally, manage state internally
  const internal = useDarkMode();
  const isDark  = isDarkProp  !== undefined ? isDarkProp  : internal.isDark;
  const toggle  = onToggle    !== undefined ? onToggle    : internal.toggle;

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`
        w-9 h-9 rounded-full flex items-center justify-center text-base
        border transition-colors
        ${isDark
          ? "bg-gray-700 border-gray-600 text-yellow-300 hover:bg-gray-600"
          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        }
      `}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}