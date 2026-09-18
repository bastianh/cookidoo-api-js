import { describe, expect, it } from "vitest";

import {
  cookidooAdditionalItemFromJson,
  cookidooCustomRecipeFromJson,
  cookidooIngredientFromJson,
  cookidooIngredientItemFromJson,
  cookidooQuantityFromJson,
  cookidooRecipeDetailsFromJson,
  cookidooRecipeFromJson,
  cookidooSearchResultFromJson,
  cookidooUserInfoFromJson,
  getCountryOptions,
  getLanguageOptions,
  getLocalizationOptions,
  normalizeListParam,
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

describe("normalizeListParam", () => {
  it("passes a plain string through unchanged", () => {
    expect(normalizeListParam("chicken")).toBe("chicken");
  });

  it("joins a list into a comma-separated string, dropping falsy entries", () => {
    expect(normalizeListParam(["a", "", "b"])).toBe("a,b");
  });

  it("returns undefined for undefined", () => {
    expect(normalizeListParam(undefined)).toBeUndefined();
  });
});

describe("cookidooSearchResultFromJson", () => {
  it("reads recipes from `recipes`, defaulting total to the hit count", () => {
    const result = cookidooSearchResultFromJson(
      {
        recipes: [
          { id: "r123456", title: "Chicken Soup", descriptiveAssets: null },
          { id: "r654321", name: "Chicken Salad", descriptiveAssets: null },
        ],
      },
      { countryCode: "ch", language: "de-CH", url: "https://cookidoo.ch/foundation/de-CH" },
    );
    expect(result.total).toBe(2);
    expect(result.recipes).toEqual([
      {
        id: "r123456",
        name: "Chicken Soup",
        thumbnail: null,
        image: null,
        url: "https://cookidoo.ch/recipes/recipe/de-CH/r123456",
      },
      {
        id: "r654321",
        name: "Chicken Salad",
        thumbnail: null,
        image: null,
        url: "https://cookidoo.ch/recipes/recipe/de-CH/r654321",
      },
    ]);
  });

  it("prefers `data` over `recipes` and uses an explicit total when present", () => {
    const result = cookidooSearchResultFromJson({
      data: [{ id: "r1", title: "A" }],
      recipes: [{ id: "r2", title: "B" }],
      total: 42,
    });
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]?.id).toBe("r1");
    expect(result.total).toBe(42);
  });

  it("returns an empty result when neither `data` nor `recipes` is present", () => {
    expect(cookidooSearchResultFromJson({})).toEqual({ recipes: [], total: 0 });
  });
});

describe("cookidooRecipeDetailsFromJson", () => {
  const rawRecipeDetails = {
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
    nutritionGroups: [
      {
        name: "",
        recipeNutritions: [
          {
            quantity: 1,
            unitNotation: "Stück",
            nutritions: [{ type: "kcal", number: 65.7, unittype: "kcal" }],
          },
        ],
      },
    ],
    recipeStepGroups: [
      {
        title: "",
        recipeSteps: [{ title: "1", formattedText: "<NOBR>Mix.</NOBR>" }],
      },
    ],
    descriptiveAssets: null,
  };

  it("maps id/name/difficulty/times/ingredients/categories/collections/utensils", () => {
    const details = cookidooRecipeDetailsFromJson(rawRecipeDetails as never, {
      countryCode: "ch",
      language: "de-CH",
      url: "https://cookidoo.ch/foundation/de-CH",
    });
    expect(details.id).toBe("r907015");
    expect(details.name).toBe("Kokos Pralinen");
    expect(details.difficulty).toBe("easy");
    expect(details.activeTime).toBe(2700);
    expect(details.totalTime).toBe(32400);
    expect(details.notes).toEqual(["Kühl aufbewahren."]);
    expect(details.categories).toEqual([{ id: "cat-1", name: "Desserts", notes: "" }]);
    expect(details.collections).toEqual([{ id: "col-1", name: "Weihnachten", totalRecipes: 6 }]);
    expect(details.ingredients).toEqual([
      { id: "ing-1", name: "Kokosraspeln", description: "200 g" },
    ]);
    expect(details.utensils).toEqual(["Kühlschrank"]);
    expect(details.servingSize).toBe(50);
    expect(details.nutritionGroups).toEqual([
      {
        name: "",
        recipeNutritions: [
          {
            quantity: 1,
            unitNotation: "Stück",
            nutritions: [{ type: "kcal", number: 65.7, unittype: "kcal" }],
          },
        ],
      },
    ]);
    expect(details.stepGroups).toEqual([
      { title: "", recipeSteps: [{ title: "1", formattedText: "<NOBR>Mix.</NOBR>" }] },
    ]);
    expect(details.url).toBe("https://cookidoo.ch/recipes/recipe/de-CH/r907015");
  });

  it("throws when activeTime is missing from times", () => {
    const withoutActiveTime = {
      ...rawRecipeDetails,
      times: [rawRecipeDetails.times[1]],
    };
    expect(() => cookidooRecipeDetailsFromJson(withoutActiveTime as never)).toThrow(
      /activeTime/,
    );
  });

  it("throws when totalTime is missing from times", () => {
    const withoutTotalTime = {
      ...rawRecipeDetails,
      times: [rawRecipeDetails.times[0]],
    };
    expect(() => cookidooRecipeDetailsFromJson(withoutTotalTime as never)).toThrow(/totalTime/);
  });

  it("defaults nutritionGroups/stepGroups to empty arrays when absent", () => {
    const { nutritionGroups, recipeStepGroups, ...rest } = rawRecipeDetails;
    void nutritionGroups;
    void recipeStepGroups;
    const details = cookidooRecipeDetailsFromJson(rest as never);
    expect(details.nutritionGroups).toEqual([]);
    expect(details.stepGroups).toEqual([]);
  });
});

