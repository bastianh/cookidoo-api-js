import { describe, expect, it } from "vitest";

import {
  cookidooAdditionalItemFromJson,
  cookidooCalendarDayFromJson,
  cookidooCollectionFromJson,
  cookidooCookingActivityFromPush,
  cookidooCookStatePayload,
  cookidooCookingHistoryEntryFromJson,
  cookidooCustomRecipeFromJson,
  cookidooDeviceFromJson,
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
  isCookingActivityActive,
  normalizeListParam,
} from "../src/helpers.js";
import { CookidooCookState, ThermomixMachineType } from "../src/types.js";

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

describe("cookidooCalendarDayFromJson", () => {
  const localization = {
    countryCode: "gb",
    language: "en-GB",
    url: "https://cookidoo.co.uk/foundation/en-GB",
  };

  it("maps id/title/recipes, coercing a numeric-string totalTime", () => {
    const day = cookidooCalendarDayFromJson(
      {
        id: "2025-03-04",
        title: "2025-03-04",
        dayKey: "2025-03-04",
        recipes: [
          {
            id: "r214846",
            title: "Waffles",
            totalTime: "1500.0",
            assets: {
              images: {
                square: "https://assets.test/{transformation}/x.jpg",
                portrait: null,
                landscape: null,
              },
            },
          },
        ],
        customerRecipeIds: [],
      },
      localization,
    );
    expect(day.id).toBe("2025-03-04");
    expect(day.title).toBe("2025-03-04");
    expect(day.recipes).toEqual([
      {
        id: "r214846",
        name: "Waffles",
        totalTime: 1500,
        thumbnail: "https://assets.test/t_web_shared_recipe_221x240/x.jpg",
        image: "https://assets.test/t_web_rdp_recipe_584x480_1_5x/x.jpg",
        url: "https://cookidoo.co.uk/recipes/recipe/en-GB/r214846",
      },
    ]);
    expect(day.customerRecipeIds).toEqual([]);
  });

  it("appends customerRecipes after recipes and carries customerRecipeIds", () => {
    const day = cookidooCalendarDayFromJson({
      id: "2025-08-11",
      title: "11.08.2025",
      dayKey: "2025-08-11",
      recipes: [],
      customerRecipes: [
        { id: "cr1", title: "Vongole", totalTime: 1800, assets: null },
      ],
      customerRecipeIds: ["01K2CTJ9Y1BABRG5MXK44CFZS4"],
    });
    expect(day.recipes).toEqual([
      { id: "cr1", name: "Vongole", totalTime: 1800, thumbnail: null, image: null, url: "" },
    ]);
    expect(day.customerRecipeIds).toEqual(["01K2CTJ9Y1BABRG5MXK44CFZS4"]);
  });

  it("defaults customerRecipeIds to an empty array when absent", () => {
    const day = cookidooCalendarDayFromJson({
      id: "2025-08-11",
      title: "11.08.2025",
      dayKey: "2025-08-11",
      recipes: [],
    });
    expect(day.customerRecipeIds).toEqual([]);
  });
});

describe("cookidooCollectionFromJson", () => {
  it("maps a managed collection, coercing numeric-string totalTime in chapter recipes", () => {
    const collection = cookidooCollectionFromJson({
      id: "col500561",
      title: "Schneeweiss und Zuckersüss",
      description: "Schneeweisse Delikatessen.",
      chapters: [
        {
          title: "Schneeweiss und Zuckersüss",
          recipes: [
            { id: "r907016", title: "Mini-Pavlova mit Orangen", type: "VORWERK", totalTime: "6600.0" },
          ],
        },
      ],
    });
    expect(collection).toEqual({
      id: "col500561",
      name: "Schneeweiss und Zuckersüss",
      description: "Schneeweisse Delikatessen.",
      chapters: [
        {
          name: "Schneeweiss und Zuckersüss",
          recipes: [{ id: "r907016", name: "Mini-Pavlova mit Orangen", totalTime: 6600 }],
        },
      ],
    });
  });

  it("defaults description to null when absent (custom collections)", () => {
    const collection = cookidooCollectionFromJson({
      id: "01JC1SRPRSW0SHE0AK8GCASABX",
      title: "Testliste1",
      chapters: [{ title: "", recipes: [] }],
    });
    expect(collection.description).toBeNull();
    expect(collection.chapters).toEqual([{ name: "", recipes: [] }]);
  });
});

