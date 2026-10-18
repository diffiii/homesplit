"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  applyTheme,
  DARK_QUERY,
  readTheme,
  THEME_STORAGE_KEY,
  type Theme,
  writeTheme,
} from "@/lib/theme";

interface ThemeContextValue {
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the choice.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The theme choice, kept in `localStorage`. `THEME_SCRIPT` applies it before
 * hydration; this keeps `<html>` in sync afterwards, including when the system
 * switches between light and dark while the choice is `system`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    (): Theme => "system"
  );

  // Layout effect, so the class is back before paint after React's dev-mode
  // remount strips attributes it doesn't manage from `<html>`.
  useLayoutEffect(() => {
    applyTheme(theme);
    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
    for (const listener of listeners) {
      listener();
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
