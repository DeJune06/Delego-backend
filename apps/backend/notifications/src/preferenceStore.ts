// DB-backed notification preference persistence (#135)
// Complements the Redis-based preferences.ts for durable storage.

export interface DbNotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  updatedAt: Date;
}

export interface PreferenceDb {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

interface PreferenceRow {
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  updated_at: Date;
}

function rowToPreferences(row: PreferenceRow): DbNotificationPreferences {
  return {
    userId: row.user_id,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
    updatedAt: new Date(row.updated_at),
  };
}

function defaultPreferences(userId: string): DbNotificationPreferences {
  return {
    userId,
    emailEnabled: true,
    pushEnabled: true,
    updatedAt: new Date(),
  };
}

/**
 * Retrieves notification preferences for a user from the DB.
 * Returns defaults (email and push both enabled) if no row exists yet.
 */
export async function getDbPreferences(
  db: PreferenceDb,
  userId: string
): Promise<DbNotificationPreferences> {
  const result = await db.query(
    "SELECT user_id, email_enabled, push_enabled, updated_at FROM notification_preferences WHERE user_id = $1",
    [userId]
  );

  if (result.rows.length === 0) {
    return defaultPreferences(userId);
  }

  return rowToPreferences(result.rows[0] as PreferenceRow);
}

/**
 * Inserts or updates notification preferences for a user.
 * Uses ON CONFLICT (user_id) DO UPDATE to handle the upsert atomically.
 */
export async function upsertDbPreferences(
  db: PreferenceDb,
  userId: string,
  emailEnabled: boolean,
  pushEnabled: boolean
): Promise<DbNotificationPreferences> {
  const result = await db.query(
    `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE
       SET email_enabled = EXCLUDED.email_enabled,
           push_enabled  = EXCLUDED.push_enabled,
           updated_at    = CURRENT_TIMESTAMP
     RETURNING user_id, email_enabled, push_enabled, updated_at`,
    [userId, emailEnabled, pushEnabled]
  );

  return rowToPreferences(result.rows[0] as PreferenceRow);
}

/** Returns true if email notifications are enabled for these preferences. */
export function isEmailEnabled(prefs: DbNotificationPreferences): boolean {
  return prefs.emailEnabled;
}

/** Returns true if push notifications are enabled for these preferences. */
export function isPushEnabled(prefs: DbNotificationPreferences): boolean {
  return prefs.pushEnabled;
}
