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

Recipes:

```ts
const results = await cookidoo.searchRecipes({ query: "chicken", tmv: "TM6", portions: 4 });

const details = await cookidoo.getRecipeDetails(results.recipes[0].id);
console.log(details.ingredients, details.stepGroups, details.nutritionGroups);
```

Custom recipes:

```ts
const mine = await cookidoo.listCustomRecipes();

// Copy an official recipe as a custom one, at a different serving size
const copy = await cookidoo.addCustomRecipeFrom(results.recipes[0].id, 4);

await cookidoo.removeCustomRecipe(copy.id);
```

Calendar:

```ts
const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

const week = await cookidoo.getRecipesInCalendarWeek(today);

const day = await cookidoo.addRecipesToCalendar(today, [results.recipes[0].id]);
await cookidoo.removeRecipeFromCalendar(today, results.recipes[0].id);

// Custom recipes have their own add/remove pair
await cookidoo.addCustomRecipesToCalendar(today, [copy.id]);
```

`day` is always an ISO-8601 `YYYY-MM-DD` string, never a `Date` -- that's what actually goes into the request either way, and it sidesteps `Date`'s own timezone footguns for a date-only value.

Collections:

```ts
const managed = await cookidoo.getManagedCollections(); // Vorwerk-curated
const custom = await cookidoo.getCustomCollections(); // self-created

const { totalElements, totalPages } = await cookidoo.countCustomCollections();

const list = await cookidoo.addCustomCollection("Weeknight dinners");
await cookidoo.addRecipesToCustomCollection(list.id, [results.recipes[0].id]);
await cookidoo.removeRecipeFromCustomCollection(list.id, results.recipes[0].id);
await cookidoo.removeCustomCollection(list.id);

await cookidoo.addManagedCollection(managed[0].id);
await cookidoo.removeManagedCollection(managed[0].id);
```

Devices and remote monitoring:

```ts
const devices = await cookidoo.getDevices(); // paired appliances, e.g. [{ type: "TM6" }]

// Appliances currently online/reachable for live monitoring
const monitored = await cookidoo.getMonitoredDeviceIds();

// Live cook state is pushed out of band as a Firebase Cloud Messaging data
// message -- obtaining an FCM token and receiving that message is your own
// client's job, this library only registers/unregisters the token and
// decodes an already-received payload:
await cookidoo.registerPushToken(fcmToken, "my-app-install-id");
// ... your FCM client receives a data message ...
const activity = cookidooCookingActivityFromPush(receivedData);
console.log(activity.state, activity.recipeName, isCookingActivityActive(activity));
await cookidoo.unregisterPushToken(fcmToken);
```

## Status

Early, incremental port. Currently covers the OAuth2/PKCE login flow, token refresh/persistence, `getUserInfo`, the shopping list (recipes, ingredient items, additional items — get/add/remove/edit-ownership, including custom recipes, plus clearing the whole list), recipes (`searchRecipes`, `getRecipeDetails`), custom recipes (`getCustomRecipe`, `listCustomRecipes`, `addCustomRecipeFrom`, `removeCustomRecipe`), the calendar (`getRecipesInCalendarWeek`, `add/removeRecipesToCalendar`, plus the custom-recipe equivalents), collections (`count/get/add/removeManagedCollection(s)`, `count/get/add/removeCustomCollection(s)`, `add/removeRecipeFromCustomCollection`), and the REST side of devices/remote-monitoring (`getDevices`, `getMonitoredDeviceIds`, `register/unregisterPushToken`, `cookidooCookingActivityFromPush`). Actually *receiving* the Firebase push messages themselves is out of scope -- see "Devices and remote monitoring" above.

## Exceptions

Requests can throw, all inheriting from `CookidooException`:

- `CookidooConfigException` — invalid config (e.g. missing OAuth2 client id/redirect uri, or `saveToken`/`loadToken` failures).
- `CookidooAuthException` — authentication failed or the access token is invalid/expired.
- `CookidooRequestException` — the request itself failed (network, unexpected status).
- `CookidooParseException` — the response could not be parsed into the expected shape.

## Credits

Ported from [**cookidoo-api**](https://github.com/miaucl/cookidoo-api) by [Cyrill Raccaud (miaucl)](https://github.com/miaucl) (MIT licensed), which did the original work of reverse-engineering the Cookidoo API. See the [repo root README](../../README.md#credits) for more.
