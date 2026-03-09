"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type ThemeMode = "sunny-girl" | "sci-fi" | "cosmic";

const THEME_MODE_STORAGE_KEY = "theme-mode";
const LEGACY_THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME_MODE: ThemeMode = "sunny-girl";
const THEME_MODE_ORDER: ThemeMode[] = ["sunny-girl", "sci-fi", "cosmic"];

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: DEFAULT_THEME_MODE,
  setThemeMode: () => {},
  cycleThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);

  const applyThemeMode = useCallback((mode: ThemeMode) => {
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      applyThemeMode(mode);
      localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    },
    [applyThemeMode]
  );

  const cycleThemeMode = useCallback(() => {
    const currentIndex = THEME_MODE_ORDER.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % THEME_MODE_ORDER.length;
    setThemeMode(THEME_MODE_ORDER[nextIndex]);
  }, [themeMode, setThemeMode]);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (saved === "sunny-girl" || saved === "sci-fi" || saved === "cosmic") {
      setThemeModeState(saved);
      applyThemeMode(saved);
      return;
    }
    const legacyTheme = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    let migratedMode: ThemeMode = DEFAULT_THEME_MODE;
    if (legacyTheme === "dark") {
      migratedMode = "sci-fi";
    }
    if (legacyTheme === "light") {
      migratedMode = "sunny-girl";
    }
    setThemeModeState(migratedMode);
    applyThemeMode(migratedMode);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, migratedMode);
    if (legacyTheme === "dark" || legacyTheme === "light") {
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
  }, [applyThemeMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, cycleThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeSwitcher() {
  const { themeMode, setThemeMode } = useTheme();
  const options: Array<{ mode: ThemeMode; label: string; titleLabel: string; icon: string }> = [
    { mode: "sunny-girl", label: "晴天", titleLabel: "晴天少女", icon: "🌤️" },
    { mode: "sci-fi", label: "科幻", titleLabel: "科幻", icon: "🛸" },
    { mode: "cosmic", label: "宇宙", titleLabel: "宇宙", icon: "🌌" },
  ];

  return (
    <select
      value={themeMode}
      onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
      className="theme-switcher min-w-[96px] px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] transition cursor-pointer text-[var(--text)]"
      aria-label="主题风格切换"
    >
      {options.map((option) => (
        <option key={option.mode} value={option.mode}>
          {`${option.icon} ${option.label}`}
        </option>
      ))}
    </select>
  );
}
