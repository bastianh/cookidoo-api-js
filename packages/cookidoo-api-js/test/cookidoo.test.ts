import { beforeEach, describe, expect, it } from "vitest";

import { Cookidoo } from "../src/cookidoo.js";
import { CookidooAuthException } from "../src/exceptions.js";

const LOCALIZATION = {
  countryCode: "xx",
  language: "de-TEST",
  url: "https://cookidoo.test/foundation/de-TEST",
};

const RAW_RECIPE = {
  id: "r1",
  title: "Mini-Pavlova",
  descriptiveAssets: null,
  recipeIngredientGroups: [
    {
      id: "ing-1",
      localId: "local-ing-1",
      ingredientNotation: "Zucker",
      isOwned: false,
      quantity: { value: 200, from: null, to: null },
      unitNotation: "g",
    },
  ],
};

const RAW_ADDITIONAL_ITEM = { id: "a1", name: "Napkins", isOwned: false };

const RAW_RECIPE_DETAILS = {
  id: "r907015",
  title: "Kokos Pralinen",
  difficulty: "easy",
  times: [
    { type: "activeTime", comment: "", quantity: { value: 2700, from: null, to: null } },
    { type: "totalTime", comment: "", quantity: { value: 32400, from: null, to: null } },
  ],
  additionalInformation: [{ content: "Kühl aufbewahren." }],
  categories: [{ id: "cat-1", title: "Desserts", subtitle: "" }],
  inCollections: [{ id: "col-1", title: "Weihnachten", recipesCount: { value: 6 } }],
  recipeIngredientGroups: [
    {
      recipeIngredients: [
        {
          localId: "ing-1",
          ingredientNotation: "Kokosraspeln",
          quantity: { value: 200, from: null, to: null },
          unitNotation: "g",
        },
      ],
    },
  ],
  recipeUtensils: [{ utensilNotation: "Kühlschrank" }],
  servingSize: { quantity: { value: 50, from: null, to: null }, unitNotation: "Stück" },
  nutritionGroups: [],
  recipeStepGroups: [],
  descriptiveAssets: null,
};

