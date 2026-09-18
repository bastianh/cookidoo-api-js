/** Constants for the Cookidoo API client. */

export const DEFAULT_API_HEADERS: Readonly<Record<string, string>> = {
  ACCEPT: "application/json",
};

/**
 * A browser-like User-Agent for the login flow requests only.
 *
 * The login flow is served behind Cloudflare and clients without a
 * recognizable browser User-Agent are more likely to be flagged as bots,
 * causing intermittent 403s. This does not touch any caller defaults, it is
 * only sent with the login requests below.
 * See https://github.com/miaucl/cookidoo-api/issues/230
 */
export const LOGIN_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};

export const CIAM_BASE_URL = "https://ciam.prod.cookidoo.vorwerk-digital.com";
export const CIAM_LOGIN_SRV_URL = `${CIAM_BASE_URL}/login-srv/login`;
export const OIDC_DISCOVERY_URL = `${CIAM_BASE_URL}/.well-known/openid-configuration`;

/**
 * OAuth2 / OIDC client. The bearer token it yields works against the same
 * `apiEndpoint` as a previous cookie session, and additionally reaches the
 * remote-monitoring backend.
 *
 * The login runs as a *public* client: authorization code + PKCE, with the
 * client id sent in the token request body and no client secret anywhere.
 * Both values are public identifiers rather than credentials (RFC 6749
 * sec. 2.2) and default to the ones of the Cookidoo mobile app. Callers are
 * not expected to override them.
 */
export const OAUTH_CLIENT_ID = "mobile-android";
export const OAUTH_REDIRECT_URI = "com.vorwerk.cookidoo://code-grant";
export const OAUTH_SCOPE = "openid profile email offline offline_access";

/** Refresh a little before the (12h) access token actually expires. */
export const TOKEN_EXPIRY_MARGIN_S = 300;

export const COMMUNITY_PROFILE_PATH = "community/profile/{language}";

export const SHOPPING_LIST_RECIPES_PATH = "shopping/{language}";
export const EDIT_OWNERSHIP_INGREDIENT_ITEMS_PATH =
  "shopping/{language}/owned-ingredients/ownership/edit";
export const ADD_INGREDIENT_ITEMS_FOR_RECIPES_PATH = "shopping/{language}/recipes/add";
export const REMOVE_INGREDIENT_ITEMS_FOR_RECIPES_PATH = "shopping/{language}/recipes/remove";
export const ADD_ADDITIONAL_ITEMS_PATH = "shopping/{language}/additional-items/add";
export const EDIT_ADDITIONAL_ITEMS_PATH = "shopping/{language}/additional-items/edit";
export const EDIT_OWNERSHIP_ADDITIONAL_ITEMS_PATH =
  "shopping/{language}/additional-items/ownership/edit";
export const REMOVE_ADDITIONAL_ITEMS_PATH = "shopping/{language}/additional-items/remove";

export const RECIPE_PATH = "recipes/recipe/{language}/{id}";
export const SEARCH_PATH = "search/{locale}";

export const CUSTOM_RECIPES_PATH = "created-recipes/{language}";
export const CUSTOM_RECIPES_PATH_ACCEPT = "application/vnd.vorwerk.customer-recipe.full+json";
export const CUSTOM_RECIPE_PATH = "created-recipes/{language}/{id}";

export const RECIPES_IN_CALENDAR_WEEK_PATH = "planning/{language}/api/my-week/{day}";
export const ADD_RECIPES_TO_CALENDAR_PATH = "planning/{language}/api/my-day";
export const REMOVE_RECIPE_FROM_CALENDAR_PATH =
  "planning/{language}/api/my-day/{day}/recipes/{recipe}";

export const MANAGED_COLLECTIONS_PATH = "organize/{language}/api/managed-list";
export const MANAGED_COLLECTIONS_PATH_ACCEPT =
  "application/vnd.vorwerk.organize.managed-list.mobile+json";
export const REMOVE_MANAGED_COLLECTION_PATH = "organize/{language}/api/managed-list/{id}";

export const CUSTOM_COLLECTIONS_PATH = "organize/{language}/api/custom-list";
export const CUSTOM_COLLECTIONS_PATH_ACCEPT =
  "application/vnd.vorwerk.organize.custom-list.mobile+json";
export const REMOVE_CUSTOM_COLLECTION_PATH = "organize/{language}/api/custom-list/{id}";
export const REMOVE_RECIPE_FROM_CUSTOM_COLLECTION_PATH =
  "organize/{language}/api/custom-list/{id}/recipes/{recipe}";

/** Paired Thermomix appliances on the account, e.g. `["TM7"]`. Language-independent path. */
export const DEVICES_PATH = "customer-devices/api/my-devices/versions";

/**
 * The remote-monitoring (RMI) endpoints live on a dedicated IoT backend
 * discovered from the mobile home document -> rmi-config sub-document,
 * rather than through the usual per-service `.well-known/home` pattern (see
 * {@link Cookidoo.resolveRmiLinks}).
 */
export const MOBILE_HOME_PATH = ".well-known/mobile-home";
export const HAL_ACCEPT =
  "application/vnd.vorwerk.tmde2.rhd.mobile.hal+json, application/hal+json";
/** The RMI write endpoints require this API-version header. */
export const RMI_API_VERSION = "2026-06-01";

export const REL_RMI_CONFIG = "tmde2:rmi-config";
export const RMI_REGISTER_TOKEN = "rmi:register-token";
export const RMI_UNREGISTER = "rmi:unregister";
export const RMI_DEVICES = "rmi:devices";

/** Fields for the push-token registration payload. */
export const PUSH_BUNDLE_ID = "com.vorwerk.cookidoo";
/** Android; the value the app sends. */
export const PUSH_PLATFORM = "AN";
