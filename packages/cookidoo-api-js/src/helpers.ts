/** Cookidoo API helpers: raw JSON -> public types. */

import localizationOptions from "./localization.json" with { type: "json" };
import type {
  AdditionalItemJSON,
  CommunityProfileJSON,
  DescriptiveAssetJSON,
  IngredientJSON,
  ItemJSON,
  QuantityJSON,
  RecipeJSON,
} from "./raw-types.js";
import type {
  CookidooAdditionalItem,
  CookidooIngredient,
  CookidooIngredientItem,
  CookidooLocalizationConfig,
  CookidooShoppingRecipe,
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