const RAW_CUSTOM_RECIPE = {
  recipeId: "cr1",
  recipeContent: {
    name: "Vongole alla marinara",
    totalTime: "PT30M",
    prepTime: "PT10M",
    tool: ["TM6"],
    recipeYield: { value: 6, unitText: "portion" },
    recipeIngredient: ["130 g di cipolla"],
    recipeInstructions: ["Mettere nel boccale le cipolle."],
  },
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
          isPublic: false,
          userInfo: { username: "chef", description: null, picture: null },
          savedSearches: [{ id: "default", search: { countries: ["ch"] } }],
          meta: { cloudinaryPublicId: "abc123" },
        });
      }

      if (url.pathname === "/shopping/.well-known/home") {
        return jsonResponse({
          _links: {
            "pantry:home": { href: "/shopping/{lang}" },
            "pantry:edit-ingredients-ownership": {
              href: "/shopping/{lang}/owned-ingredients/ownership/edit",
            },
            "pantry:recipe-ingredients": { href: "/shopping/{lang}/recipes/add" },
            "pantry:remove-recipe": { href: "/shopping/{lang}/recipes/remove" },
            "pantry:add-additional-items-v2": {
              href: "/shopping/{lang}/additional-items/add",
            },
            "pantry:edit-additional-items": {
              href: "/shopping/{lang}/additional-items/edit",
            },
            "pantry:edit-additional-items-ownership": {
              href: "/shopping/{lang}/additional-items/ownership/edit",
            },
            "pantry:remove-additional-items": {
              href: "/shopping/{lang}/additional-items/remove",
            },
          },
        });
      }
      if (url.pathname === "/shopping/de-TEST") {
        if (method === "GET") {
          return jsonResponse({
            recipes: [RAW_RECIPE],
            customerRecipes: [],
            additionalItems: [RAW_ADDITIONAL_ITEM],
          });
        }
        if (method === "DELETE") {
          return new Response(null, { status: 204 });
        }
      }
      if (url.pathname === "/shopping/de-TEST/recipes/add" && method === "POST") {
        return jsonResponse({ data: [RAW_RECIPE] });
      }
      if (url.pathname === "/shopping/de-TEST/recipes/remove" && method === "POST") {
        return new Response(null, { status: 204 });
      }
      if (
        url.pathname === "/shopping/de-TEST/owned-ingredients/ownership/edit" &&
        method === "POST"
      ) {
        return jsonResponse({ data: [RAW_RECIPE.recipeIngredientGroups[0]] });
      }
      if (url.pathname === "/shopping/de-TEST/additional-items/add" && method === "POST") {
        return jsonResponse({ data: [RAW_ADDITIONAL_ITEM] });
      }
      if (url.pathname === "/shopping/de-TEST/additional-items/edit" && method === "POST") {
        return jsonResponse({ data: [RAW_ADDITIONAL_ITEM] });
      }
      if (
        url.pathname === "/shopping/de-TEST/additional-items/ownership/edit" &&
        method === "POST"
      ) {
        return jsonResponse({ data: [RAW_ADDITIONAL_ITEM] });
      }
      if (url.pathname === "/shopping/de-TEST/additional-items/remove" && method === "POST") {
        return new Response(null, { status: 204 });
      }

      if (url.pathname === "/recipes/recipe/.well-known/home") {
        return jsonResponse({
          _links: { "recipe:details": { href: "/recipes/recipe/{lang}/{id}" } },
        });
      }
      if (url.pathname === "/recipes/recipe/de-TEST/r907015") {
        return jsonResponse(RAW_RECIPE_DETAILS);
      }

      if (url.pathname === "/search/.well-known/home") {
        return jsonResponse({ _links: { "search:home": { href: "/search/{lang}" } } });
      }
      if (url.pathname === "/search/de") {
        return jsonResponse({
          recipes: [{ id: "r1", title: "Mini-Pavlova", descriptiveAssets: null }],
          total: 1,
        });
      }

      if (url.pathname === "/created-recipes/.well-known/home") {
        return jsonResponse({
          _links: {
            "customer-recipes:recipe-create": { href: "/created-recipes/{lang}" },
            "customer-recipes:recipe-details": { href: "/created-recipes/{lang}/{id}" },
          },
        });
      }
      if (url.pathname === "/created-recipes/de-TEST") {
        if (method === "GET") return jsonResponse({ items: [RAW_CUSTOM_RECIPE] });
        if (method === "POST") return jsonResponse(RAW_CUSTOM_RECIPE);
      }
      if (url.pathname === "/created-recipes/de-TEST/cr1") {
        if (method === "GET") return jsonResponse(RAW_CUSTOM_RECIPE);
        if (method === "DELETE") return new Response(null, { status: 204 });
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
    expect(info.id).toBe("user-1");
    expect(info.username).toBe("chef");
    expect(info.description).toBeNull();
    expect(info.picture).toBeNull();
    // Fields the parsed properties above don't cover still reach the caller.
    expect(info.raw.isPublic).toBe(false);
    expect(info.raw.savedSearches).toEqual([
      { id: "default", search: { countries: ["ch"] } },
    ]);
    expect(info.raw.meta).toEqual({ cloudinaryPublicId: "abc123" });
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

describe("Cookidoo shopping list", () => {
  async function loggedInClient() {
    const { fetchMock } = createMockFetch();
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: fetchMock },
    );
    await client.login();
    return client;
  }

  it("gets the shopping list recipes and ingredient items", async () => {
    const client = await loggedInClient();

    const recipes = await client.getShoppingListRecipes();
    expect(recipes).toEqual([
      {
        id: "r1",
        name: "Mini-Pavlova",
        ingredients: [{ id: "local-ing-1", name: "Zucker", description: "200 g" }],
        thumbnail: null,
        image: null,
        url: "https://cookidoo.test/recipes/recipe/de-TEST/r1",
      },
    ]);

    const items = await client.getIngredientItems();
    expect(items).toEqual([
      { id: "ing-1", name: "Zucker", isOwned: false, description: "200 g" },
    ]);
  });

  it("adds and removes ingredient items for recipes", async () => {
    const client = await loggedInClient();
    const added = await client.addIngredientItemsForRecipes(["r1"]);
    expect(added).toEqual([{ id: "ing-1", name: "Zucker", isOwned: false, description: "200 g" }]);
    await expect(client.removeIngredientItemsForRecipes(["r1"])).resolves.toBeUndefined();
  });

  it("adds ingredient items for custom recipes with the CUSTOMER source marker", async () => {
    const { fetchMock } = createMockFetch();
    let capturedBody: unknown;
    const spyFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/shopping/de-TEST/recipes/add" && init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return fetchMock(input, init);
    };
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: spyFetch },
    );
    await client.login();

    await client.addIngredientItemsForCustomRecipes(["cr1"]);
    expect(capturedBody).toEqual({ recipeIDs: [{ id: "cr1", source: "CUSTOMER" }] });
  });

  it("removes ingredient items for custom recipes", async () => {
    const client = await loggedInClient();
    await expect(
      client.removeIngredientItemsForCustomRecipes(["cr1"]),
    ).resolves.toBeUndefined();
  });

  it("edits ingredient items ownership", async () => {
    const client = await loggedInClient();
    const edited = await client.editIngredientItemsOwnership([
      { id: "ing-1", name: "Zucker", isOwned: true, description: "200 g" },
    ]);
    expect(edited).toEqual([{ id: "ing-1", name: "Zucker", isOwned: false, description: "200 g" }]);
  });

  it("gets, adds, edits and removes additional items", async () => {
    const client = await loggedInClient();

    const items = await client.getAdditionalItems();
    expect(items).toEqual([{ id: "a1", name: "Napkins", isOwned: false }]);

    const added = await client.addAdditionalItems(["Napkins"]);
    expect(added).toEqual([{ id: "a1", name: "Napkins", isOwned: false }]);

    const edited = await client.editAdditionalItems([{ id: "a1", name: "Napkins", isOwned: false }]);
    expect(edited).toEqual([{ id: "a1", name: "Napkins", isOwned: false }]);

    const editedOwnership = await client.editAdditionalItemsOwnership([
      { id: "a1", name: "Napkins", isOwned: true },
    ]);
    expect(editedOwnership).toEqual([{ id: "a1", name: "Napkins", isOwned: false }]);

    await expect(client.removeAdditionalItems(["a1"])).resolves.toBeUndefined();
  });

  it("clears the shopping list", async () => {
    const client = await loggedInClient();
    await expect(client.clearShoppingList()).resolves.toBeUndefined();
  });
});

