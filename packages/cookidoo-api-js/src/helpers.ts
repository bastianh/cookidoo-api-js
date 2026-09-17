/** Cookidoo API helpers: raw JSON -> public types. */

import localizationOptions from "./localization.json" with { type: "json" };
import type {
  AdditionalItemJSON,
  CommunityProfileJSON,
  DescriptiveAssetJSON,
  IngredientJSON,
  ItemJSON,
  QuantityJSON,
  RecipeDetailsJSON,
  RecipeJSON,
  SearchResultJSON,
} from "./raw-types.js";
import type {
  CookidooAdditionalItem,
  CookidooIngredient,
  CookidooLocalizationConfig,
  CookidooIngredientItem,
  CookidooSearchResult,
  CookidooShoppingRecipe,
  CookidooShoppingRecipeDetails,
  CookidooUserInfo,
} from "./types.js";

/** Convert a community profile received from the API to a Cookidoo user info. */
export function cookidooUserInfoFromJson(
  profile: CommunityProfileJSON,
): CookidooUserInfo {
  const { userInfo } = profile;
  return {
    id: profile.id,
    username: userInfo.username,
    description: userInfo.description ?? null,
    picture: userInfo.picture,
    raw: profile as unknown as Record<string, unknown>,
  };
}

/**
 * Replace the `{transformation}` placeholder in an asset URL with the two
 * concrete variants the app itself renders.
 */
function processImageUrl(url: string): [thumbnail: string, image: string] {
  return [
    url.replace("{transformation}", "t_web_shared_recipe_221x240"),
    url.replace("{transformation}", "t_web_rdp_recipe_584x480_1_5x"),
  ];
}

/** Extract a (thumbnail, image) pair from the first usable variant of any asset. */
function extractImagesFromDescriptiveAssets(
  descriptiveAssets: DescriptiveAssetJSON[],
): [thumbnail: string | null, image: string | null] {
  for (const asset of descriptiveAssets) {
    for (const [variant, url] of Object.entries(asset)) {
      if (url && (variant === "square" || variant === "portrait" || variant === "landscape")) {
        return processImageUrl(url);
      }
    }
  }
  return [null, null];
}

function constructRecipeUrl(
  localization: CookidooLocalizationConfig | undefined,
  recipeId: string,
  pathPrefix = "recipes/recipe",
): string {
  if (!localization) return "";
  const domain = new URL(localization.url).host;
  return `https://${domain}/${pathPrefix}/${localization.language}/${recipeId}`;
}

/** Convert a quantity received from the API to a display string. */
export function cookidooQuantityFromJson(quantity: QuantityJSON | null): string {
  if (!quantity) return "";
  if (quantity.value) return String(quantity.value);
  if (quantity.from && quantity.to) return `${quantity.from} - ${quantity.to}`;
  return "";
}

function describeQuantity(
  quantity: QuantityJSON | null,
  unitNotation: string | null,
): string {
  const quantityStr = cookidooQuantityFromJson(quantity);
  if (!quantityStr) return "";
  return unitNotation ? `${quantityStr} ${unitNotation}` : quantityStr;
}

/**
 * Convert an ingredient received from the API to a Cookidoo ingredient.
 *
 * Accepts both a recipe's own ingredient groups (identified by `localId`)
 * and a shopping-list item (identified by `id`), matching whichever the
 * caller passed in the same way the Python client's single conversion
 * function does.
 */
export function cookidooIngredientFromJson(
  ingredient: IngredientJSON | ItemJSON,
): CookidooIngredient {
  const id = "localId" in ingredient ? ingredient.localId : ingredient.id;
  return {
    id,
    name: ingredient.ingredientNotation,
    description: describeQuantity(ingredient.quantity, ingredient.unitNotation),
  };
}

/** Convert an ingredient item received from the API to a Cookidoo ingredient item. */
export function cookidooIngredientItemFromJson(item: ItemJSON): CookidooIngredientItem {
  return {
    id: item.id,
    name: item.ingredientNotation,
    isOwned: item.isOwned,
    description: describeQuantity(item.quantity, item.unitNotation),
  };
}

/** Convert an additional item received from the API to a Cookidoo additional item. */
export function cookidooAdditionalItemFromJson(
  item: AdditionalItemJSON,
): CookidooAdditionalItem {
  return { id: item.id, name: item.name, isOwned: item.isOwned };
}

/** Convert a shopping-list recipe received from the API to a Cookidoo shopping recipe. */
export function cookidooRecipeFromJson(
  recipe: RecipeJSON,
  localization?: CookidooLocalizationConfig,
): CookidooShoppingRecipe {
  const [thumbnail, image] = recipe.descriptiveAssets
    ? extractImagesFromDescriptiveAssets(recipe.descriptiveAssets)
    : [null, null];
  return {
    id: recipe.id,
    name: recipe.title,
    ingredients: recipe.recipeIngredientGroups.map(cookidooIngredientFromJson),
    thumbnail,
    image,
    url: constructRecipeUrl(localization, recipe.id),
  };
}

