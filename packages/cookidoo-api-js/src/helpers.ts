/** Cookidoo API helpers: raw JSON -> public types. */

import localizationOptions from "./localization.json" with { type: "json" };
import type {
  AdditionalItemJSON,
  CalendarDayJSON,
  CalendarDayRecipeJSON,
  ChapterJSON,
  ChapterRecipeJSON,
  CommunityProfileJSON,
  CookingHistoryEntryJSON,
  CustomCollectionJSON,
  CustomRecipeJSON,
  CustomRecipeTextJSON,
  DescriptiveAssetJSON,
  IngredientJSON,
  ItemJSON,
  ManagedCollectionJSON,
  QuantityJSON,
  RecipeDetailsJSON,
  RecipeJSON,
  SearchResultJSON,
} from "./raw-types.js";
import { CookidooCookState, ThermomixMachineType } from "./types.js";
import type {
  CookidooAdditionalItem,
  CookidooCalendarDay,
  CookidooCalendarDayRecipe,
  CookidooChapter,
  CookidooChapterRecipe,
  CookidooCollection,
  CookidooCookingActivity,
  CookidooCookingHistoryEntry,
  CookidooCustomRecipe,
  CookidooDevice,
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

// A simplified ISO-8601 duration parser (no external dependency): Cookidoo's
// custom-recipe prep/total times are plain "PT#H#M#S"-style durations, never
// years/months/weeks in practice, but those are still parsed (via a fixed
// 365-day year / 30-day month, same approximation isodate -- the Python
// client's parser -- uses) for robustness rather than silently returning 0.
const ISO8601_DURATION_RE =
  /^P(?:(?<years>\d+(?:\.\d+)?)Y)?(?:(?<months>\d+(?:\.\d+)?)M)?(?:(?<weeks>\d+(?:\.\d+)?)W)?(?:(?<days>\d+(?:\.\d+)?)D)?(?:T(?:(?<hours>\d+(?:\.\d+)?)H)?(?:(?<minutes>\d+(?:\.\d+)?)M)?(?:(?<seconds>\d+(?:\.\d+)?)S)?)?$/;

function parseIso8601DurationSeconds(value: string): number {
  const match = ISO8601_DURATION_RE.exec(value);
  if (!match?.groups) return 0;
  const num = (key: string): number => Number(match.groups![key] ?? 0);
  const days = num("years") * 365 + num("months") * 30 + num("weeks") * 7 + num("days");
  return Math.floor(days * 86400 + num("hours") * 3600 + num("minutes") * 60 + num("seconds"));
}

/** A custom recipe's `totalTime`/`prepTime` is either an ISO-8601 duration or plain seconds. */
function durationToSeconds(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? Math.trunc(value) : parseIso8601DurationSeconds(value);
}

function extractTextList(value: (string | CustomRecipeTextJSON)[]): string[] {
  return value.map((item) => (typeof item === "string" ? item : item.text));
}

/** Convert a custom recipe received from the API to a Cookidoo custom recipe. */
export function cookidooCustomRecipeFromJson(
  recipe: CustomRecipeJSON,
  localization?: CookidooLocalizationConfig,
): CookidooCustomRecipe {
  const content = recipe.recipeContent;

  let thumbnail: string | null = null;
  let image: string | null = content.image ?? null;
  if (image) [thumbnail, image] = processImageUrl(image);

  const recipeYield = content.recipeYield ?? content.yield ?? { value: 0, unitText: "" };

  return {
    id: recipe.recipeId,
    name: content.name,
    ingredients: extractTextList(content.recipeIngredient ?? content.ingredients ?? []),
    instructions: extractTextList(content.recipeInstructions ?? content.instructions ?? []),
    servingSize: recipeYield.value,
    totalTime: durationToSeconds(content.totalTime),
    activeTime: durationToSeconds(content.prepTime),
    tools: content.tool ?? content.tools ?? [],
    thumbnail,
    image,
    url: constructRecipeUrl(localization, recipe.recipeId, "created-recipes"),
  };
}

function cookidooCalendarDayRecipeFromJson(
  recipe: CalendarDayRecipeJSON,
  localization?: CookidooLocalizationConfig,
): CookidooCalendarDayRecipe {
  const images = recipe.assets?.images;
  const [thumbnail, image] = images
    ? extractImagesFromDescriptiveAssets([images])
    : [null, null];
  return {
    id: recipe.id,
    name: recipe.title,
    // Observed as a numeric-looking string in some live responses.
    totalTime: Number(recipe.totalTime),
    thumbnail,
    image,
    url: constructRecipeUrl(localization, recipe.id),
  };
}

/** Convert a calendar day received from the API to a Cookidoo calendar day. */
export function cookidooCalendarDayFromJson(
  calendarDay: CalendarDayJSON,
  localization?: CookidooLocalizationConfig,
): CookidooCalendarDay {
  const regular = calendarDay.recipes.map((recipe) =>
    cookidooCalendarDayRecipeFromJson(recipe, localization),
  );
  const custom = (calendarDay.customerRecipes ?? []).map((recipe) =>
    cookidooCalendarDayRecipeFromJson(recipe, localization),
  );
  return {
    id: calendarDay.id,
    title: calendarDay.title,
    recipes: [...regular, ...custom],
    customerRecipeIds: [...(calendarDay.customerRecipeIds ?? [])],
  };
}

function cookidooChapterRecipeFromJson(recipe: ChapterRecipeJSON): CookidooChapterRecipe {
  return {
    id: recipe.id,
    name: recipe.title,
    // Observed as a numeric-looking string in some live responses.
    totalTime: Number(recipe.totalTime),
  };
}

function cookidooChapterFromJson(chapter: ChapterJSON): CookidooChapter {
  return {
    name: chapter.title,
    recipes: chapter.recipes.map(cookidooChapterRecipeFromJson),
  };
}

/** Convert a managed or custom collection received from the API to a Cookidoo collection. */
export function cookidooCollectionFromJson(
  collection: CustomCollectionJSON | ManagedCollectionJSON,
): CookidooCollection {
  return {
    id: collection.id,
    name: collection.title,
    description: collection.description ?? null,
    chapters: collection.chapters.map(cookidooChapterFromJson),
  };
}

/**
 * Convert a device machine type received from the API to a Cookidoo device.
 *
 * The devices endpoint returns bare machine-type strings (e.g. `"TM7"`).
 */
export function cookidooDeviceFromJson(model: string): CookidooDevice {
  if (!(Object.values(ThermomixMachineType) as string[]).includes(model)) {
    throw new Error(`Unknown Thermomix machine type: '${model}'.`);
  }
  return { type: model as ThermomixMachineType };
}

/** Whether a cook is currently running or paused. */
export function isCookingActivityActive(activity: CookidooCookingActivity): boolean {
  return activity.state === CookidooCookState.RUNNING || activity.state === CookidooCookState.PAUSED;
}

/** Parse a push timestamp (ISO-8601 or epoch millis/seconds). */
function pushTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const seconds = value > 1e12 ? value / 1000 : value;
    return new Date(seconds * 1000);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (/^\d+$/.test(text)) return pushTimestamp(Number(text));
    const date = new Date(text.replace(/Z/g, "+00:00"));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Parse a numeric display field; the app uses `"---"` for 'no value'.
 *
 * Temperatures are delivered with a trailing unit marker (e.g. `"100°"`), so
 * the leading numeric run is extracted rather than parsing the whole string.
 */
function pushNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (!text || [...text].every((c) => c === "-" || c === "–" || c === "—")) return null;
  const match = text.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isNaN(num) ? null : num;
}

