/** Cookidoo API helpers: raw JSON -> public types. */

import localizationOptions from "./localization.json" with { type: "json" };
import type { CommunityProfileJSON } from "./raw-types.js";
import type { CookidooLocalizationConfig, CookidooUserInfo } from "./types.js";

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
