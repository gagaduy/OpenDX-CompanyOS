// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StorefrontTheme = "dark" | "light";

interface ThemeContextValue {
  readonly resolvedTheme: StorefrontTheme;
  readonly toggleTheme: () => void;
}

const storageKey = "novacommerce-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readTheme(): StorefrontTheme {
  try {
    return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<StorefrontTheme>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    try {
      localStorage.setItem(storageKey, resolvedTheme);
    } catch {
      // A blocked storage API must not prevent theme changes in this session.
    }
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      toggleTheme: () =>
        setResolvedTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === undefined) throw new Error("ThemeProvider is required");
  return value;
}