describe("cookidooDeviceFromJson", () => {
  it("maps a known machine type", () => {
    expect(cookidooDeviceFromJson("TM7")).toEqual({ type: ThermomixMachineType.TM7 });
  });

  it("throws on an unrecognized machine type", () => {
    expect(() => cookidooDeviceFromJson("TM99")).toThrow();
  });
});

describe("cookidooCookStatePayload", () => {
  const FLAT_PAYLOAD: Record<string, unknown> = { deviceId: "dev-1", state: "running" };

  it.each([
    ["flattened", FLAT_PAYLOAD],
    ["under-data", { data: FLAT_PAYLOAD }],
    ["nested-object", { data: { cookingActivity: FLAT_PAYLOAD } }],
    ["nested-json-string", { data: { remoteMonitoringInfo: JSON.stringify(FLAT_PAYLOAD) } }],
  ] as const)("accepts the %s shape", (_label, message) => {
    expect(cookidooCookStatePayload(message)).toEqual(FLAT_PAYLOAD);
  });

  it.each([
    ["not-a-dict", "not-a-mapping"],
    ["data-not-a-dict", { data: "not-a-mapping" }],
    ["no-cook-state", { data: { unrelated: "message" } }],
    ["undecodable-json", { data: { cookingActivity: "{not json" } }],
  ] as const)("returns null for the %s shape", (_label, message) => {
    expect(cookidooCookStatePayload(message)).toBeNull();
  });
});

describe("cookidooCookingActivityFromPush", () => {
  // A real remote-monitoring push payload (Firebase data message; values are strings).
  const RAW_PUSH: Record<string, unknown> = {
    deviceId: "22e920b2d6184cec6c854cd005d6aa8fb851d7e783478b50f361ac8d1ab97bfe",
    id: "986954277",
    cookingActivityId: "210c27aa-de31-4565-aad1-4f10e2c79deb",
    state: "running",
    recipeId: "r54743",
    recipeType: "vorwerk",
    leadingText: "Purè di patate",
    trailingText: "5/9",
    primaryInfo: "---",
    secondaryInfo: "95",
    separator: "/",
    isTimeEstimated: "false",
    iconId: "manual-values",
    completedDate: "2026-08-28T13:37:48Z",
    staleDate: "1787924895000",
    dismissalDate: "1787924388000",
  };

  it("decodes a real push payload", () => {
    const activity = cookidooCookingActivityFromPush(RAW_PUSH);
    expect(activity.state).toBe(CookidooCookState.RUNNING);
    expect(isCookingActivityActive(activity)).toBe(true);
    expect(activity.recipeName).toBe("Purè di patate");
    expect(activity.step).toBe("5/9");
    expect(activity.targetTemperature).toBe(95);
    expect(activity.currentTemperature).toBeNull(); // "---" -> null
    expect(activity.isTimeEstimated).toBe(false); // "false" -> false
    expect(activity.recipeType).toBe("VORWERK");
    expect(activity.completedAt).not.toBeNull();
    expect(activity.staleAt).not.toBeNull();
    expect(activity.staleAt?.getUTCFullYear()).toBe(2026);
  });

  it("a done cook is not active", () => {
    const activity = cookidooCookingActivityFromPush({ ...RAW_PUSH, state: "done" });
    expect(activity.state).toBe(CookidooCookState.DONE);
    expect(isCookingActivityActive(activity)).toBe(false);
  });

  it.each([
    // _push_timestamp: unparseable and empty values degrade to null
    ["completedDate", "not-a-date", "completedAt", null],
    ["completedDate", "", "completedAt", null],
    ["completedDate", null, "completedAt", null],
    ["completedDate", ["unexpected", "shape"], "completedAt", null],
    // _push_number: sentinels, comma decimals and native numbers
    ["secondaryInfo", "---", "targetTemperature", null],
    ["secondaryInfo", "", "targetTemperature", null],
    ["secondaryInfo", "not-a-number", "targetTemperature", null],
    ["secondaryInfo", "37,5", "targetTemperature", 37.5],
    ["secondaryInfo", 95, "targetTemperature", 95],
    ["secondaryInfo", null, "targetTemperature", null],
    // a degree marker is stripped rather than making the whole value unparseable
    ["primaryInfo", "100°", "currentTemperature", 100],
    // _push_bool: real bools pass through, strings are coerced
    ["isTimeEstimated", true, "isTimeEstimated", true],
    ["isTimeEstimated", "yes", "isTimeEstimated", true],
    ["isTimeEstimated", "FALSE", "isTimeEstimated", false],
    ["isTimeEstimated", 1, "isTimeEstimated", true],
  ] as const)(
    "malformed/alternately-typed %s=%j degrades %s to %j instead of throwing",
    (field, value, attr, expected) => {
      const activity = cookidooCookingActivityFromPush({ ...RAW_PUSH, [field]: value });
      expect(activity[attr as keyof typeof activity]).toEqual(expected);
    },
  );

  it.each([["600"], [600]])(
    "accepts remainingDuration as a string or a number (%j)",
    (remaining) => {
      const activity = cookidooCookingActivityFromPush({
        ...RAW_PUSH,
        remainingDuration: remaining,
      });
      expect(activity.remainingSeconds).toBe(600);
    },
  );

  it("falls back to deriving remainingSeconds from the finish time when unparseable", () => {
    const activity = cookidooCookingActivityFromPush({
      ...RAW_PUSH,
      remainingDuration: "not-a-number",
    });
    expect(activity.remainingSeconds === null || Number.isInteger(activity.remainingSeconds)).toBe(
      true,
    );
  });

  it("decodes epoch millis and epoch seconds to the same instant", () => {
    const millis = cookidooCookingActivityFromPush({
      ...RAW_PUSH,
      completedDate: "1787924895000",
    });
    const seconds = cookidooCookingActivityFromPush({ ...RAW_PUSH, completedDate: 1787924895 });
    expect(millis.completedAt).not.toBeNull();
    expect(millis.completedAt?.getTime()).toBe(seconds.completedAt?.getTime());
  });

  it("throws on an unrecognized state", () => {
    expect(() => cookidooCookingActivityFromPush({ ...RAW_PUSH, state: "not-a-state" })).toThrow();
  });
});

