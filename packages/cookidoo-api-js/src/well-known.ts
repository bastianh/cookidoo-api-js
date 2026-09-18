/**
 * Discovery of Cookidoo API endpoints via the `.well-known/home` HAL
 * documents.
 *
 * Cookidoo's backend exposes a HAL `.well-known/home` document per
 * microservice (e.g. `shopping`, `planning`, `community/profile`), listing
 * the live relative paths ("rels") of its endpoints. This module resolves
 * the live path template for every rel this library depends on. There is no
 * hardcoded fallback: a rel that can't be resolved (network error, or a
 * shape too different to reconcile) fails the request instead of silently
 * serving a possibly-stale path.
 *
 * Only the services/rels actually consumed by this library are fetched (see
 * {@link ENDPOINT_RELS}), not a full recursive crawl. This list grows as
 * more API methods are ported from the Python client.
 */

import {
  ADD_ADDITIONAL_ITEMS_PATH,
  ADD_INGREDIENT_ITEMS_FOR_RECIPES_PATH,
  ADD_RECIPES_TO_CALENDAR_PATH,
  COMMUNITY_PROFILE_PATH,
  COOKING_HISTORY_PATH,
  CUSTOM_COLLECTIONS_PATH,
  CUSTOM_RECIPE_PATH,
  CUSTOM_RECIPES_PATH,
  DEFAULT_API_HEADERS,
  DEVICES_PATH,
  EDIT_ADDITIONAL_ITEMS_PATH,
  EDIT_OWNERSHIP_ADDITIONAL_ITEMS_PATH,
  EDIT_OWNERSHIP_INGREDIENT_ITEMS_PATH,
  LOGIN_HEADERS,
  MANAGED_COLLECTIONS_PATH,
  RECIPE_PATH,
  RECIPES_IN_CALENDAR_WEEK_PATH,
  REMOVE_ADDITIONAL_ITEMS_PATH,
  REMOVE_CUSTOM_COLLECTION_PATH,
  REMOVE_INGREDIENT_ITEMS_FOR_RECIPES_PATH,
  REMOVE_MANAGED_COLLECTION_PATH,
  REMOVE_RECIPE_FROM_CALENDAR_PATH,
  REMOVE_RECIPE_FROM_CUSTOM_COLLECTION_PATH,
  SEARCH_PATH,
  SHOPPING_LIST_RECIPES_PATH,
} from "./const.js";
import { CookidooParseException, CookidooRequestException } from "./exceptions.js";
import type { FetchLike } from "./http.js";

export const WELL_KNOWN_HOME_PATH = ".well-known/home";

const DISCOVERY_HEADERS: Readonly<Record<string, string>> = {
  ...DEFAULT_API_HEADERS,
  ...LOGIN_HEADERS,
};

/** rel -> [service, our own `{token}` shape template]. */
export const ENDPOINT_RELS: Readonly<Record<string, readonly [string, string]>> = {
  "community-profile:user-private-profile": [
    "community/profile",
    COMMUNITY_PROFILE_PATH,
  ],
  "pantry:home": ["shopping", SHOPPING_LIST_RECIPES_PATH],
  "pantry:edit-ingredients-ownership": ["shopping", EDIT_OWNERSHIP_INGREDIENT_ITEMS_PATH],
  "pantry:recipe-ingredients": ["shopping", ADD_INGREDIENT_ITEMS_FOR_RECIPES_PATH],
  "pantry:remove-recipe": ["shopping", REMOVE_INGREDIENT_ITEMS_FOR_RECIPES_PATH],
  "pantry:add-additional-items-v2": ["shopping", ADD_ADDITIONAL_ITEMS_PATH],
  "pantry:edit-additional-items": ["shopping", EDIT_ADDITIONAL_ITEMS_PATH],
  "pantry:edit-additional-items-ownership": [
    "shopping",
    EDIT_OWNERSHIP_ADDITIONAL_ITEMS_PATH,
  ],
  "pantry:remove-additional-items": ["shopping", REMOVE_ADDITIONAL_ITEMS_PATH],
  "recipe:details": ["recipes/recipe", RECIPE_PATH],
  "search:home": ["search", SEARCH_PATH],
  "customer-recipes:recipe-create": ["created-recipes", CUSTOM_RECIPES_PATH],
  "customer-recipes:recipe-details": ["created-recipes", CUSTOM_RECIPE_PATH],
  "planning:api-my-week-from-date": ["planning", RECIPES_IN_CALENDAR_WEEK_PATH],
  "planning:api-my-day": ["planning", ADD_RECIPES_TO_CALENDAR_PATH],
  "planning:api-my-day-recipes": ["planning", REMOVE_RECIPE_FROM_CALENDAR_PATH],
  "organize:api-cooking-history": ["organize", COOKING_HISTORY_PATH],
  "organize:api-managed-list": ["organize", MANAGED_COLLECTIONS_PATH],
  "organize:api-managed-list-single": ["organize", REMOVE_MANAGED_COLLECTION_PATH],
  "organize:api-custom-list": ["organize", CUSTOM_COLLECTIONS_PATH],
  "organize:api-custom-list-modify": ["organize", REMOVE_CUSTOM_COLLECTION_PATH],
  "organize:api-custom-list-recipe": ["organize", REMOVE_RECIPE_FROM_CUSTOM_COLLECTION_PATH],
  "customer-devices:thermomix-versions": ["customer-devices", DEVICES_PATH],
};

