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

/** A single recipe hit from a Cookidoo search. */
export interface CookidooSearchRecipeHit {
  id: string;
  name: string;
  thumbnail: string | null;
  image: string | null;
  url: string;
}

/** A Cookidoo search result. */
export interface CookidooSearchResult {
  recipes: CookidooSearchRecipeHit[];
  total: number;
}

/** Options for {@link Cookidoo.searchRecipes | searchRecipes}, all optional. */
export interface CookidooSearchRecipesOptions {
  query?: string;
  /** Defaults to the first part of the configured language (e.g. "de-CH" -> "de"). */
  locale?: string;
  accessories?: string | string[];
  languages?: string | string[];
  categories?: string | string[];
  countries?: string | string[];
  ingredients?: string | string[];
  excludeIngredients?: string | string[];
  tags?: string | string[];
  ratings?: string | string[];
  difficulty?: string;
  /** In seconds. */
  preparationTime?: number;
  /** In seconds. */
  totalTime?: number;
  portions?: number;
  page?: number;
  pageSize?: number;
  tmv?: ThermomixMachineType | string | (ThermomixMachineType | string)[];
}

/** A category a recipe belongs to. */
export interface CookidooCategory {
  id: string;
  name: string;
  notes: string;
}

/** A collection a recipe is part of. */
export interface CookidooRecipeCollection {
  id: string;
  name: string;
  totalRecipes: number;
}

/** A single nutrition value (e.g. protein, fat, kcal). */
export interface CookidooNutrition {
  number: number;
  type: string;
  unittype: string;
}

/** A set of nutrition values for a given quantity/unit of the recipe. */
export interface CookidooRecipeNutrition {
  nutritions: CookidooNutrition[];
  quantity: number;
  unitNotation: string;
}

/** A named group of {@link CookidooRecipeNutrition}. */
export interface CookidooNutritionGroup {
  name: string;
  recipeNutritions: CookidooRecipeNutrition[];
}

/** A single cooking instruction step. `formattedText` is HTML markup, as sent by the API. */
export interface CookidooRecipeStep {
  /** May be empty. */
  title: string;
  formattedText: string;
}

/** A named group of {@link CookidooRecipeStep}. */
export interface CookidooRecipeStepGroup {
  /** May be empty. */
  title: string;
  recipeSteps: CookidooRecipeStep[];
}

/** The full details of a recipe. */
export interface CookidooShoppingRecipeDetails extends CookidooShoppingRecipe {
  difficulty: string;
  /** Hints and additional information about the recipe. */
  notes: string[];
  categories: CookidooCategory[];
  collections: CookidooRecipeCollection[];
  utensils: string[];
  servingSize: number;
  /** In seconds. */
  activeTime: number;
  /** In seconds. */
  totalTime: number;
  nutritionGroups: CookidooNutritionGroup[];
  stepGroups: CookidooRecipeStepGroup[];
}
