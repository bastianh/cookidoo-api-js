/** Cookidoo API client. */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import {
  CIAM_BASE_URL,
  CIAM_LOGIN_SRV_URL,
  DEFAULT_API_HEADERS,
  LOGIN_HEADERS,
  OAUTH_SCOPE,
  OIDC_DISCOVERY_URL,
  TOKEN_EXPIRY_MARGIN_S,
} from "./const.js";
import {
  CookidooAuthException,
  CookidooConfigException,
  CookidooParseException,
  CookidooRequestException,
} from "./exceptions.js";
import { cookidooUserInfoFromJson } from "./helpers.js";
import { CookieJar, jarRequest, type FetchLike } from "./http.js";
import type { CommunityProfileJSON } from "./raw-types.js";
import {
  defaultConfig,
  type CookidooAuthData,
  type CookidooConfig,
  type CookidooLocalizationConfig,
  type CookidooUserInfo,
} from "./types.js";
import { resolveEndpointPaths } from "./well-known.js";

export interface CookidooOptions {
  /** Called with the new {@link CookidooAuthData} whenever the tokens change. */
  onAuthDataUpdate?: (authData: CookidooAuthData) => void;
  /** Override the `fetch` implementation used for every request (mainly for tests). */
  fetch?: FetchLike;
}

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Unofficial Cookidoo API client. */
export class Cookidoo {
  private readonly cfg: CookidooConfig;
  private readonly fetchImpl: FetchLike;
  private readonly cookieJar = new CookieJar();
  private readonly apiHeaders: Record<string, string> = { ...DEFAULT_API_HEADERS };

  private loggedIn = false;
  private endpointOverrides: Record<string, string> = {};
  private endpointsResolved = false;
  private endpointsResolving: Promise<void> | null = null;
  private tokenRefreshing: Promise<void> | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  private oidc: Record<string, string> | null = null;
  private onAuthDataUpdateCallback: ((authData: CookidooAuthData) => void) | undefined;

  constructor(cfg: Partial<CookidooConfig> = {}, options: CookidooOptions = {}) {
    this.cfg = defaultConfig(cfg);
    this.fetchImpl = options.fetch ?? fetch;
    this.onAuthDataUpdateCallback = options.onAuthDataUpdate;
  }

  get localization(): CookidooLocalizationConfig {
    return this.cfg.localization;
  }

  /**
   * The Cookidoo domain derived from the localization URL, e.g.
   * `https://cookidoo.ch` or `https://cookidoo.co.uk`.
   */
  get apiEndpoint(): URL {
    return new URL(new URL(this.cfg.localization.url).origin);
  }

  /** The current OAuth2 tokens, for persistence. `null` until logged in. */
  get authData(): CookidooAuthData | null {
    if (!this.loggedIn || this.refreshToken === null) return null;
    return {
      accessToken: this.apiHeaders["Authorization"]!.replace(/^Bearer /, ""),
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
    };
  }

  get onAuthDataUpdate(): ((authData: CookidooAuthData) => void) | undefined {
    return this.onAuthDataUpdateCallback;
  }

  set onAuthDataUpdate(callback: ((authData: CookidooAuthData) => void) | undefined) {
    this.onAuthDataUpdateCallback = callback;
  }

  /**
   * Restore a previous login from persisted tokens (no network call). The
   * access token is refreshed automatically on the next request if expired.
   */
  applyAuthData(authData: CookidooAuthData): void {
    this.apiHeaders["Authorization"] = `Bearer ${authData.accessToken}`;
    this.refreshToken = authData.refreshToken;
    this.expiresAt = authData.expiresAt;
    this.loggedIn = true;
  }

