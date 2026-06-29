"use client";

/**
 * lib/i18n/LanguageProvider.tsx
 * App-wide language layer.
 *
 * - `lang`     : current UI language code ("en", "hi", ... 11 supported).
 * - `setLang`  : change language (persisted to localStorage; the Profile page
 *                also writes it to Firestore as preferredLanguage).
 * - `t(text)`  : returns `text` translated into the current language. English
 *                source strings are translated on demand via /api/translate and
 *                cached (memory + localStorage) so it's a one-time cost.
 *
 * Strings render in English first, then swap to the translation once it
 * arrives — a standard progressive-enhancement pattern that keeps the app fast.
 */

"use client";

import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { SARVAM_LANG, type LanguageCode } from "@/app/chat/types";
import { STATIC_TRANSLATIONS } from "./translations";

interface I18nContextValue {
  lang: LanguageCode;
  setLang: (l: LanguageCode) => void;
  t: (text: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (s) => s,
});

const LANG_KEY = "cw_lang";
const cachePrefix = (l: string) => `cw_i18n_${l}`;

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>("en");
  const [, bump] = useState(0);                       // force re-render on new translations

  const dictRef    = useRef<Record<string, Record<string, string>>>({}); // lang -> {src: translated}
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved language on first mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as LanguageCode | null;
      if (saved && saved in SARVAM_LANG) setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  // Load cached dictionary for the active language.
  useEffect(() => {
    if (lang === "en") return;
    if (!dictRef.current[lang]) {
      try {
        dictRef.current[lang] = JSON.parse(localStorage.getItem(cachePrefix(lang)) || "{}");
      } catch { dictRef.current[lang] = {}; }
      bump((x) => x + 1);
    }
  }, [lang]);

  const setLang = useCallback((l: LanguageCode) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }, []);

  // Send queued strings to the translation API, then cache + re-render.
  const flush = useCallback(async () => {
    const l = lang;
    if (l === "en") { pendingRef.current.clear(); return; }
    const texts = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (!texts.length) return;

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, target: SARVAM_LANG[l] }),
      });
      const data = await res.json();
      if (data?.translations) {
        const dict = (dictRef.current[l] ||= {});
        for (const [src, tr] of Object.entries(data.translations as Record<string, string>)) {
          dict[src] = tr;
        }
        try { localStorage.setItem(cachePrefix(l), JSON.stringify(dict)); } catch { /* ignore */ }
        bump((x) => x + 1);
      }
    } catch { /* keep English fallback */ }
  }, [lang]);

  const t = useCallback((text: string): string => {
    if (lang === "en" || !text) return text;

    // 1) Hardcoded static UI strings — free, instant, no API cost.
    const fixed = STATIC_TRANSLATIONS[text]?.[lang];
    if (fixed) return fixed;

    // 2) Dynamic content (AI/data not in the static dictionary) — translate
    //    on demand via Sarvam and cache. This is the only path that bills.
    const dict = dictRef.current[lang];
    const hit = dict?.[text];
    if (hit !== undefined) return hit;

    if (!pendingRef.current.has(text)) {
      pendingRef.current.add(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 60);
    }
    return text; // English until the translation arrives
  }, [lang, flush]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