describe("cookidooCustomRecipeFromJson", () => {
  const localization = {
    countryCode: "ch",
    language: "de-CH",
    url: "https://cookidoo.ch/foundation/de-CH",
  };

  it("maps the 'created' response shape (recipeIngredient/tool/recipeYield, ISO-8601 durations)", () => {
    const recipe = cookidooCustomRecipeFromJson(
      {
        recipeId: "01K2CVHD1DXG1PVETNVV3JPKWW",
        recipeContent: {
          name: "Vongole alla marinara",
          image:
            "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/x.jpg",
          totalTime: "PT30M",
          prepTime: "PT10M",
          tool: ["TM7", "TM6", "TM5"],
          recipeYield: { value: 6, unitText: "portion" },
          recipeIngredient: ["130 g di cipolla", "65 g di olio extravergine di oliva"],
          recipeInstructions: ["Mettere nel boccale le cipolle.", "Servire subito."],
        },
      },
      localization,
    );
    expect(recipe.id).toBe("01K2CVHD1DXG1PVETNVV3JPKWW");
    expect(recipe.name).toBe("Vongole alla marinara");
    expect(recipe.totalTime).toBe(1800);
    expect(recipe.activeTime).toBe(600);
    expect(recipe.tools).toEqual(["TM7", "TM6", "TM5"]);
    expect(recipe.servingSize).toBe(6);
    expect(recipe.ingredients).toEqual([
      "130 g di cipolla",
      "65 g di olio extravergine di oliva",
    ]);
    expect(recipe.instructions).toEqual([
      "Mettere nel boccale le cipolle.",
      "Servire subito.",
    ]);
    expect(recipe.thumbnail).toBe(
      "https://assets.tmecosys.com/image/upload/t_web_shared_recipe_221x240/img/recipe/x.jpg",
    );
    expect(recipe.image).toBe(
      "https://assets.tmecosys.com/image/upload/t_web_rdp_recipe_584x480_1_5x/img/recipe/x.jpg",
    );
    expect(recipe.url).toBe(
      "https://cookidoo.ch/created-recipes/de-CH/01K2CVHD1DXG1PVETNVV3JPKWW",
    );
  });

  it("maps the 'list' response shape (ingredients/tools/yield as objects, numeric seconds)", () => {
    const recipe = cookidooCustomRecipeFromJson({
      recipeId: "01K2CTJ9Y1BABRG5MXK44CFZS4",
      recipeContent: {
        name: "Vongole alla marinara",
        prepTime: 600,
        totalTime: 1800,
        tools: ["TM7", "TM6", "TM5"],
        yield: { value: 6, unitText: "portion" },
        ingredients: [
          { text: "130 g di cipolla" },
          { text: "65 g di olio extravergine di oliva" },
        ],
        instructions: [
          { text: "Mettere nel boccale le cipolle." },
          { text: "Servire subito." },
        ],
      },
    });
    expect(recipe.totalTime).toBe(1800);
    expect(recipe.activeTime).toBe(600);
    expect(recipe.tools).toEqual(["TM7", "TM6", "TM5"]);
    expect(recipe.ingredients).toEqual([
      "130 g di cipolla",
      "65 g di olio extravergine di oliva",
    ]);
    expect(recipe.instructions).toEqual([
      "Mettere nel boccale le cipolle.",
      "Servire subito.",
    ]);
  });

  it("defaults servingSize/tools/thumbnail/image when absent", () => {
    const recipe = cookidooCustomRecipeFromJson({
      recipeId: "r1",
      recipeContent: { name: "Bare minimum" },
    });
    expect(recipe.servingSize).toBe(0);
    expect(recipe.tools).toEqual([]);
    expect(recipe.thumbnail).toBeNull();
    expect(recipe.image).toBeNull();
    expect(recipe.totalTime).toBe(0);
    expect(recipe.activeTime).toBe(0);
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