/** Parse a boolean; push values are strings, so `"false"` must be falsy. */
function pushBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

/** Parse an integer the way Python's `int()` would: truncate a number, but require an exact integer string. */
function pushInt(value: unknown): number | null {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return parseInt(value, 10);
  return null;
}

function parseCookState(raw: unknown): CookidooCookState {
  const upper = String(raw).toUpperCase();
  if (!(Object.values(CookidooCookState) as string[]).includes(upper)) {
    throw new Error(`Unknown Cookidoo cook state: '${upper}'.`);
  }
  return upper as CookidooCookState;
}

/** Keys the app's push service also accepts the cook-state fields nested under. */
const PUSH_NESTED_PAYLOAD_KEYS = ["cookingActivity", "remoteMonitoringInfo"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the cook-state mapping nested under one of the known payload keys. */
function nestedCookStatePayload(data: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of PUSH_NESTED_PAYLOAD_KEYS) {
    const value = data[key];
    if (isPlainObject(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed: unknown = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Extract the cook-state mapping from a Firebase data message.
 *
 * The appliance flattens the cook fields into the data map, but the app's
 * push service also accepts them nested under `cookingActivity` /
 * `remoteMonitoringInfo` (as an object or as a JSON-encoded string), so all
 * three shapes are accepted here and normalized to the flat one
 * {@link cookidooCookingActivityFromPush} expects.
 *
 * Returns `null` if the message carries no recognizable cook state (e.g. an
 * unrelated FCM data message).
 */
export function cookidooCookStatePayload(message: unknown): Record<string, unknown> | null {
  if (!isPlainObject(message)) return null;
  const data = "data" in message ? message.data : message;
  if (!isPlainObject(data)) return null;
  if ("deviceId" in data) return data;
  return nestedCookStatePayload(data);
}

/**
 * Convert a remote-monitoring push payload into a cooking activity.
 *
 * Appliance state is delivered out of band (a Firebase Cloud Messaging data
 * message) rather than as an HTTP response, so consumers receive it via
 * their own push channel and decode it here. Both the on-the-wire field
 * names (`leadingText`/`trailingText`/`completedDate`/`staleDate`/...) and
 * the app's parsed names are accepted. The payload must already be flat --
 * run it through {@link cookidooCookStatePayload} first if it might be
 * nested under `cookingActivity`/`remoteMonitoringInfo`.
 */
export function cookidooCookingActivityFromPush(
  data: Record<string, unknown>,
): CookidooCookingActivity {
  function first(...keys: string[]): unknown {
    for (const key of keys) {
      if (key in data && data[key] !== null && data[key] !== undefined) return data[key];
    }
    return null;
  }

  const remainingRaw = first("remainingDuration");
  let remaining =
    typeof remainingRaw === "number" || typeof remainingRaw === "string"
      ? pushInt(remainingRaw)
      : null;
  const completedAt = pushTimestamp(first("completedDate", "completedTimestamp"));
  const endAt = pushTimestamp(first("endTimestamp"));
  // The wire payload has no remainingDuration; derive it from the finish time.
  if (remaining === null) {
    const finish = completedAt ?? endAt;
    if (finish !== null) {
      remaining = Math.max(0, Math.round((finish.getTime() - Date.now()) / 1000));
    }
  }

  const stateRaw = first("state");
  const recipeType = first("recipeType");

  return {
    deviceId: String(first("deviceId") ?? ""),
    cookingActivityId: (first("cookingActivityId") as string | null) ?? null,
    state: stateRaw !== null ? parseCookState(stateRaw) : null,
    recipeId: (first("recipeId") as string | null) ?? null,
    recipeType: recipeType !== null ? String(recipeType).toUpperCase() : null,
    recipeName: (first("leadingText", "leadingInfoText", "infoText") as string | null) ?? null,
    step: (first("trailingText", "trailingInfoText") as string | null) ?? null,
    remainingSeconds: remaining,
    isTimeEstimated: pushBool(data.isTimeEstimated ?? false),
    currentTemperature: pushNumber(first("primaryInfo")),
    targetTemperature: pushNumber(first("secondaryInfo")),
    messageTitle: (first("messageTitle") as string | null) ?? null,
    messageBody: (first("messageBody") as string | null) ?? null,
    messageCriticality: (first("messageCriticality") as string | null) ?? null,
    completedAt,
    staleAt: pushTimestamp(first("staleDate", "staleTimestamp")),
  };
}

/** Convert a cooking history entry received from the API to a Cookidoo cooking history entry. */
export function cookidooCookingHistoryEntryFromJson(
  entry: CookingHistoryEntryJSON,
  localization?: CookidooLocalizationConfig,
): CookidooCookingHistoryEntry {
  const { recipe } = entry;
  const images = recipe.assets?.images;
  const [thumbnail, image] = images
    ? extractImagesFromDescriptiveAssets([images])
    : [null, null];

  // The service reports the duration as a stringified float of seconds
  // (e.g. "5100.0"), unlike the planning endpoints' plain int.
  const parsedTotalTime = Number(recipe.totalTime);
  const totalTime = Number.isNaN(parsedTotalTime) ? 0 : Math.trunc(parsedTotalTime);

  const cookedAt = pushTimestamp(entry.details.timestamp);
  if (cookedAt === null) {
    throw new Error(
      `Cooking history entry for recipe ${recipe.id} has an unparsable timestamp: '${entry.details.timestamp}'.`,
    );
  }

  return {
    id: recipe.id,
    name: recipe.title,
    cookedAt,
    totalTime,
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
