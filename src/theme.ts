const STORAGE_KEY = "easynotes-theme";

type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";
const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

function getSystemTheme(): Theme {
  return mediaQuery.matches ? "light" : "dark";
}

export function getThemePreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light" || saved === "system") return saved;
  return "system";
}

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function syncThemePreference(themePreference: ThemePreference) {
  applyTheme(themePreference === "system" ? getSystemTheme() : themePreference);
}

export function initTheme() {
  syncThemePreference(getThemePreference());

  mediaQuery.addEventListener("change", () => {
    if (getThemePreference() === "system") {
      syncThemePreference("system");
    }
  });
}

export function setThemePreference(themePreference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, themePreference);
  syncThemePreference(themePreference);
}