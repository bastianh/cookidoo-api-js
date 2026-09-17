import { describe, expect, it } from "vitest";

import {
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
