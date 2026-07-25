import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDbPreferences,
  upsertDbPreferences,
  isEmailEnabled,
  isPushEnabled,
  type DbNotificationPreferences,
  type PreferenceDb,
} from "./preferenceStore.js";

function makeDb(rows: unknown[]): PreferenceDb {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

describe("getDbPreferences", () => {
  it("returns defaults (emailEnabled: true, pushEnabled: true) for unknown user", async () => {
    const db = makeDb([]);
    const prefs = await getDbPreferences(db, "unknown-user");

    expect(prefs.userId).toBe("unknown-user");
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.updatedAt).toBeInstanceOf(Date);
  });

  it("returns stored values for known user", async () => {
    const storedRow = {
      user_id: "user-abc",
      email_enabled: false,
      push_enabled: true,
      updated_at: new Date("2026-01-15T10:00:00Z"),
    };
    const db = makeDb([storedRow]);
    const prefs = await getDbPreferences(db, "user-abc");

    expect(prefs.userId).toBe("user-abc");
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.updatedAt).toEqual(new Date("2026-01-15T10:00:00Z"));
  });

  it("queries the notification_preferences table with the correct user_id param", async () => {
    const db = makeDb([]);
    await getDbPreferences(db, "user-xyz");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("notification_preferences"),
      ["user-xyz"]
    );
  });
});

describe("upsertDbPreferences", () => {
  it("inserts and returns correct values", async () => {
    const returnedRow = {
      user_id: "user-new",
      email_enabled: true,
      push_enabled: false,
      updated_at: new Date("2026-07-25T12:00:00Z"),
    };
    const db = makeDb([returnedRow]);
    const prefs = await upsertDbPreferences(db, "user-new", true, false);

    expect(prefs.userId).toBe("user-new");
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.pushEnabled).toBe(false);
    expect(prefs.updatedAt).toEqual(new Date("2026-07-25T12:00:00Z"));
  });

  it("updates existing row via ON CONFLICT and returns updated values", async () => {
    const updatedRow = {
      user_id: "user-existing",
      email_enabled: false,
      push_enabled: false,
      updated_at: new Date("2026-07-25T13:00:00Z"),
    };
    const db = makeDb([updatedRow]);
    const prefs = await upsertDbPreferences(db, "user-existing", false, false);

    expect(prefs.userId).toBe("user-existing");
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.pushEnabled).toBe(false);
  });

  it("issues an INSERT ... ON CONFLICT ... RETURNING query", async () => {
    const db = makeDb([
      {
        user_id: "u",
        email_enabled: true,
        push_enabled: true,
        updated_at: new Date(),
      },
    ]);
    await upsertDbPreferences(db, "u", true, true);

    const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ON CONFLICT/i);
    expect(sql).toMatch(/RETURNING/i);
    expect(params).toEqual(["u", true, true]);
  });
});

describe("isEmailEnabled", () => {
  it("returns true when emailEnabled is true", () => {
    const prefs: DbNotificationPreferences = {
      userId: "u",
      emailEnabled: true,
      pushEnabled: false,
      updatedAt: new Date(),
    };
    expect(isEmailEnabled(prefs)).toBe(true);
  });

  it("returns false when emailEnabled is false", () => {
    const prefs: DbNotificationPreferences = {
      userId: "u",
      emailEnabled: false,
      pushEnabled: true,
      updatedAt: new Date(),
    };
    expect(isEmailEnabled(prefs)).toBe(false);
  });
});

describe("isPushEnabled", () => {
  it("returns true when pushEnabled is true", () => {
    const prefs: DbNotificationPreferences = {
      userId: "u",
      emailEnabled: false,
      pushEnabled: true,
      updatedAt: new Date(),
    };
    expect(isPushEnabled(prefs)).toBe(true);
  });

  it("returns false when pushEnabled is false", () => {
    const prefs: DbNotificationPreferences = {
      userId: "u",
      emailEnabled: true,
      pushEnabled: false,
      updatedAt: new Date(),
    };
    expect(isPushEnabled(prefs)).toBe(false);
  });
});