  /**
   * Perform an OAuth2 authorization-code + PKCE login.
   *
   * Signs in with the configured email/password against the CIAM identity
   * provider, exchanges the resulting code for an access/refresh token, and
   * authenticates all subsequent API calls via a `Bearer` header:
   *
   * 1. discover the OIDC endpoints
   * 2. open the authorize endpoint to reach the CIAM login form
   * 3. POST the credentials to the CIAM login service
   * 4. capture the `code` from the redirect to the app scheme
   * 5. exchange the code for tokens (public client, PKCE, no secret)
   */
  async login(): Promise<void> {
    this.assertOauthClient();
    const oidc = await this.discovery();
    const { verifier, challenge } = Cookidoo.pkcePair();
    const state = randomBytes(9).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      market: this.cfg.localization.countryCode,
      scope: OAUTH_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ui_locales: this.cfg.localization.language,
    });

    // Step 2: reach the CIAM login form (follows redirects, sets cookies)
    const authorizeUrl = new URL(oidc["authorization_endpoint"]!);
    authorizeUrl.search = params.toString();
    const loginPage = await jarRequest(this.cookieJar, "GET", authorizeUrl, {
      headers: LOGIN_HEADERS,
      allowRedirects: true,
      fetchImpl: this.fetchImpl,
    });
    Cookidoo.checkLoginPageStatus(loginPage.status);
    const loginHtml = await loginPage.text();

    // Step 3: submit credentials, Step 4: capture the authorization code
    const requestId = Cookidoo.extractRequestId(loginHtml);
    const code = await this.submitCredentials(requestId, state);

    // Step 5: exchange the code for tokens, which marks us logged in
    await this.exchangeCode(oidc["token_endpoint"]!, code, verifier);
  }

  /** Refresh the access token using the stored refresh token. */
  async refresh(): Promise<void> {
    if (this.refreshToken === null) {
      throw new CookidooAuthException("Cannot refresh: no refresh token available.");
    }
    this.assertOauthClient();
    const oidc = await this.discovery();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: this.cfg.clientId,
    });
    const response = await this.fetchImpl(oidc["token_endpoint"]!, {
      method: "POST",
      headers: { ...LOGIN_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (response.status !== 200) {
      throw new CookidooAuthException(`Token refresh failed (status ${response.status}).`);
    }
    const payload = (await response.json()) as TokenPayload;
    this.applyTokens(payload);
  }

  /** Save the OAuth2 tokens to a file for later reuse. */
  saveToken(path: string): void {
    const authData = this.authData;
    if (authData === null) {
      throw new CookidooConfigException("Cannot save token: not logged in.");
    }
    writeFileSync(path, JSON.stringify(authData), "utf-8");
  }

  /** Restore the OAuth2 tokens from a file saved with {@link saveToken}. */
  loadToken(path: string): void {
    try {
      const data = JSON.parse(readFileSync(path, "utf-8")) as CookidooAuthData;
      this.applyAuthData(data);
    } catch (e) {
      throw new CookidooConfigException(`Cannot load token from ${path}.`, { cause: e });
    }
  }

  /** Get the currently signed-in user's info. */
  async getUserInfo(): Promise<CookidooUserInfo> {
    await this.ensureEndpoints();
    const url = new URL(
      this.path("community-profile:user-private-profile").replace(
        "{language}",
        this.cfg.localization.language,
      ),
      `${this.apiEndpoint.toString().replace(/\/$/, "")}/`,
    );
    const result = await this.requestJson("GET", url, "loading user info");
    if (typeof result !== "object" || result === null) {
      throw new CookidooParseException(
        "Loading user info failed during parsing of request response.",
      );
    }
    try {
      return cookidooUserInfoFromJson(result as CommunityProfileJSON);
    } catch (e) {
      throw new CookidooParseException(
        "Loading user info failed during parsing of request response.",
        { cause: e },
      );
    }
  }

  // -- internal request helpers -------------------------------------------

  private async requestJson(
    method: string,
    url: URL,
    operation: string,
    options: {
      params?: Record<string, string>;
      json?: unknown;
      headers?: Record<string, string>;
      acceptedStatuses?: readonly number[];
      parseResponse?: boolean;
    } = {},
  ): Promise<unknown> {
    await this.ensureToken();
    const acceptedStatuses = options.acceptedStatuses ?? [200, 204];
    const parseResponse = options.parseResponse ?? true;

    const target = new URL(url);
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) target.searchParams.set(k, v);
    }

    const headers: Record<string, string> = { ...this.apiHeaders, ...options.headers };
    const init: RequestInit = { method, headers };
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.json);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(target, init);
    } catch (e) {
      throw new CookidooRequestException(
        `${capitalize(operation)} failed due to request exception.`,
        { cause: e },
      );
    }

    if (response.status === 401) {
      throw new CookidooAuthException(
        `${capitalize(operation)} failed due to authorization failure, ` +
          "the authorization token is invalid or expired.",
      );
    }
    if (!acceptedStatuses.includes(response.status)) {
      throw new CookidooRequestException(
        `${capitalize(operation)} failed with status ${response.status}.`,
      );
    }
    if (response.status === 204 || !parseResponse) return null;

    try {
      return await response.json();
    } catch (e) {
      throw new CookidooParseException(
        `${capitalize(operation)} failed during parsing of request response.`,
        { cause: e },
      );
    }
  }

  private isEndpointsResolved(): boolean {
    return this.endpointsResolved;
  }

  private async ensureEndpoints(): Promise<void> {
    if (this.endpointsResolved) return;
    if (this.endpointsResolving) return this.endpointsResolving;
    this.endpointsResolving = (async () => {
      if (this.isEndpointsResolved()) return;
      try {
        this.endpointOverrides = await resolveEndpointPaths(this.apiEndpoint, this.fetchImpl);
      } catch {
        // Retried once: a transient network hiccup shouldn't need a whole
        // new request cycle to recover from.
        this.endpointOverrides = await resolveEndpointPaths(this.apiEndpoint, this.fetchImpl);
      }
      this.endpointsResolved = true;
    })();
    try {
      await this.endpointsResolving;
    } finally {
      this.endpointsResolving = null;
    }
  }

  private path(name: string): string {
    const template = this.endpointOverrides[name];
    if (template === undefined) {
      throw new CookidooParseException(`Unresolved endpoint: ${name}`);
    }
    return template;
  }

  // -- internal auth helpers -----------------------------------------------

  private async discovery(): Promise<Record<string, string>> {
    if (this.oidc === null) {
      const response = await this.fetchImpl(OIDC_DISCOVERY_URL, { headers: LOGIN_HEADERS });
      if (!response.ok) {
        throw new CookidooRequestException(
          `Could not fetch the OIDC discovery document (status ${response.status}).`,
        );
      }
      this.oidc = (await response.json()) as Record<string, string>;
    }
    return this.oidc;
  }

  /**
   * POST credentials and follow the redirect chain to capture the code.
   *
   * Throws {@link CookidooAuthException} when no authorization code is
   * returned (i.e. the credentials were rejected).
   */
  private async submitCredentials(requestId: string, state: string): Promise<string> {
    let url = CIAM_LOGIN_SRV_URL;
    let method = "POST";
    let body: URLSearchParams | undefined = new URLSearchParams({
      requestId,
      username: this.cfg.email,
      password: this.cfg.password,
    });
    let code: string | null = null;

    for (let i = 0; i < 10; i++) {
      const requestOptions: Parameters<typeof jarRequest>[3] = {
        headers:
          method === "POST"
            ? { ...LOGIN_HEADERS, "Content-Type": "application/x-www-form-urlencoded" }
            : LOGIN_HEADERS,
        allowRedirects: false,
        fetchImpl: this.fetchImpl,
      };
      if (body !== undefined) requestOptions.body = body;
      const response = await jarRequest(this.cookieJar, method, url, requestOptions);
      const location = response.headers.get("location");
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect && location) {
        if (location.startsWith(this.cfg.redirectUri)) {
          const rest = location.slice(this.cfg.redirectUri.length).replace(/^\?/, "");
          const query = new URLSearchParams(rest);
          if (query.get("state") !== state) {
            throw new CookidooAuthException("OAuth state mismatch.");
          }
          code = query.get("code");
          break;
        }
        const nextUrl = new URL(location, url);
        // Rejected credentials bounce to an *error* page -- observed on a
        // different host (eu.login.vorwerk.com) than CIAM_BASE_URL itself,
        // which would otherwise trip assertCiamOrigin below. Recognized by
        // its `error` query param, so it's reported as a clean auth failure
        // instead of "redirected off the authentication host", without
        // weakening that check for an actually-untrusted redirect.
        const error = nextUrl.searchParams.get("error");
        if (error !== null) {
          const description = nextUrl.searchParams.get("error_description");
          throw new CookidooAuthException(
            `Login failed: ${description ?? error}. Please check your email and password.`,
          );
        }
        url = nextUrl.toString();
        Cookidoo.assertCiamOrigin(url);
        method = "GET";
        body = undefined;
        continue;
      }
      break;
    }
    if (code === null) {
      throw new CookidooAuthException(
        "Login failed: invalid credentials (no authorization code returned). " +
          "Please check your email and password.",
      );
    }
    return code;
  }

  /**
   * Ensure the login flow never leaves CIAM's own origin.
   *
   * The redirect chain carries the session cookies of an in-flight login, so
   * a redirect to a foreign host is refused rather than followed.
   */
  private static assertCiamOrigin(url: string): void {
    const origin = new URL(url);
    const expected = new URL(CIAM_BASE_URL);
    if (origin.origin !== expected.origin) {
      throw new CookidooAuthException(`Login flow redirected off the authentication host: ${url}`);
    }
  }

  private static checkLoginPageStatus(status: number): void {
    if (status !== 200) {
      throw new CookidooAuthException(
        `Login flow failed: could not reach login page (status ${status}).`,
      );
    }
  }

  private async exchangeCode(
    tokenEndpoint: string,
    code: string,
    verifier: string,
  ): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.cfg.redirectUri,
      code_verifier: verifier,
      client_id: this.cfg.clientId,
    });
    const response = await this.fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: { ...LOGIN_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (response.status !== 200) {
      throw new CookidooAuthException(`Token exchange failed (status ${response.status}).`);
    }
    const payload = (await response.json()) as TokenPayload;
    this.applyTokens(payload);
  }

  private applyTokens(payload: TokenPayload): void {
    const accessToken = payload.access_token;
    if (typeof accessToken !== "string") {
      throw new CookidooAuthException(`Unexpected token response: ${JSON.stringify(payload)}`);
    }
    // A refresh response may omit a new refresh token; keep the old one.
    this.refreshToken = payload.refresh_token ?? this.refreshToken;
    const expiresIn = payload.expires_in ?? 43200;
    this.apiHeaders["Authorization"] = `Bearer ${accessToken}`;
    this.expiresAt = Date.now() / 1000 + expiresIn;
    // Holding tokens is what being logged in means, and `authData` has to be
    // readable by the time the callback below runs.
    this.loggedIn = true;
    this.notifyAuthDataUpdate();
  }

  private notifyAuthDataUpdate(): void {
    const authData = this.authData;
    if (this.onAuthDataUpdateCallback === undefined || authData === null) return;
    try {
      this.onAuthDataUpdateCallback(authData);
    } catch {
      // Consumer code failing to store the tokens must not break the
      // request that triggered the refresh.
    }
  }

  private isTokenExpiring(): boolean {
    return Date.now() / 1000 >= this.expiresAt - TOKEN_EXPIRY_MARGIN_S;
  }

  /**
   * Refresh the access token if it is missing or about to expire.
   *
   * Concurrent callers await a single in-flight refresh instead of each
   * spending the same refresh token (the server rotates it, so a second
   * concurrent refresh can be rejected outright).
   */
  private async ensureToken(): Promise<void> {
    if (!this.loggedIn || !this.isTokenExpiring()) return;
    if (this.tokenRefreshing) return this.tokenRefreshing;
    this.tokenRefreshing = this.isTokenExpiring() ? this.refresh() : Promise.resolve();
    try {
      await this.tokenRefreshing;
    } finally {
      this.tokenRefreshing = null;
    }
  }

  private static pkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  /**
   * Ensure the OAuth2 client identifiers are set.
   *
   * Both default to the mobile app's public identifiers, so this only trips
   * when a caller overrides one of them with an empty value.
   */
  private assertOauthClient(): void {
    const missing = (["clientId", "redirectUri"] as const).filter((name) => !this.cfg[name]);
    if (missing.length > 0) {
      throw new CookidooConfigException(
        `Missing OAuth2 client configuration: ${missing.join(", ")}. ` +
          "Leave these unset to use the defaults, see docs/oauth-client.md.",
      );
    }
  }

  /** Extract `requestId` from the CIAM login page HTML. */
  private static extractRequestId(loginHtml: string): string {
    const match =
      /<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/.exec(loginHtml) ??
      /<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/.exec(loginHtml);
    if (!match) {
      throw new CookidooParseException(
        "Login flow failed: could not extract requestId from login page.",
      );
    }
    return match[1]!;
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