const DOMAIN_PREFIX_RE = /^https?:\/\/[^/]+/;
const QUERY_SUFFIX_RE = /\{[?&].*$/;
const TOKEN_RE = /(\{\/?)([A-Za-z0-9_]+)(\})/g;

/** Cookidoo's own token names mapped to the set of our names they may stand for. */
const KNOWN_TOKEN_ALIASES: Readonly<Record<string, ReadonlySet<string>>> = {
  lang: new Set(["language", "locale"]),
  id: new Set(["id"]),
  dayKey: new Set(["day"]),
  recipeId: new Set(["recipe"]),
};

/**
 * Normalize a discovered HAL href into our own template shape.
 *
 * Returns `null` if the number of variables doesn't match, or a known
 * token's position doesn't match one of its expected names.
 */
function normalizeHref(href: string, shapeTemplate: string): string | null {
  let path = href.replace(DOMAIN_PREFIX_RE, "");
  path = path.replace(QUERY_SUFFIX_RE, "");

  const ourTokens = [...shapeTemplate.matchAll(TOKEN_RE)].map((m) => m[2]!);
  const discoveredTokens = [...path.matchAll(TOKEN_RE)].map((m) => m[2]!);
  if (ourTokens.length !== discoveredTokens.length) return null;

  for (let i = 0; i < discoveredTokens.length; i++) {
    const discoveredName = discoveredTokens[i]!;
    const ourName = ourTokens[i]!;
    const expected = KNOWN_TOKEN_ALIASES[discoveredName];
    if (expected && !expected.has(ourName)) return null;
  }

  let i = 0;
  const normalized = path.replace(TOKEN_RE, (_match, prefix: string) => {
    const our = ourTokens[i++]!;
    return `${prefix === "{/" ? "/" : ""}{${our}}`;
  });
  return normalized.replace(/^\//, "");
}

async function fetchServiceLinks(
  serviceUrl: URL,
  fetchImpl: FetchLike,
): Promise<Record<string, string> | null> {
  let response: Response;
  try {
    response = await fetchImpl(serviceUrl, { headers: DISCOVERY_HEADERS });
  } catch {
    return null;
  }
  if (response.status !== 200) return null;

  let doc: unknown;
  try {
    doc = await response.json();
  } catch {
    return null;
  }
  if (typeof doc !== "object" || doc === null || !("_links" in doc)) return null;
  const links = (doc as { _links: unknown })._links;
  if (typeof links !== "object" || links === null) return null;

  const result: Record<string, string> = {};
  for (const [rel, value] of Object.entries(links as Record<string, unknown>)) {
    let href: unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      href = (value as { href?: unknown }).href;
    } else if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
      href = (value[0] as { href?: unknown }).href;
    }
    if (typeof href === "string") result[rel] = href;
  }
  return result;
}

/**
 * Resolve live endpoint path templates via `.well-known/home` discovery.
 *
 * Fetches only the services referenced in {@link ENDPOINT_RELS} concurrently,
 * extracts only the rels we use, and normalizes them into our template
 * shape. Only returns once every single rel resolved successfully;
 * otherwise throws (there is no partial/hardcoded fallback).
 */
export async function resolveEndpointPaths(
  apiEndpoint: URL,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, string>> {
  const services = [...new Set(Object.values(ENDPOINT_RELS).map(([service]) => service))].sort();
  const fetched = await Promise.all(
    services.map((service) =>
      fetchServiceLinks(
        new URL(`${apiEndpoint.origin}/${service}/${WELL_KNOWN_HOME_PATH}`),
        fetchImpl,
      ),
    ),
  );
  const serviceLinks = new Map(services.map((service, i) => [service, fetched[i] ?? null]));

  const overrides: Record<string, string> = {};
  for (const [rel, [service, shapeTemplate]] of Object.entries(ENDPOINT_RELS)) {
    const links = serviceLinks.get(service);
    if (links === null || links === undefined) {
      throw new CookidooRequestException(
        `Endpoint discovery failed: could not reach the '${service}' service's .well-known/home document (needed to resolve '${rel}').`,
      );
    }
    if (!(rel in links)) {
      throw new CookidooParseException(
        `Endpoint discovery failed: the '${service}' service's .well-known/home document no longer exposes the '${rel}' relation.`,
      );
    }
    const normalized = normalizeHref(links[rel]!, shapeTemplate);
    if (normalized === null) {
      throw new CookidooParseException(
        `Endpoint discovery failed: the '${rel}' relation on the '${service}' service changed shape unexpectedly.`,
      );
    }
    overrides[rel] = normalized;
  }
  return overrides;
}