/** Convert a search result received from the API to a Cookidoo search result. */
export function cookidooSearchResultFromJson(
  data: SearchResultJSON,
  localization?: CookidooLocalizationConfig,
): CookidooSearchResult {
  const rawRecipes = data.data ?? data.recipes ?? [];
  const hits = [];
  for (const item of rawRecipes) {
    if (typeof item !== "object" || item === null) continue;
    const id = item.id ?? "";
    const name = item.title || item.name || "";
    const [thumbnail, image] = item.descriptiveAssets
      ? extractImagesFromDescriptiveAssets(item.descriptiveAssets)
      : [null, null];
    hits.push({ id, name, thumbnail, image, url: constructRecipeUrl(localization, id) });
  }
  const total = typeof data.total === "number" ? data.total : hits.length;
  return { recipes: hits, total };
}

/** Convert recipe details received from the API to Cookidoo recipe details. */
export function cookidooRecipeDetailsFromJson(
  recipe: RecipeDetailsJSON,
  localization?: CookidooLocalizationConfig,
): CookidooShoppingRecipeDetails {
  const [thumbnail, image] = recipe.descriptiveAssets
    ? extractImagesFromDescriptiveAssets(recipe.descriptiveAssets)
    : [null, null];

  const activeTime = recipe.times.find(
    (time) => time.type === "activeTime" && time.quantity.value,
  )?.quantity.value;
  if (activeTime == null) {
    throw new Error(
      "Recipe details response is missing a non-null 'activeTime' entry in 'times'.",
    );
  }
  const totalTime = recipe.times.find(
    (time) => time.type === "totalTime" && time.quantity.value,
  )?.quantity.value;
  if (totalTime == null) {
    throw new Error(
      "Recipe details response is missing a non-null 'totalTime' entry in 'times'.",
    );
  }

  return {
    id: recipe.id,
    name: recipe.title,
    ingredients: recipe.recipeIngredientGroups.flatMap((group) =>
      group.recipeIngredients.map(cookidooIngredientFromJson),
    ),
    difficulty: recipe.difficulty,
    notes: recipe.additionalInformation.map((info) => info.content),
    categories: recipe.categories.map((category) => ({
      id: category.id,
      name: category.title,
      notes: category.subtitle,
    })),
    collections: recipe.inCollections.map((collection) => ({
      id: collection.id,
      name: collection.title,
      totalRecipes: collection.recipesCount.value,
    })),
    utensils: recipe.recipeUtensils.map((utensil) => utensil.utensilNotation),
    servingSize: recipe.servingSize.quantity.value || 0,
    activeTime,
    totalTime,
    nutritionGroups: (recipe.nutritionGroups ?? []).map((group) => ({
      name: group.name,
      recipeNutritions: group.recipeNutritions.map((recipeNutrition) => ({
        nutritions: recipeNutrition.nutritions.map((nutrition) => ({
          number: nutrition.number,
          type: nutrition.type,
          unittype: nutrition.unittype,
        })),
        quantity: recipeNutrition.quantity,
        unitNotation: recipeNutrition.unitNotation,
      })),
    })),
    stepGroups: (recipe.recipeStepGroups ?? []).map((group) => ({
      title: group.title,
      recipeSteps: group.recipeSteps.map((step) => ({
        title: step.title,
        formattedText: step.formattedText,
      })),
    })),
    thumbnail,
    image,
    url: constructRecipeUrl(localization, recipe.id),
  };
}

/** Normalize a list/string param to a comma-separated string. */
export function normalizeListParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.filter(Boolean).join(",");
  return value;
}

interface LocalizationOptionJSON {
  country_code: string;
  language: string;
  url: string;
}

function toLocalizationConfig(
  option: LocalizationOptionJSON,
): CookidooLocalizationConfig {
  return {
    countryCode: option.country_code,
    language: option.language,
    url: option.url,
  };
}

/** Get the list of possible localization options, optionally filtered. */
export function getLocalizationOptions(
  filter: { country?: string; language?: string } = {},
): CookidooLocalizationConfig[] {
  return (localizationOptions as LocalizationOptionJSON[])
    .filter(
      (option) =>
        (!filter.country || option.country_code === filter.country) &&
        (!filter.language || option.language === filter.language),
    )
    .map(toLocalizationConfig);
}

/** Get the list of possible country options. */
export function getCountryOptions(): string[] {
  return [...new Set(getLocalizationOptions().map((o) => o.countryCode))];
}

/** Get the list of possible language options. */
export function getLanguageOptions(): string[] {
  return [...new Set(getLocalizationOptions().map((o) => o.language))];
}
