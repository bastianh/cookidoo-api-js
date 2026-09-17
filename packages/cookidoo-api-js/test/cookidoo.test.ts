import { beforeEach, describe, expect, it } from "vitest";

import { Cookidoo } from "../src/cookidoo.js";
import { CookidooAuthException } from "../src/exceptions.js";

const LOCALIZATION = {
  countryCode: "xx",
  language: "de-TEST",
  url: "https://cookidoo.test/foundation/de-TEST",
};

/** A hand-rolled fetch stub that plays the CIAM + Cookidoo backends for tests. */
function createMockFetch(overrides: { password?: string; errorRedirect?: boolean } = {}) {
  let capturedState: string | null = null;
  const calls: string[] = [];

  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);

    if (url.hostname === "ciam.prod.cookidoo.vorwerk-digital.com") {
      if (url.pathname === "/.well-known/openid-configuration") {
        return jsonResponse({
          authorization_endpoint: "https://ciam.prod.cookidoo.vorwerk-digital.com/oauth2/authorize",
          token_endpoint: "https://ciam.prod.cookidoo.vorwerk-digital.com/oauth2/token",
        });
      }
      if (url.pathname === "/oauth2/authorize") {
        capturedState = url.searchParams.get("state");
        return htmlResponse(
          '<html><body><form><input type="hidden" name="requestId" value="req-123" /></form></body></html>',
        );
      }
      if (url.pathname === "/login-srv/login" && method === "POST") {
        const body = new URLSearchParams(init?.body as string);
        if (overrides.errorRedirect) {
          return redirectResponse(
            "https://eu.login.vorwerk.com/ciam/login?error=invalid_username_password&" +
              "error_description=Given%20username%20or%20password%20is%20invalid",
          );
        }
        if (overrides.password && body.get("password") !== overrides.password) {
          return { status: 401, headers: new Headers(), ok: false } as unknown as Response;
        }
        return redirectResponse(
          `com.vorwerk.cookidoo://code-grant?code=auth-code-1&state=${capturedState}`,
        );
      }
      if (url.pathname === "/oauth2/token" && method === "POST") {
        return jsonResponse({
          access_token: "access-token-1",
          refresh_token: "refresh-token-1",
          expires_in: 43200,
        });
      }
    }

    if (url.hostname === "cookidoo.test") {
      if (url.pathname === "/community/profile/.well-known/home") {
        return jsonResponse({
          _links: {
            "community-profile:user-private-profile": {
              href: "/community/profile/{lang}",
            },
          },
        });
      }
      if (url.pathname === "/community/profile/de-TEST") {
        return jsonResponse({
          id: "user-1",
          userInfo: { username: "chef", description: null, picture: null },
        });
      }
    }

    throw new Error(`Unhandled request in mock fetch: ${method} ${url.toString()}`);
  };

  return { fetchMock, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

describe("Cookidoo login + getUserInfo (vertical slice)", () => {
  let fetchMock: typeof fetch;

  beforeEach(() => {
    ({ fetchMock } = createMockFetch());
  });

  it("logs in via OAuth2/PKCE and exposes auth data", async () => {
    const updates: unknown[] = [];
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: fetchMock, onAuthDataUpdate: (data) => updates.push(data) },
    );

    expect(client.authData).toBeNull();
    await client.login();

    expect(client.authData).toEqual({
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      expiresAt: expect.any(Number),
    });
    expect(updates).toHaveLength(1);
  });

  it("rejects invalid credentials with CookidooAuthException", async () => {
    ({ fetchMock } = createMockFetch({ password: "correct-password" }));
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "wrong-password" },
      { fetch: fetchMock },
    );
    await expect(client.login()).rejects.toThrow(CookidooAuthException);
  });

  it("reports a clean auth error when CIAM bounces to its error page on a foreign host", async () => {
    // Observed live: invalid credentials redirect to eu.login.vorwerk.com
    // (not ciam.prod.cookidoo.vorwerk-digital.com), which must be reported
    // as invalid credentials rather than "redirected off the authentication
    // host" (the check guarding against an actually-untrusted redirect).
    ({ fetchMock } = createMockFetch({ errorRedirect: true }));
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "wrong-password" },
      { fetch: fetchMock },
    );
    await expect(client.login()).rejects.toThrow(
      /Given username or password is invalid/,
    );
  });

  it("fetches user info end-to-end after login (discovery + authenticated request)", async () => {
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: fetchMock },
    );
    await client.login();
    const info = await client.getUserInfo();
    expect(info).toEqual({ id: "user-1", username: "chef", description: null, picture: null });
  });

  it("restores a previous session via applyAuthData without a network call", () => {
    const client = new Cookidoo({ localization: LOCALIZATION }, { fetch: fetchMock });
    client.applyAuthData({
      accessToken: "restored-access",
      refreshToken: "restored-refresh",
      expiresAt: Date.now() / 1000 + 3600,
    });
    expect(client.authData?.accessToken).toBe("restored-access");
  });
});