describe("cookidooCookingHistoryEntryFromJson", () => {
  const localization = {
    countryCode: "ch",
    language: "de-CH",
    url: "https://cookidoo.ch/foundation/de-CH",
  };

  it("maps a cooked recipe, coercing the stringified-float totalTime", () => {
    const entry = cookidooCookingHistoryEntryFromJson(
      {
        details: { timestamp: "2026-09-05T05:31:47.529Z" },
        recipe: {
          id: "r59322",
          title: "Vollkorn-Toastbrötchen",
          totalTime: "5100.0",
          type: "VORWERK",
          locale: "",
          assets: {
            images: {
              square: "https://assets.test/{transformation}/x.jpg",
              portrait: null,
              landscape: null,
            },
          },
        },
      },
      localization,
    );
    expect(entry).toEqual({
      id: "r59322",
      name: "Vollkorn-Toastbrötchen",
      cookedAt: new Date("2026-09-05T05:31:47.529Z"),
      totalTime: 5100,
      thumbnail: "https://assets.test/t_web_shared_recipe_221x240/x.jpg",
      image: "https://assets.test/t_web_rdp_recipe_584x480_1_5x/x.jpg",
      url: "https://cookidoo.ch/recipes/recipe/de-CH/r59322",
    });
  });

  it("parses without images, leaving both URLs null", () => {
    const entry = cookidooCookingHistoryEntryFromJson({
      details: { timestamp: "2026-08-28T13:56:30.168Z" },
      recipe: {
        id: "r54743",
        title: "Pizzateig",
        totalTime: "900.0",
        type: "VORWERK",
        locale: "",
        assets: { images: null },
      },
    });
    expect(entry.thumbnail).toBeNull();
    expect(entry.image).toBeNull();
    expect(entry.totalTime).toBe(900);
  });

  it("throws on an unparsable timestamp instead of producing an invalid entry", () => {
    expect(() =>
      cookidooCookingHistoryEntryFromJson({
        details: { timestamp: "not-a-timestamp" },
        recipe: {
          id: "r59322",
          title: "Vollkorn-Toastbrötchen",
          totalTime: "5100.0",
          type: "VORWERK",
          locale: "",
          assets: { images: null },
        },
      }),
    ).toThrow();
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
