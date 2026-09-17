import { describe, expect, it } from "vitest";

import {
  cookidooAdditionalItemFromJson,
  cookidooIngredientFromJson,
  cookidooIngredientItemFromJson,
  cookidooQuantityFromJson,
  cookidooRecipeFromJson,
  cookidooUserInfoFromJson,
  getCountryOptions,
  getLanguageOptions,
  getLocalizationOptions,
} from "../src/helpers.js";

describe("cookidooUserInfoFromJson", () => {
  it("maps the raw community profile shape", () => {
    const info = cookidooUserInfoFromJson({
      id: "user-1",
      userInfo: { username: "chef", description: null, picture: "https://example.com/p.png" },
    });
    expect(info.id).toBe("user-1");
    expect(info.username).toBe("chef");
    expect(info.description).toBeNull();
    expect(info.picture).toBe("https://example.com/p.png");
  });

  it("defaults a missing description to null", () => {
    const info = cookidooUserInfoFromJson({
      id: "user-2",
      userInfo: { username: "chef2", picture: null },
    });
    expect(info.description).toBeNull();
  });

  it("carries the full raw response, including fields not otherwise parsed", () => {
    // The real endpoint returns more than id/username/description/picture
    // (isPublic, userInfo.pictureTemplate, savedSearches, foodPreferences,
    // meta, thermomixes, ...); none of that is modeled individually, but it
    // must still reach callers via `raw`.
    const rawProfile = {
      id: "user-3",
      isPublic: false,
      userInfo: {
        username: "chef3",
        description: "",
        picture: "",
        pictureTemplate: "https://example.com/{transformation}/p.png",
      },
      savedSearches: [{ id: "default", search: { countries: ["ch"] } }],
      foodPreferences: [],
      meta: { cloudinaryPublicId: "abc123" },
      thermomixes: [],
    };
    const info = cookidooUserInfoFromJson(rawProfile);
    expect(info.raw).toEqual(rawProfile);
  });
});

describe("cookidooQuantityFromJson", () => {
  it("returns the value as a string", () => {
    expect(cookidooQuantityFromJson({ value: 200, from: null, to: null })).toBe("200");
  });

  it("returns a range when value is unset but from/to are", () => {
    expect(cookidooQuantityFromJson({ value: null, from: 2, to: 3 })).toBe("2 - 3");
  });

  it("returns an empty string for a falsy value and no range", () => {
    expect(cookidooQuantityFromJson({ value: 0, from: null, to: null })).toBe("");
    expect(cookidooQuantityFromJson(null)).toBe("");
  });
});

describe("cookidooIngredientFromJson", () => {
  it("prefers localId over id when both are present (recipe ingredient groups)", () => {
    const ingredient = cookidooIngredientFromJson({
      id: "01JBQFM44769BTC1P25CNDWJK9",
      localId: "com.vorwerk.ingredients.Ingredient-rpf-9",
      ingredientNotation: "Zucker",
      quantity: { value: 200, from: null, to: null },
      unitNotation: "g",
    } as never);
    expect(ingredient.id).toBe("com.vorwerk.ingredients.Ingredient-rpf-9");
    expect(ingredient.name).toBe("Zucker");
    expect(ingredient.description).toBe("200 g");
  });

  it("falls back to id when there is no localId", () => {
    const ingredient = cookidooIngredientFromJson({
      id: "item-1",
      ingredientNotation: "Salt",
      quantity: null,
      unitNotation: null,
    });
    expect(ingredient.id).toBe("item-1");
    expect(ingredient.description).toBe("");
  });

  it("omits the unit when there is no quantity", () => {
    const ingredient = cookidooIngredientFromJson({
      id: "item-2",
      ingredientNotation: "Pepper",
      quantity: null,
      unitNotation: "g",
    });
    expect(ingredient.description).toBe("");
  });
});

describe("cookidooIngredientItemFromJson", () => {
  it("maps the raw shopping-list item shape", () => {
    const item = cookidooIngredientItemFromJson({
      id: "item-1",
      ingredientNotation: "Flour",
      isOwned: true,
      quantity: { value: 500, from: null, to: null },
      unitNotation: "g",
    });
    expect(item).toEqual({ id: "item-1", name: "Flour", isOwned: true, description: "500 g" });
  });
});

describe("cookidooAdditionalItemFromJson", () => {
  it("maps the raw additional item shape", () => {
    expect(cookidooAdditionalItemFromJson({ id: "a1", name: "Napkins", isOwned: false })).toEqual(
      { id: "a1", name: "Napkins", isOwned: false },
    );
  });
});

describe("cookidooRecipeFromJson", () => {
  const recipe = {
    id: "r1",
    title: "Mini-Pavlova",
    recipeIngredientGroups: [
      {
        id: "ing-1",
        ingredientNotation: "Zucker",
        isOwned: false,
        quantity: { value: 200, from: null, to: null },
        unitNotation: "g",
      },
    ],
    descriptiveAssets: [
      {
        something_else: "https://assets.test/{transformation}/other.jpg",
        square: "https://assets.test/{transformation}/square.jpg",
        portrait: null,
        landscape: null,
      },
    ],
  };

  it("maps id/name/ingredients and resolves the first usable image variant", () => {
    const shoppingRecipe = cookidooRecipeFromJson(recipe as never, {
      countryCode: "ch",
      language: "de-CH",
      url: "https://cookidoo.ch/foundation/de-CH",
    });
    expect(shoppingRecipe.id).toBe("r1");
    expect(shoppingRecipe.name).toBe("Mini-Pavlova");
    expect(shoppingRecipe.ingredients).toEqual([
      { id: "ing-1", name: "Zucker", description: "200 g" },
    ]);
    expect(shoppingRecipe.thumbnail).toBe("https://assets.test/t_web_shared_recipe_221x240/square.jpg");
    expect(shoppingRecipe.image).toBe("https://assets.test/t_web_rdp_recipe_584x480_1_5x/square.jpg");
    expect(shoppingRecipe.url).toBe("https://cookidoo.ch/recipes/recipe/de-CH/r1");
  });

  it("returns null images and an empty url without descriptiveAssets/localization", () => {
    const shoppingRecipe = cookidooRecipeFromJson({ ...recipe, descriptiveAssets: null } as never);
    expect(shoppingRecipe.thumbnail).toBeNull();
    expect(shoppingRecipe.image).toBeNull();
    expect(shoppingRecipe.url).toBe("");
  });
});

describe("localization options", () => {
  it("returns a non-empty list of localizations", () => {
    const options = getLocalizationOptions();
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveProperty("countryCode");
    expect(options[0]).toHaveProperty("language");
    expect(options[0]).toHaveProperty("url");
  });

  it("filters by country", () => {
    const options = getLocalizationOptions({ country: "ch" });
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(option.countryCode).toBe("ch");
  });

  it("derives distinct country and language option lists", () => {
    expect(getCountryOptions()).toContain("ch");
    expect(getLanguageOptions().length).toBeGreaterThan(0);
  });
});
