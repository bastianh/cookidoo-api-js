/** Cookidoo API types. */

import { OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } from "./const.js";

/** Thermomix machine types. */
export enum ThermomixMachineType {
  TM5 = "TM5",
  TM6 = "TM6",
  TM7 = "TM7",
  TM31 = "TM31",
}

/** A localization config. */
export interface CookidooLocalizationConfig {
  countryCode: string;
  language: string;
  url: string;
}

export function defaultLocalization(): CookidooLocalizationConfig {
  return {
    countryCode: "ch",
    language: "de-CH",
    url: "https://cookidoo.ch/foundation/de-CH",
  };
}

/**
 * Cookidoo config.
 *
 * The login runs as a public client (authorization code + PKCE, no client
 * secret), so `clientId`/`redirectUri` are public identifiers rather than
 * credentials and default to the ones of the Cookidoo mobile app. Callers do
 * not need to set them, see docs/oauth-client.md.
 */
export interface CookidooConfig {
  localization: CookidooLocalizationConfig;
  email: string;
  password: string;
  clientId: string;
  redirectUri: string;
}

export function defaultConfig(
  overrides: Partial<CookidooConfig> = {},
): CookidooConfig {
  return {
    localization: defaultLocalization(),
    email: "your@email",
    password: "1234password!",
    clientId: OAUTH_CLIENT_ID,
    redirectUri: OAUTH_REDIRECT_URI,
    ...overrides,
  };
}

/** A user info. */
export interface CookidooUserInfo {
  id: string;
  username: string;
  description: string | null;
  picture: string | null;
}

/**
 * OAuth2 tokens obtained from a login, for persistence and restore.
 *
 * `expiresAt` is a POSIX timestamp in seconds for the access token.
 */
export interface CookidooAuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
