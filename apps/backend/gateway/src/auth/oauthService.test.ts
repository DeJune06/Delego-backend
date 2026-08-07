import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../models/User.js", () => ({
  User: {
    findOne: vi.fn(),
    findByPk: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../models/OAuthAccount.js", () => ({
  OAuthAccount: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("./authService.js", () => ({
  generateTokens: vi.fn(),
}));

import {
  validateProvider,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchProviderProfile,
  handleOAuthCallback,
  findExistingOAuthAccount,
  findUserByEmail,
  linkOAuthAccount,
  createOAuthUser,
  type OAuthProviderProfile,
} from "./oauthService.js";
import { User } from "../models/User.js";
import { OAuthAccount } from "../models/OAuthAccount.js";
import { generateTokens } from "./authService.js";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  displayName: "Test User",
  stellarAddress: null,
  passwordHash: null,
};

const mockOAuthAccount = {
  id: "oauth-123",
  userId: "user-123",
  provider: "google",
  providerUserId: "google-uid-123",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: "https://example.com/avatar.jpg",
  update: vi.fn(),
};

const mockTokens = {
  accessToken: "access-token-abc",
  refreshToken: "refresh-token-xyz",
  expiresIn: 900,
};

describe("validateProvider", () => {
  it("accepts google", () => {
    expect(validateProvider("google")).toBe("google");
  });

  it("accepts github", () => {
    expect(validateProvider("github")).toBe("github");
  });

  it("rejects unsupported provider", () => {
    expect(() => validateProvider("twitter")).toThrow("Unsupported OAuth provider: twitter");
  });
});

describe("buildAuthorizationUrl", () => {
  it("builds a valid Google authorization URL", () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    const url = buildAuthorizationUrl("google", "http://localhost:3000/callback", "state-123");
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback");
    expect(url).toContain("state=state-123");
    expect(url).toContain("scope=openid+email+profile");
  });

  it("builds a valid GitHub authorization URL", () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    const url = buildAuthorizationUrl("github", "http://localhost:3000/callback", "state-456");
    expect(url).toContain("github.com/login/oauth/authorize");
    expect(url).toContain("client_id=gh-client-id");
    expect(url).toContain("state=state-456");
  });
});

describe("exchangeCodeForToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exchanges code for access token", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_ID = "test-client-secret";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "token-abc" }),
    });

    const token = await exchangeCodeForToken("google", "auth-code-123", "http://localhost/callback");
    expect(token).toBe("token-abc");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("googleapis.com/token"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on failed token exchange", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("bad_request"),
    });

    await expect(
      exchangeCodeForToken("google", "bad-code", "http://localhost/callback"),
    ).rejects.toThrow("OAuth token exchange failed");
  });

  it("throws when no access_token in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "invalid_grant" }),
    });

    await expect(
      exchangeCodeForToken("google", "bad-code", "http://localhost/callback"),
    ).rejects.toThrow("no access_token returned");
  });
});

describe("fetchProviderProfile", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches Google profile", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sub: "google-uid-123",
          email: "user@gmail.com",
          name: "Google User",
          picture: "https://example.com/photo.jpg",
        }),
    });

    const profile = await fetchProviderProfile("google", "token-abc");
    expect(profile).toEqual({
      provider: "google",
      providerUserId: "google-uid-123",
      email: "user@gmail.com",
      displayName: "Google User",
      avatarUrl: "https://example.com/photo.jpg",
    });
  });

  it("fetches GitHub profile", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 456789,
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/456789",
          email: "octocat@github.com",
        }),
    });

    const profile = await fetchProviderProfile("github", "token-xyz");
    expect(profile).toEqual({
      provider: "github",
      providerUserId: "456789",
      email: "octocat@github.com",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/456789",
    });
  });

  it("falls back to login for GitHub users with no public email", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 789,
          login: "privateuser",
          name: null,
          avatar_url: null,
          email: null,
        }),
    });

    const profile = await fetchProviderProfile("github", "token-xyz");
    expect(profile.email).toBe("privateuser@github.local");
    expect(profile.displayName).toBe("privateuser");
  });

  it("throws on failed profile fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    });

    await expect(fetchProviderProfile("google", "bad-token")).rejects.toThrow(
      "OAuth profile fetch failed",
    );
  });
});

describe("findExistingOAuthAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds existing OAuth account by provider and userId", async () => {
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(mockOAuthAccount as any);

    const result = await findExistingOAuthAccount("google", "google-uid-123");
    expect(OAuthAccount.findOne).toHaveBeenCalledWith({
      where: { provider: "google", providerUserId: "google-uid-123" },
    });
    expect(result).toBe(mockOAuthAccount);
  });

  it("returns null when no account found", async () => {
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(null);

    const result = await findExistingOAuthAccount("google", "nonexistent");
    expect(result).toBeNull();
  });
});

