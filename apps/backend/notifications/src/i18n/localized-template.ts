// Issue #357 — Render a localised subject + body for a given contract event type.
import { loadTranslations, interpolate, SUPPORTED_LOCALES } from "./index.js";
import type { SupportedLocale } from "./index.js";

export interface LocalizedTemplateResult {
  subject: string;
  body: string;
  /** The locale that was actually used (may differ from requested if fallback occurred). */
  locale: string;
}

/**
 * Render a localised notification template for `eventType`.
 *
 * The translation keys are derived from the event type by replacing `.` with
 * `_` and appending `_subject` / `_body` (e.g. `escrow.released` → keys
 * `escrow_released_subject` and `escrow_released_body`).
 *
 * Falls back to English when:
 * - `locale` is not in `SUPPORTED_LOCALES`
 * - A key is missing in the requested locale (individual key fallback is
 *   handled by `loadTranslations` which merges with English)
 *
 * @param eventType  Dot-separated event type string, e.g. `"escrow.released"`.
 * @param locale     BCP-47 locale tag (only the primary subtag is used).
 * @param data       Interpolation data, e.g. `{ orderId: "123", amount: "5 XLM" }`.
 */
export function renderLocalizedTemplate(
  eventType: string,
  locale: string,
  data: Record<string, string>
): LocalizedTemplateResult {
  // Determine which locale to actually use.
  const normalisedLocale = locale.toLowerCase();
  const resolvedLocale: string = SUPPORTED_LOCALES.includes(
    normalisedLocale as SupportedLocale
  )
    ? normalisedLocale
    : "en";

  const translations = loadTranslations(resolvedLocale);

  // Derive translation keys from the event type (dots → underscores).
  const keyBase = eventType.replace(/\./g, "_").replace(/-/g, "_");
  const subjectKey = `${keyBase}_subject`;
  const bodyKey = `${keyBase}_body`;

  const rawSubject = translations[subjectKey] ?? `[${subjectKey}]`;
  const rawBody = translations[bodyKey] ?? `[${bodyKey}]`;

  return {
    subject: interpolate(rawSubject, data),
    body: interpolate(rawBody, data),
    locale: resolvedLocale,
  };
}
