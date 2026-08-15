import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  const saved = window.localStorage.getItem("nso-audit-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("nso-audit-theme", theme);
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button className="theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={`Use ${nextTheme} mode`} title={`Use ${nextTheme} mode`}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