describe("findUserByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds user by email", async () => {
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

    const result = await findUserByEmail("test@example.com");
    expect(User.findOne).toHaveBeenCalledWith({ where: { email: "test@example.com" } });
    expect(result).toBe(mockUser);
  });

  it("returns null when no user found", async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);

    const result = await findUserByEmail("nonexistent@example.com");
    expect(result).toBeNull();
  });
});

describe("linkOAuthAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new OAuth account link when none exists", async () => {
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(null);
    const createdAccount = { ...mockOAuthAccount, id: "new-oauth-id" };
    vi.mocked(OAuthAccount.create).mockResolvedValue(createdAccount as any);

    const profile: OAuthProviderProfile = {
      provider: "google",
      providerUserId: "google-uid-123",
      email: "test@example.com",
      displayName: "Test User",
      avatarUrl: "https://example.com/avatar.jpg",
    };

    const result = await linkOAuthAccount("user-123", profile);
    expect(OAuthAccount.create).toHaveBeenCalledWith({
      userId: "user-123",
      provider: "google",
      providerUserId: "google-uid-123",
      email: "test@example.com",
      displayName: "Test User",
      avatarUrl: "https://example.com/avatar.jpg",
    });
    expect(result).toBe(createdAccount);
  });

  it("updates existing OAuth account link", async () => {
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(mockOAuthAccount as any);

    const profile: OAuthProviderProfile = {
      provider: "google",
      providerUserId: "google-uid-456",
      email: "updated@example.com",
      displayName: "Updated User",
      avatarUrl: "https://example.com/new-avatar.jpg",
    };

    const result = await linkOAuthAccount("user-123", profile);
    expect(mockOAuthAccount.update).toHaveBeenCalledWith({
      providerUserId: "google-uid-456",
      email: "updated@example.com",
      displayName: "Updated User",
      avatarUrl: "https://example.com/new-avatar.jpg",
    });
    expect(result).toBe(mockOAuthAccount);
  });
});

describe("createOAuthUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates user and links OAuth account", async () => {
    vi.mocked(User.create).mockResolvedValue(mockUser as any);
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(null);
    vi.mocked(OAuthAccount.create).mockResolvedValue(mockOAuthAccount as any);

    const profile: OAuthProviderProfile = {
      provider: "google",
      providerUserId: "google-uid-123",
      email: "test@example.com",
      displayName: "Test User",
      avatarUrl: "https://example.com/avatar.jpg",
    };

    const result = await createOAuthUser(profile);
    expect(User.create).toHaveBeenCalledWith({
      email: "test@example.com",
      displayName: "Test User",
      passwordHash: null,
    });
    expect(result.isNewUser).toBe(true);
    expect(result.user).toBe(mockUser);
  });
});

describe("handleOAuthCallback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/callback";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates new user on first OAuth login", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: "google-uid-123",
            email: "new@example.com",
            name: "New User",
          }),
      });

    vi.mocked(OAuthAccount.findOne).mockResolvedValue(null);
    vi.mocked(User.findOne).mockResolvedValue(null);
    vi.mocked(User.create).mockResolvedValue({ ...mockUser, id: "new-user", email: "new@example.com" } as any);
    vi.mocked(OAuthAccount.create).mockResolvedValue(mockOAuthAccount as any);
    vi.mocked(generateTokens).mockResolvedValue(mockTokens);

    const result = await handleOAuthCallback("google", "auth-code-123", "http://localhost/callback");

    expect(result.isNewUser).toBe(true);
    expect(result.user.email).toBe("new@example.com");
    expect(result.accessToken).toBe("access-token-abc");
  });

  it("links OAuth to existing user with same email", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: "google-uid-456",
            email: "existing@example.com",
            name: "Existing User",
          }),
      });

    const existingUser = { ...mockUser, email: "existing@example.com" };
    vi.mocked(OAuthAccount.findOne).mockResolvedValue(null);
    vi.mocked(User.findOne).mockResolvedValue(existingUser as any);
    vi.mocked(OAuthAccount.create).mockResolvedValue(mockOAuthAccount as any);
    vi.mocked(generateTokens).mockResolvedValue(mockTokens);

    const result = await handleOAuthCallback("google", "auth-code-123", "http://localhost/callback");

    expect(result.isNewUser).toBe(false);
    expect(result.user.email).toBe("existing@example.com");
    expect(User.create).not.toHaveBeenCalled();
  });

  it("authenticates user via existing OAuth account link", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: "google-uid-123",
            email: "linked@example.com",
            name: "Linked User",
          }),
      });

    vi.mocked(OAuthAccount.findOne).mockResolvedValue(mockOAuthAccount as any);
    vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
    vi.mocked(generateTokens).mockResolvedValue(mockTokens);

    const result = await handleOAuthCallback("google", "auth-code-123", "http://localhost/callback");

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe("user-123");
    expect(User.create).not.toHaveBeenCalled();
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("throws on invalid provider", async () => {
    await expect(
      handleOAuthCallback("twitter", "code", "http://localhost/callback"),
    ).rejects.toThrow("Unsupported OAuth provider");
  });
});
