# cookidoo-api-js

An unofficial JavaScript/TypeScript client to access [Cookidoo](https://cookidoo.com), ported from the Python [cookidoo-api](https://github.com/miaucl/cookidoo-api).

## Disclaimer

The developers of this package are in no way endorsed by or affiliated with Cookidoo or Vorwerk, or any associated subsidiaries, logos or trademarks.

## Installation

```bash
npm install cookidoo-api-js
```

## Usage

Authentication uses the OAuth2 authorization-code flow (with PKCE) and authenticates requests with a bearer token. Tokens can be persisted with `saveToken`/`loadToken`, or kept in sync with a storage of your own through the `onAuthDataUpdate` callback, which fires whenever the tokens change — including the refresh a request performs on its own once the access token has expired.

```ts
import { Cookidoo } from "cookidoo-api-js";

const cookidoo = new Cookidoo({
  localization: {
    countryCode: "ch",
    language: "de-CH",
    url: "https://cookidoo.ch/foundation/de-CH",
  },
  email: "your@email",
  password: "your-password",
});

await cookidoo.login();

const userInfo = await cookidoo.getUserInfo();
console.log(userInfo.username);
// `userInfo.raw` carries the full, unparsed community-profile response, for
// fields not otherwise modeled (isPublic, savedSearches, foodPreferences, ...)

// Persist the tokens for reuse without a fresh login next time
cookidoo.saveToken("./cookidoo-token.json");
```

Restoring a previous session:

```ts
const cookidoo = new Cookidoo({ localization: { ... } });
cookidoo.loadToken("./cookidoo-token.json");
// cookidoo.authData is now populated; the access token refreshes
// automatically on the next request if it has expired.
```

Shopping list:

```ts
const recipes = await cookidoo.getShoppingListRecipes();
const ingredients = await cookidoo.getIngredientItems();
const additional = await cookidoo.getAdditionalItems();

await cookidoo.addIngredientItemsForRecipes(["recipe-id-1"]);
await cookidoo.addAdditionalItems(["Napkins"]);

// Toggle an ingredient's owned/checked-off state
await cookidoo.editIngredientItemsOwnership([{ ...ingredients[0], isOwned: true }]);

await cookidoo.clearShoppingList();
```

## Status

Early, incremental port. Currently covers the OAuth2/PKCE login flow, token refresh/persistence, `getUserInfo`, and the shopping list (recipes, ingredient items, additional items — get/add/remove/edit-ownership, including custom recipes, plus clearing the whole list). More of the Python client's surface (custom recipes, calendar, collections, device/remote-monitoring) is ported incrementally.

## Exceptions

Requests can throw, all inheriting from `CookidooException`:

- `CookidooConfigException` — invalid config (e.g. missing OAuth2 client id/redirect uri, or `saveToken`/`loadToken` failures).
- `CookidooAuthException` — authentication failed or the access token is invalid/expired.
- `CookidooRequestException` — the request itself failed (network, unexpected status).
- `CookidooParseException` — the response could not be parsed into the expected shape.

## Credits

Ported from [**cookidoo-api**](https://github.com/miaucl/cookidoo-api) by [Cyrill Raccaud (miaucl)](https://github.com/miaucl) (MIT licensed), which did the original work of reverse-engineering the Cookidoo API. See the [repo root README](../../README.md#credits) for more.
