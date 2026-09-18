/** Cookidoo API client. */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import {
  CIAM_BASE_URL,
  CIAM_LOGIN_SRV_URL,
  CUSTOM_COLLECTIONS_PATH_ACCEPT,
  CUSTOM_RECIPES_PATH_ACCEPT,
  DEFAULT_API_HEADERS,
  HAL_ACCEPT,
  LOGIN_HEADERS,
  MANAGED_COLLECTIONS_PATH_ACCEPT,
  MOBILE_HOME_PATH,
  OAUTH_SCOPE,
  OIDC_DISCOVERY_URL,
  PUSH_BUNDLE_ID,
  PUSH_PLATFORM,
  REL_RMI_CONFIG,
  RMI_API_VERSION,
  RMI_DEVICES,
  RMI_REGISTER_TOKEN,
  RMI_UNREGISTER,
  TOKEN_EXPIRY_MARGIN_S,
} from "./const.js";
import {
  CookidooAuthException,
  CookidooConfigException,
  CookidooParseException,
  CookidooRequestException,
} from "./exceptions.js";
import {
  cookidooAdditionalItemFromJson,
  cookidooCalendarDayFromJson,
  cookidooCollectionFromJson,
  cookidooCustomRecipeFromJson,
  cookidooDeviceFromJson,
  cookidooIngredientItemFromJson,
  cookidooRecipeDetailsFromJson,
  cookidooRecipeFromJson,
  cookidooSearchResultFromJson,
  cookidooUserInfoFromJson,
  normalizeListParam,
} from "./helpers.js";
import { CookieJar, jarRequest, type FetchLike } from "./http.js";
import type {
  AdditionalItemJSON,
  CalendarDayJSON,
  CommunityProfileJSON,
  CustomCollectionJSON,
  CustomRecipeJSON,
  CustomRecipesJSON,
  ItemJSON,
  ManagedCollectionJSON,
  PaginationJSON,
  RecipeDetailsJSON,
  RecipeJSON,
  SearchResultJSON,
} from "./raw-types.js";
import {
  defaultConfig,
  type CookidooAdditionalItem,
  type CookidooAuthData,
  type CookidooCalendarDay,
  type CookidooCollection,
  type CookidooCollectionsCount,
  type CookidooConfig,
  type CookidooCustomRecipe,
  type CookidooDevice,
  type CookidooIngredientItem,
  type CookidooLocalizationConfig,
  type CookidooSearchRecipesOptions,
  type CookidooSearchResult,
  type CookidooShoppingRecipe,
  type CookidooShoppingRecipeDetails,
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
  /** Cached `{rel: href}` map for the remote-monitoring (RMI) endpoints -- see {@link resolveRmiLinks}. */
  private rmiLinks: Record<string, string> | null = null;

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
    const url = this.endpointUrl("community-profile:user-private-profile");
    const result = await this.requestJson("GET", url, "loading user info");
    const data = Cookidoo.ensureMapping(result, "loading user info");
    return Cookidoo.parseResult("loading user info", () =>
      cookidooUserInfoFromJson(data as unknown as CommunityProfileJSON),
    );
  }

  /** Get the recipes with at least one ingredient on the shopping list. */
  async getShoppingListRecipes(): Promise<CookidooShoppingRecipe[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:home");
    const result = await this.requestJson("GET", url, "loading recipes");
    const data = Cookidoo.ensureMapping(result, "loading recipes");
    return Cookidoo.parseResult("loading recipes", () =>
      [
        ...(data.recipes as RecipeJSON[]),
        ...(data.customerRecipes as RecipeJSON[]),
      ].map((recipe) => cookidooRecipeFromJson(recipe, this.cfg.localization)),
    );
  }

  /** Get the ingredient items on the shopping list, across all recipes. */
  async getIngredientItems(): Promise<CookidooIngredientItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:home");
    const result = await this.requestJson("GET", url, "loading ingredient items");
    const data = Cookidoo.ensureMapping(result, "loading ingredient items");
    return Cookidoo.parseResult("loading ingredient items", () =>
      [...(data.recipes as RecipeJSON[]), ...(data.customerRecipes as RecipeJSON[])].flatMap(
        (recipe) => recipe.recipeIngredientGroups.map(cookidooIngredientItemFromJson),
      ),
    );
  }

  /** Add the ingredient items of the given recipes to the shopping list. */
  async addIngredientItemsForRecipes(recipeIds: string[]): Promise<CookidooIngredientItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:recipe-ingredients");
    const result = await this.requestJson("POST", url, "add ingredient items for recipes", {
      json: { recipeIDs: recipeIds },
    });
    const data = Cookidoo.ensureMapping(result, "add ingredient items for recipes");
    return Cookidoo.parseResult("loading added ingredient items", () =>
      (data.data as RecipeJSON[]).flatMap((recipe) =>
        recipe.recipeIngredientGroups.map(cookidooIngredientItemFromJson),
      ),
    );
  }

  /** Remove the ingredient items of the given recipes from the shopping list. */
  async removeIngredientItemsForRecipes(recipeIds: string[]): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:remove-recipe");
    await this.requestJson("POST", url, "remove ingredient items for recipes", {
      json: { recipeIDs: recipeIds },
      parseResponse: false,
    });
  }

  /** Change the `isOwned` value of the given ingredient items. */
  async editIngredientItemsOwnership(
    ingredientItems: CookidooIngredientItem[],
  ): Promise<CookidooIngredientItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:edit-ingredients-ownership");
    const result = await this.requestJson("POST", url, "edit ingredient items ownership", {
      json: {
        ingredients: ingredientItems.map((item) => ({
          id: item.id,
          isOwned: item.isOwned,
          ownedTimestamp: Math.floor(Date.now() / 1000),
        })),
      },
    });
    const data = Cookidoo.ensureMapping(result, "edit ingredient items ownership");
    return Cookidoo.parseResult("loading edited ingredient items", () =>
      (data.data as ItemJSON[]).map(cookidooIngredientItemFromJson),
    );
  }

  /** Add the ingredient items of the given custom recipes to the shopping list. */
  async addIngredientItemsForCustomRecipes(
    recipeIds: string[],
  ): Promise<CookidooIngredientItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:recipe-ingredients");
    const result = await this.requestJson(
      "POST",
      url,
      "add ingredient items for custom recipes",
      { json: { recipeIDs: recipeIds.map((id) => ({ id, source: "CUSTOMER" })) } },
    );
    const data = Cookidoo.ensureMapping(result, "add ingredient items for custom recipes");
    return Cookidoo.parseResult("loading added ingredient items", () =>
      (data.data as RecipeJSON[]).flatMap((recipe) =>
        recipe.recipeIngredientGroups.map(cookidooIngredientItemFromJson),
      ),
    );
  }

  /** Remove the ingredient items of the given custom recipes from the shopping list. */
  async removeIngredientItemsForCustomRecipes(recipeIds: string[]): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:remove-recipe");
    await this.requestJson("POST", url, "remove ingredient items for custom recipes", {
      json: { recipeIDs: recipeIds },
      parseResponse: false,
    });
  }

  /** Get the additional (not recipe-linked) items on the shopping list. */
  async getAdditionalItems(): Promise<CookidooAdditionalItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:home");
    const result = await this.requestJson("GET", url, "loading additional items");
    const data = Cookidoo.ensureMapping(result, "loading additional items");
    return Cookidoo.parseResult("loading additional items", () =>
      (data.additionalItems as AdditionalItemJSON[]).map(cookidooAdditionalItemFromJson),
    );
  }

  /**
   * Create additional items on the shopping list.
   *
   * Only the label can be set: the added items are always `isOwned: false`,
   * so chain an immediate {@link editAdditionalItemsOwnership} call if
   * that's not the desired state.
   */
  async addAdditionalItems(additionalItemNames: string[]): Promise<CookidooAdditionalItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:add-additional-items-v2");
    const result = await this.requestJson("POST", url, "add additional items", {
      json: { itemsValue: additionalItemNames },
    });
    const data = Cookidoo.ensureMapping(result, "add additional items");
    return Cookidoo.parseResult("loading added additional items", () =>
      (data.data as AdditionalItemJSON[]).map(cookidooAdditionalItemFromJson),
    );
  }

  /** Change the `name` of the given additional items. */
  async editAdditionalItems(
    additionalItems: CookidooAdditionalItem[],
  ): Promise<CookidooAdditionalItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:edit-additional-items");
    const result = await this.requestJson("POST", url, "edit additional items", {
      json: {
        additionalItems: additionalItems.map((item) => ({ id: item.id, name: item.name })),
      },
    });
    const data = Cookidoo.ensureMapping(result, "edit additional items");
    return Cookidoo.parseResult("loading edited additional items", () =>
      (data.data as AdditionalItemJSON[]).map(cookidooAdditionalItemFromJson),
    );
  }

  /** Change the `isOwned` value of the given additional items. */
  async editAdditionalItemsOwnership(
    additionalItems: CookidooAdditionalItem[],
  ): Promise<CookidooAdditionalItem[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:edit-additional-items-ownership");
    const result = await this.requestJson("POST", url, "edit additional items ownership", {
      json: {
        additionalItems: additionalItems.map((item) => ({
          id: item.id,
          isOwned: item.isOwned,
          ownedTimestamp: Math.floor(Date.now() / 1000),
        })),
      },
    });
    const data = Cookidoo.ensureMapping(result, "edit additional items ownership");
    return Cookidoo.parseResult("loading edited additional items", () =>
      (data.data as AdditionalItemJSON[]).map(cookidooAdditionalItemFromJson),
    );
  }

  /** Remove the given additional items from the shopping list. */
  async removeAdditionalItems(additionalItemIds: string[]): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:remove-additional-items");
    await this.requestJson("POST", url, "remove additional items", {
      json: { additionalItemIDs: additionalItemIds },
      parseResponse: false,
    });
  }

  /** Remove all additional items, ingredients and recipes from the shopping list. */
  async clearShoppingList(): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("pantry:home");
    await this.requestJson("DELETE", url, "clear shopping list", { parseResponse: false });
  }

  /** Get the full details (ingredients, steps, nutrition, ...) of a recipe. */
  async getRecipeDetails(id: string): Promise<CookidooShoppingRecipeDetails> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("recipe:details", { id });
    const result = await this.requestJson("GET", url, "loading recipe details");
    const data = Cookidoo.ensureMapping(result, "loading recipe details");
    return Cookidoo.parseResult("loading recipe details", () =>
      cookidooRecipeDetailsFromJson(data as unknown as RecipeDetailsJSON, this.cfg.localization),
    );
  }

  /**
   * Search recipes.
   *
   * `options.locale` defaults to the first part of the configured language
   * (e.g. "de-CH" -> "de"); everything else is an optional filter.
   */
  async searchRecipes(
    options: CookidooSearchRecipesOptions = {},
  ): Promise<CookidooSearchResult> {
    const locale = options.locale ?? this.cfg.localization.language.split("-")[0]!;
    await this.ensureEndpoints();
    const url = this.endpointUrl("search:home", { locale });

    const params: Record<string, string> = {};
    if (options.query !== undefined) params.query = options.query;
    const setListParam = (key: string, value: string | string[] | undefined): void => {
      const normalized = normalizeListParam(value);
      if (normalized) params[key] = normalized;
    };
    setListParam("accessories", options.accessories);
    setListParam("languages", options.languages);
    setListParam("categories", options.categories);
    setListParam("countries", options.countries);
    setListParam("ingredients", options.ingredients);
    setListParam("excludeIngredients", options.excludeIngredients);
    setListParam("tags", options.tags);
    setListParam("ratings", options.ratings);
    if (options.difficulty !== undefined) params.difficulty = options.difficulty;
    if (options.preparationTime !== undefined) {
      params.preparationTime = String(options.preparationTime);
    }
    if (options.totalTime !== undefined) params.totalTime = String(options.totalTime);
    if (options.portions !== undefined) params.portions = String(options.portions);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.pageSize !== undefined) params.pageSize = String(options.pageSize);
    if (options.tmv !== undefined) {
      const tmv = normalizeListParam(
        Array.isArray(options.tmv) ? options.tmv.map(String) : String(options.tmv),
      );
      if (tmv) params.tmv = tmv;
    }

    const result = await this.requestJson("GET", url, "search recipes", { params });
    if (result === null) return { recipes: [], total: 0 };
    const data = Cookidoo.ensureMapping(result, "search recipes");
    return Cookidoo.parseResult("search recipes", () =>
      cookidooSearchResultFromJson(data as unknown as SearchResultJSON, this.cfg.localization),
    );
  }

  /** Get a custom recipe created (or copied from an official recipe) by the signed-in user. */
  async getCustomRecipe(id: string): Promise<CookidooCustomRecipe> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("customer-recipes:recipe-details", { id });
    const result = await this.requestJson("GET", url, "loading custom recipe");
    const data = Cookidoo.ensureMapping(result, "loading custom recipe");
    return Cookidoo.parseResult("loading custom recipe", () =>
      cookidooCustomRecipeFromJson(data as unknown as CustomRecipeJSON, this.cfg.localization),
    );
  }

  /** List the signed-in user's custom recipes. */
  async listCustomRecipes(): Promise<CookidooCustomRecipe[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("customer-recipes:recipe-create");
    const result = await this.requestJson("GET", url, "listing custom recipes", {
      headers: { ACCEPT: CUSTOM_RECIPES_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "listing custom recipes");
    if (!Array.isArray(data.items)) {
      throw new CookidooParseException(
        "Listing custom recipes failed during parsing of request response.",
      );
    }
    return Cookidoo.parseResult("listing custom recipes", () =>
      (data as unknown as CustomRecipesJSON).items.map((recipe) =>
        cookidooCustomRecipeFromJson(recipe, this.cfg.localization),
      ),
    );
  }

  /**
   * Add a custom recipe copied from an official one.
   *
   * @param recipeId The official recipe to copy.
   * @param servingSize The serving size of the new custom recipe.
   */
  async addCustomRecipeFrom(
    recipeId: string,
    servingSize: number,
  ): Promise<CookidooCustomRecipe> {
    await this.ensureEndpoints();
    const recipeUrl = this.endpointUrl("recipe:details", { id: recipeId });
    const url = this.endpointUrl("customer-recipes:recipe-create");
    const result = await this.requestJson("POST", url, "add custom recipe", {
      json: { recipeUrl: recipeUrl.toString(), servingSize },
    });
    const data = Cookidoo.ensureMapping(result, "add custom recipe");
    return Cookidoo.parseResult("add custom recipe", () =>
      cookidooCustomRecipeFromJson(data as unknown as CustomRecipeJSON, this.cfg.localization),
    );
  }

  /** Remove a custom recipe. */
  async removeCustomRecipe(customRecipeId: string): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("customer-recipes:recipe-details", { id: customRecipeId });
    await this.requestJson("DELETE", url, "remove custom recipe", { parseResponse: false });
  }

  /**
   * Get the recipes planned in the calendar week containing `day`.
   *
   * @param day An ISO-8601 date (`YYYY-MM-DD`) in the week to fetch.
   */
  async getRecipesInCalendarWeek(day: string): Promise<CookidooCalendarDay[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("planning:api-my-week-from-date", { day });
    const result = await this.requestJson("GET", url, "loading recipes in calendar week");
    const data = Cookidoo.ensureMapping(result, "loading recipes in calendar week");
    return Cookidoo.parseResult("loading recipes in calendar week", () =>
      (data.myDays as CalendarDayJSON[]).map((calendarDay) =>
        cookidooCalendarDayFromJson(calendarDay, this.cfg.localization),
      ),
    );
  }

  /**
   * Add recipes to a calendar day.
   *
   * @param day An ISO-8601 date (`YYYY-MM-DD`).
   * @param recipeIds The recipe ids to add.
   */
  async addRecipesToCalendar(day: string, recipeIds: string[]): Promise<CookidooCalendarDay> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("planning:api-my-day");
    const result = await this.requestJson("PUT", url, "add recipes to calendar", {
      json: { recipeIds, dayKey: day },
    });
    const data = Cookidoo.ensureMapping(result, "add recipes to calendar");
    return Cookidoo.parseResult("loading added recipes", () =>
      cookidooCalendarDayFromJson(data.content as CalendarDayJSON, this.cfg.localization),
    );
  }

  /**
   * Remove a recipe from a calendar day.
   *
   * @param day An ISO-8601 date (`YYYY-MM-DD`).
   * @param recipeId The recipe id to remove.
   */
  async removeRecipeFromCalendar(day: string, recipeId: string): Promise<CookidooCalendarDay> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("planning:api-my-day-recipes", { day, recipe: recipeId });
    const result = await this.requestJson("DELETE", url, "remove recipe from calendar");
    const data = Cookidoo.ensureMapping(result, "remove recipe from calendar");
    // A day with no recipes left no longer exists as an entity; the API
    // returns a null content for it rather than an (empty) day document.
    if (data.content == null) return Cookidoo.emptyCalendarDay(day);
    return Cookidoo.parseResult("loading removed recipe", () =>
      cookidooCalendarDayFromJson(data.content as CalendarDayJSON, this.cfg.localization),
    );
  }

  /**
   * Add custom recipes to a calendar day.
   *
   * @param day An ISO-8601 date (`YYYY-MM-DD`).
   * @param recipeIds The custom recipe ids to add.
   */
  async addCustomRecipesToCalendar(
    day: string,
    recipeIds: string[],
  ): Promise<CookidooCalendarDay> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("planning:api-my-day");
    const result = await this.requestJson("PUT", url, "add custom recipes to calendar", {
      json: { recipeIds, dayKey: day, recipeSource: "CUSTOMER" },
    });
    const data = Cookidoo.ensureMapping(result, "add custom recipes to calendar");
    return Cookidoo.parseResult("loading added custom recipes", () =>
      cookidooCalendarDayFromJson(data.content as CalendarDayJSON, this.cfg.localization),
    );
  }

  /**
   * Remove a custom recipe from a calendar day.
   *
   * @param day An ISO-8601 date (`YYYY-MM-DD`).
   * @param recipeId The custom recipe id to remove.
   */
  async removeCustomRecipeFromCalendar(
    day: string,
    recipeId: string,
  ): Promise<CookidooCalendarDay> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("planning:api-my-day-recipes", { day, recipe: recipeId });
    const result = await this.requestJson("DELETE", url, "remove custom recipe from calendar", {
      params: { recipeSource: "CUSTOMER" },
    });
    const data = Cookidoo.ensureMapping(result, "remove custom recipe from calendar");
    if (data.content == null) return Cookidoo.emptyCalendarDay(day);
    return Cookidoo.parseResult("loading custom removed recipe", () =>
      cookidooCalendarDayFromJson(data.content as CalendarDayJSON, this.cfg.localization),
    );
  }

  /** Count the signed-in user's managed (Vorwerk-curated) collections. */
  async countManagedCollections(): Promise<CookidooCollectionsCount> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-managed-list");
    const result = await this.requestJson("GET", url, "loading managed collections", {
      headers: { ACCEPT: MANAGED_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "loading managed collections");
    return Cookidoo.parseResult("loading managed collections", () => {
      const page = data.page as PaginationJSON;
      return { totalElements: page.totalElements, totalPages: page.totalPages };
    });
  }

  /**
   * Get the signed-in user's managed (Vorwerk-curated) collections.
   *
   * @param page The page to fetch (0-based).
   */
  async getManagedCollections(page = 0): Promise<CookidooCollection[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-managed-list");
    const result = await this.requestJson("GET", url, "loading managed collections", {
      params: { page: String(page) },
      headers: { ACCEPT: MANAGED_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "loading managed collections");
    return Cookidoo.parseResult("loading managed collections", () =>
      (data.managedlists as ManagedCollectionJSON[]).map((item) => cookidooCollectionFromJson(item)),
    );
  }

  /** Add a managed collection to the signed-in user's collections. */
  async addManagedCollection(managedCollectionId: string): Promise<CookidooCollection> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-managed-list");
    const result = await this.requestJson("POST", url, "add managed collection", {
      json: { collectionId: managedCollectionId },
      headers: { ACCEPT: MANAGED_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "add managed collection");
    return Cookidoo.parseResult("loading added managed collection", () =>
      cookidooCollectionFromJson(data.content as ManagedCollectionJSON),
    );
  }

  /** Remove a managed collection from the signed-in user's collections. */
  async removeManagedCollection(managedCollectionId: string): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-managed-list-single", { id: managedCollectionId });
    await this.requestJson("DELETE", url, "remove managed collection", {
      headers: { ACCEPT: MANAGED_COLLECTIONS_PATH_ACCEPT },
      parseResponse: false,
    });
  }

  /** Count the signed-in user's custom (self-created) collections. */
  async countCustomCollections(): Promise<CookidooCollectionsCount> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list");
    const result = await this.requestJson("GET", url, "loading custom collections", {
      headers: { ACCEPT: CUSTOM_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "loading custom collections");
    return Cookidoo.parseResult("loading custom collections", () => {
      const page = data.page as PaginationJSON;
      return { totalElements: page.totalElements, totalPages: page.totalPages };
    });
  }

  /**
   * Get the signed-in user's custom (self-created) collections.
   *
   * @param page The page to fetch (0-based).
   */
  async getCustomCollections(page = 0): Promise<CookidooCollection[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list");
    const result = await this.requestJson("GET", url, "loading custom collections", {
      params: { page: String(page) },
      headers: { ACCEPT: CUSTOM_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "loading custom collections");
    return Cookidoo.parseResult("loading custom collections", () =>
      (data.customlists as CustomCollectionJSON[]).map((item) => cookidooCollectionFromJson(item)),
    );
  }

  /** Create a new, empty custom collection. */
  async addCustomCollection(name: string): Promise<CookidooCollection> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list");
    const result = await this.requestJson("POST", url, "add custom collection", {
      json: { title: name },
      headers: { ACCEPT: CUSTOM_COLLECTIONS_PATH_ACCEPT },
    });
    const data = Cookidoo.ensureMapping(result, "add custom collection");
    return Cookidoo.parseResult("loading added custom collection", () =>
      cookidooCollectionFromJson(data.content as CustomCollectionJSON),
    );
  }

  /** Remove a custom collection. */
  async removeCustomCollection(customCollectionId: string): Promise<void> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list-modify", { id: customCollectionId });
    await this.requestJson("DELETE", url, "remove custom collection", {
      headers: { ACCEPT: CUSTOM_COLLECTIONS_PATH_ACCEPT },
      parseResponse: false,
    });
  }

  /** Add recipes to a custom collection. */
  async addRecipesToCustomCollection(
    customCollectionId: string,
    recipeIds: string[],
  ): Promise<CookidooCollection> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list-modify", { id: customCollectionId });
    const result = await this.requestJson("PUT", url, "add recipes to custom collection", {
      json: { recipeIds },
    });
    const data = Cookidoo.ensureMapping(result, "add recipes to custom collection");
    return Cookidoo.parseResult("loading added recipes", () =>
      cookidooCollectionFromJson(data.content as CustomCollectionJSON),
    );
  }

  /** Remove a recipe from a custom collection. */
  async removeRecipeFromCustomCollection(
    customCollectionId: string,
    recipeId: string,
  ): Promise<CookidooCollection> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("organize:api-custom-list-recipe", {
      id: customCollectionId,
      recipe: recipeId,
    });
    const result = await this.requestJson("DELETE", url, "remove recipe from custom collection");
    const data = Cookidoo.ensureMapping(result, "remove recipe from custom collection");
    return Cookidoo.parseResult("loading removed recipe", () =>
      cookidooCollectionFromJson(data.content as CustomCollectionJSON),
    );
  }

  /**
   * Get the Thermomix appliances paired to the account.
   *
   * Returns an empty array when no appliance is paired.
   */
  async getDevices(): Promise<CookidooDevice[]> {
    await this.ensureEndpoints();
    const url = this.endpointUrl("customer-devices:thermomix-versions");
    const result = await this.requestJson("GET", url, "loading devices");
    // An account without a paired appliance gets a 204 No Content.
    if (result === null) return [];
    const models = Cookidoo.ensureSequence(result, "loading devices");
    return Cookidoo.parseResult("loading devices", () =>
      models.map((model) => cookidooDeviceFromJson(model as string)),
    );
  }

  /**
   * Get the appliance IDs currently available for remote monitoring.
   *
   * Distinct from {@link getDevices} (all paired appliances): an appliance
   * only appears here while it is online/reachable for monitoring, and the
   * identifier is the opaque remote-monitoring device id.
   */
  async getMonitoredDeviceIds(): Promise<string[]> {
    const links = await this.resolveRmiLinks();
    const href = links[RMI_DEVICES];
    if (href === undefined) throw new CookidooParseException("rmi:devices link missing.");
    // Strip the discovered href's RFC 6570 query template ({?nonce}); we don't use it.
    const url = new URL(href.split("{")[0]!);
    const devices = Cookidoo.ensureSequence(
      await this.requestJson("GET", url, "loading monitored devices"),
      "loading monitored devices",
    );
    return Cookidoo.parseResult("loading monitored devices", () =>
      devices.map((device) => (device as Record<string, unknown>).deviceId as string),
    );
  }

  /**
   * Register a push token to receive remote-monitoring cook-state updates.
   *
   * Appliance state is delivered as a Firebase Cloud Messaging data message
   * to the registered token; obtaining the token and receiving the messages
   * is the caller's responsibility. Decode received payloads with
   * {@link cookidooCookingActivityFromPush}.
   *
   * @param pushToken The FCM registration token to deliver updates to.
   * @param mobileAppId A stable per-installation identifier for this client.
   */
  async registerPushToken(pushToken: string, mobileAppId: string): Promise<void> {
    const links = await this.resolveRmiLinks();
    const href = links[RMI_REGISTER_TOKEN];
    if (href === undefined) {
      throw new CookidooParseException("rmi:register-token link missing.");
    }
    await this.requestJson("POST", new URL(href), "registering push token", {
      json: {
        token: pushToken,
        bundleId: PUSH_BUNDLE_ID,
        platform: PUSH_PLATFORM,
        mobileAppId,
      },
      headers: { "rmi-api-version": RMI_API_VERSION },
      parseResponse: false,
    });
  }

  /** Unregister a previously registered push token. */
  async unregisterPushToken(pushToken: string): Promise<void> {
    const links = await this.resolveRmiLinks();
    const href = links[RMI_UNREGISTER];
    if (href === undefined) throw new CookidooParseException("rmi:unregister link missing.");
    await this.requestJson("DELETE", new URL(href), "unregistering push token", {
      json: { tokens: [pushToken] },
      headers: { "rmi-api-version": RMI_API_VERSION },
      parseResponse: false,
    });
  }

  // -- internal request helpers -------------------------------------------

  /** Build the full URL for a discovered endpoint rel, substituting `{tokens}`. */
  private endpointUrl(rel: string, tokens: Record<string, string> = {}): URL {
    let template = this.path(rel);
    for (const [key, value] of Object.entries({
      language: this.cfg.localization.language,
      ...tokens,
    })) {
      template = template.replace(`{${key}}`, value);
    }
    return new URL(template, `${this.apiEndpoint.toString().replace(/\/$/, "")}/`);
  }

  /** Return a JSON-object response or raise the standard parse exception. */
  private static ensureMapping(result: unknown, operation: string): Record<string, unknown> {
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      throw new CookidooParseException(
        `${capitalize(operation)} failed during parsing of request response.`,
      );
    }
    return result as Record<string, unknown>;
  }

  /** Return a JSON-array response or raise the standard parse exception. */
  private static ensureSequence(result: unknown, operation: string): unknown[] {
    if (typeof result === "string" || !Array.isArray(result)) {
      throw new CookidooParseException(
        `${capitalize(operation)} failed during parsing of request response.`,
      );
    }
    return result;
  }

  /**
   * Resolve and cache the remote-monitoring endpoint links.
   *
   * Walks the mobile home document to the `rmi-config` sub-document and
   * returns its `{rel: href}` map (`rmi:register-token`, `rmi:devices`,
   * `rmi:unregister`, ...). Unlike every other endpoint, these live on a
   * dedicated IoT backend reached via a two-hop HAL walk rather than the
   * usual per-service `.well-known/home` discovery.
   */
  private async resolveRmiLinks(): Promise<Record<string, string>> {
    if (this.rmiLinks !== null) return this.rmiLinks;

    const halHeaders = { ACCEPT: HAL_ACCEPT };
    const homeUrl = new URL(
      MOBILE_HOME_PATH,
      `${this.apiEndpoint.toString().replace(/\/$/, "")}/`,
    );
    const home = Cookidoo.ensureMapping(
      await this.requestJson("GET", homeUrl, "resolving remote monitoring", {
        headers: halHeaders,
      }),
      "resolving remote monitoring",
    );
    const rmiConfigUrl = Cookidoo.halLink(home, REL_RMI_CONFIG);
    if (rmiConfigUrl === null) {
      throw new CookidooParseException(
        "Resolving remote monitoring failed: rmi-config link missing.",
      );
    }
    const rmiHome = Cookidoo.ensureMapping(
      await this.requestJson("GET", new URL(rmiConfigUrl), "resolving remote monitoring", {
        headers: halHeaders,
      }),
      "resolving remote monitoring",
    );
    const linksObj = rmiHome._links;
    if (typeof linksObj !== "object" || linksObj === null || Array.isArray(linksObj)) {
      throw new CookidooParseException(
        "Resolving remote monitoring failed during parsing of request response.",
      );
    }
    const links: Record<string, string> = {};
    for (const [rel, value] of Object.entries(linksObj as Record<string, unknown>)) {
      if (typeof value === "string") {
        links[rel] = value;
      } else if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Record<string, unknown>).href === "string"
      ) {
        links[rel] = (value as Record<string, unknown>).href as string;
      }
    }
    this.rmiLinks = links;
    return links;
  }

  /** Extract a HAL link href for `rel` from a document's `_links`. */
  private static halLink(doc: Record<string, unknown>, rel: string): string | null {
    const links = doc._links;
    if (typeof links !== "object" || links === null || Array.isArray(links)) return null;
    const value = (links as Record<string, unknown>)[rel];
    if (typeof value === "string") return value;
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).href === "string"
    ) {
      return (value as Record<string, unknown>).href as string;
    }
    return null;
  }

  /** Convert a validated JSON response into public types. */
  private static parseResult<T>(operation: string, parser: () => T): T {
    try {
      return parser();
    } catch (e) {
      throw new CookidooParseException(
        `${capitalize(operation)} failed during parsing of request response.`,
        { cause: e },
      );
    }
  }

  /**
   * Build an empty calendar day for a day with no recipes left.
   *
   * The API returns a null `content` when a recipe removal leaves a
   * calendar day with no recipes, since the (now empty) day no longer
   * exists as an entity to return.
   */
  private static emptyCalendarDay(day: string): CookidooCalendarDay {
    return { id: day, title: day, recipes: [], customerRecipeIds: [] };
  }

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
