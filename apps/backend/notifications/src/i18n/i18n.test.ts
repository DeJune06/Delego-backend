// Tests for i18n infrastructure — Issue #357
import { describe, it, expect, beforeEach } from "vitest";
import { loadTranslations, interpolate, SUPPORTED_LOCALES } from "./index.js";
import { renderLocalizedTemplate } from "./localized-template.js";

// Reset the module-level translation cache between tests so locale files are
// re-read and test isolation is maintained.  We do this by re-importing the
// module; vitest's module registry is shared within a test file so instead we
// exercise the observable behaviour rather than the cache internals.

describe("SUPPORTED_LOCALES", () => {
  it("includes en, es, and fr", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES).toContain("es");
    expect(SUPPORTED_LOCALES).toContain("fr");
  });
});

describe("loadTranslations", () => {
  it("returns English strings for locale 'en'", () => {
    const t = loadTranslations("en");
    expect(typeof t).toBe("object");
    expect(t["escrow_released_subject"]).toBeTruthy();
    expect(t["payment_failed_subject"]).toBeTruthy();
  });

  it("returns Spanish strings for locale 'es'", () => {
    const t = loadTranslations("es");
    // Subject keys must exist; values should differ from English.
    expect(t["escrow_released_subject"]).toBeTruthy();
    const en = loadTranslations("en");
    expect(t["escrow_released_subject"]).not.toBe(en["escrow_released_subject"]);
  });

  it("returns French strings for locale 'fr'", () => {
    const t = loadTranslations("fr");
    expect(t["escrow_released_subject"]).toBeTruthy();
    const en = loadTranslations("en");
    expect(t["escrow_released_subject"]).not.toBe(en["escrow_released_subject"]);
  });

  it("falls back to English for an unsupported locale ('zz')", () => {
    const t = loadTranslations("zz");
    const en = loadTranslations("en");
    expect(t).toEqual(en);
  });

  it("falls back to English for an empty string locale", () => {
    const t = loadTranslations("");
    const en = loadTranslations("en");
    expect(t["escrow_released_subject"]).toBe(en["escrow_released_subject"]);
  });

  it("is case-insensitive ('EN' -> English, 'ES' -> Spanish)", () => {
    const tEn = loadTranslations("EN");
    const en = loadTranslations("en");
    expect(tEn).toEqual(en);

    const tEs = loadTranslations("ES");
    const es = loadTranslations("es");
    expect(tEs).toEqual(es);
  });

  it("returns all required event type keys for 'en'", () => {
    const t = loadTranslations("en");
    const requiredKeys = [
      "escrow_created_subject",
      "escrow_created_body",
      "escrow_released_subject",
      "escrow_released_body",
      "escrow_refunded_subject",
      "escrow_refunded_body",
      "escrow_disputed_subject",
      "escrow_disputed_body",
      "payment_failed_subject",
      "payment_failed_body",
      "permission_granted_subject",
      "permission_granted_body",
      "permission_revoked_subject",
      "permission_revoked_body",
      "permission_expiry_updated_subject",
      "permission_expiry_updated_body",
      "transaction_approval_subject",
      "transaction_approval_body",
    ];
    for (const key of requiredKeys) {
      expect(t[key], `missing key: ${key}`).toBeTruthy();
    }
  });

  it("merges missing keys from English when a locale file is incomplete", () => {
    // Spanish and French files might not have every key; loadTranslations
    // should fill gaps with English values, so every key is present.
    for (const locale of ["es", "fr"] as const) {
      const en = loadTranslations("en");
      const t = loadTranslations(locale);
      for (const key of Object.keys(en)) {
        expect(t[key], `key "${key}" missing in locale "${locale}"`).toBeTruthy();
      }
    }
  });
});

describe("interpolate", () => {
  it("replaces {{key}} placeholders with values from data", () => {
    const result = interpolate("Order {{orderId}} for {{amount}}", {
      orderId: "ORD-123",
      amount: "10 XLM",
    });
    expect(result).toBe("Order ORD-123 for 10 XLM");
  });

  it("leaves unknown placeholders unchanged", () => {
    const result = interpolate("Hello {{name}}, your order is {{orderId}}", {
      name: "Alice",
    });
    expect(result).toBe("Hello Alice, your order is {{orderId}}");
  });

  it("handles an empty data object (no replacements)", () => {
    const template = "No placeholders here.";
    expect(interpolate(template, {})).toBe(template);
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    const result = interpolate("{{x}} and {{x}} again", { x: "Y" });
    expect(result).toBe("Y and Y again");
  });
});

describe("renderLocalizedTemplate", () => {
  it("returns correct locale and non-empty subject/body for a valid event type and locale", () => {
    const result = renderLocalizedTemplate("escrow.released", "en", {
      orderId: "ORD-999",
      amount: "5 XLM",
      merchant: "TechShop",
    });

    expect(result.locale).toBe("en");
    expect(result.subject).toBeTruthy();
    expect(result.body).toBeTruthy();
    // Should have interpolated the orderId
    expect(result.subject).toContain("ORD-999");
  });

  it("returns Spanish strings when locale is 'es'", () => {
    const enResult = renderLocalizedTemplate("payment.failed", "en", {
      orderId: "ORD-1",
      amount: "2 XLM",
      merchant: "Shop",
    });
    const esResult = renderLocalizedTemplate("payment.failed", "es", {
      orderId: "ORD-1",
      amount: "2 XLM",
      merchant: "Shop",
    });

    expect(esResult.locale).toBe("es");
    expect(esResult.subject).not.toBe(enResult.subject);
  });

  it("falls back to 'en' locale for unsupported locale 'zz'", () => {
    const enResult = renderLocalizedTemplate("escrow.released", "en", {
      orderId: "ORD-42",
      amount: "1 XLM",
      merchant: "M",
    });
    const zzResult = renderLocalizedTemplate("escrow.released", "zz", {
      orderId: "ORD-42",
      amount: "1 XLM",
      merchant: "M",
    });

    expect(zzResult.locale).toBe("en");
    expect(zzResult.subject).toBe(enResult.subject);
    expect(zzResult.body).toBe(enResult.body);
  });

  it("handles event types with dots (converts to underscores for key lookup)", () => {
    const result = renderLocalizedTemplate("permission.expiry_updated", "en", {
      owner: "Alice",
      delegate: "AgentBot",
      newExpiry: "500000",
    });

    expect(result.subject).toBeTruthy();
    expect(result.body).toBeTruthy();
    // Should contain interpolated values
    expect(result.body).toContain("AgentBot");
  });

  it("returns a placeholder when translation keys are not found for the event type", () => {
    const result = renderLocalizedTemplate("unknown.event.type", "en", {});
    // Falls back to bracket-wrapped key names
    expect(result.subject).toContain("[");
    expect(result.body).toContain("[");
  });
});
