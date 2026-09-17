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
  /**
   * The full, unparsed `community-profile` response as returned by
   * Cookidoo. It carries fields not otherwise modeled above -- observed:
   * `isPublic`, `userInfo.pictureTemplate`, `savedSearches`,
   * `foodPreferences`, `meta.cloudinaryPublicId`, `thermomixes` -- and any
   * others Cookidoo returns. Intentionally untyped beyond that: this is an
   * escape hatch for fields the parsed properties above don't cover, not a
   * stable, versioned shape -- verify against a live response before
   * depending on anything in here.
   */
  raw: Record<string, unknown>;
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

/** An ingredient of a recipe (as opposed to a {@link CookidooIngredientItem} on the shopping list). */
export interface CookidooIngredient {
  id: string;
  name: string;
  /** The quantity and unit (e.g. "200 g"), or the ingredient name alone if neither is known. */
  description: string;
}

/** A shopping-list entry shared by ingredient and additional items. */
export interface CookidooItem {
  id: string;
  name: string;
  isOwned: boolean;
}

/** An ingredient on the shopping list, contributed by one or more recipes. */
export interface CookidooIngredientItem extends CookidooItem {
  description: string;
}

/** A free-form item added to the shopping list directly, not tied to a recipe. */
export type CookidooAdditionalItem = CookidooItem;

/** A recipe with (at least) one ingredient on the shopping list. */
export interface CookidooShoppingRecipe {
  id: string;
  name: string;
  ingredients: CookidooIngredient[];
  thumbnail: string | null;
  image: string | null;
  url: string;
}
