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
    expect(info).toEqual({
      id: "user-1",
      username: "chef",
      description: null,
      picture: "https://example.com/p.png",
    });
  });

  it("defaults a missing description to null", () => {
    const info = cookidooUserInfoFromJson({
      id: "user-2",
      userInfo: { username: "chef2", picture: null },
    });
    expect(info.description).toBeNull();
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
