/** User identity in Delego — linked to a Stellar wallet address */

export interface User {
  id: string;
  stellarAddress: string;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  userId: string;
  /** Maximum amount (in stroops) an agent may spend without explicit approval */
  defaultSpendingLimit: bigint;
  /** Require approval for all purchases */
  requireApproval: boolean;
  notificationEmail: boolean;
  notificationPush: boolean;
}