describe("Cookidoo recipes", () => {
  async function loggedInClient() {
    const { fetchMock } = createMockFetch();
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: fetchMock },
    );
    await client.login();
    return client;
  }

  it("gets recipe details end-to-end (discovery + authenticated request + parsing)", async () => {
    const client = await loggedInClient();
    const details = await client.getRecipeDetails("r907015");
    expect(details.id).toBe("r907015");
    expect(details.name).toBe("Kokos Pralinen");
    expect(details.difficulty).toBe("easy");
    expect(details.activeTime).toBe(2700);
    expect(details.totalTime).toBe(32400);
    expect(details.ingredients).toEqual([
      { id: "ing-1", name: "Kokosraspeln", description: "200 g" },
    ]);
    expect(details.servingSize).toBe(50);
    expect(details.url).toBe("https://cookidoo.test/recipes/recipe/de-TEST/r907015");
  });

  it("searches recipes, defaulting locale to the first part of the configured language", async () => {
    const client = await loggedInClient();
    const result = await client.searchRecipes({ query: "pavlova" });
    expect(result.total).toBe(1);
    expect(result.recipes).toEqual([
      {
        id: "r1",
        name: "Mini-Pavlova",
        thumbnail: null,
        image: null,
        url: "https://cookidoo.test/recipes/recipe/de-TEST/r1",
      },
    ]);
  });

  it("sends list/number filters as normalized query params", async () => {
    const { fetchMock } = createMockFetch();
    let capturedUrl: URL | null = null;
    const spyFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/search/de") capturedUrl = url;
      return fetchMock(input, init);
    };
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: spyFetch },
    );
    await client.login();

    await client.searchRecipes({
      accessories: ["includingFriend", "includingSensor"],
      tmv: ["TM6", "TM7"],
      preparationTime: 600,
      page: 2,
    });

    expect(capturedUrl).not.toBeNull();
    const params = (capturedUrl as unknown as URL).searchParams;
    expect(params.get("accessories")).toBe("includingFriend,includingSensor");
    expect(params.get("tmv")).toBe("TM6,TM7");
    expect(params.get("preparationTime")).toBe("600");
    expect(params.get("page")).toBe("2");
  });
});

describe("Cookidoo custom recipes", () => {
  async function loggedInClient() {
    const { fetchMock } = createMockFetch();
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: fetchMock },
    );
    await client.login();
    return client;
  }

  it("gets and lists custom recipes end-to-end", async () => {
    const client = await loggedInClient();

    const recipe = await client.getCustomRecipe("cr1");
    expect(recipe).toEqual({
      id: "cr1",
      name: "Vongole alla marinara",
      ingredients: ["130 g di cipolla"],
      instructions: ["Mettere nel boccale le cipolle."],
      tools: ["TM6"],
      servingSize: 6,
      activeTime: 600,
      totalTime: 1800,
      thumbnail: null,
      image: null,
      url: "https://cookidoo.test/created-recipes/de-TEST/cr1",
    });

    const recipes = await client.listCustomRecipes();
    expect(recipes).toEqual([recipe]);
  });

  it("adds a custom recipe copied from an official one", async () => {
    const client = await loggedInClient();
    const recipe = await client.addCustomRecipeFrom("r907015", 4);
    expect(recipe.id).toBe("cr1");
    expect(recipe.name).toBe("Vongole alla marinara");
  });

  it("sends recipeUrl pointing at the official recipe's own resolved URL", async () => {
    const { fetchMock } = createMockFetch();
    let capturedBody: unknown;
    const spyFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/created-recipes/de-TEST" && init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return fetchMock(input, init);
    };
    const client = new Cookidoo(
      { localization: LOCALIZATION, email: "a@b.com", password: "secret" },
      { fetch: spyFetch },
    );
    await client.login();

    await client.addCustomRecipeFrom("r907015", 4);
    expect(capturedBody).toEqual({
      recipeUrl: "https://cookidoo.test/recipes/recipe/de-TEST/r907015",
      servingSize: 4,
    });
  });

  it("removes a custom recipe", async () => {
    const client = await loggedInClient();
    await expect(client.removeCustomRecipe("cr1")).resolves.toBeUndefined();
  });
});
