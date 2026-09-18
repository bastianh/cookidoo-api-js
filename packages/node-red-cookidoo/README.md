# node-red-cookidoo

Node-RED nodes for [Cookidoo](https://cookidoo.com), built on [`cookidoo-api-js`](../cookidoo-api-js).

## Disclaimer

The developers of this package are in no way endorsed by or affiliated with Cookidoo or Vorwerk, or any associated subsidiaries, logos or trademarks.

## Nodes

- **cookidoo-config** (config node) — holds the localization (country/language) and OAuth2 tokens for one Cookidoo account, shared by every node that references it. Its edit dialog has an email/password field and a **Login** button: clicking it runs the OAuth2/PKCE login once through a Node-RED admin route and stores only the resulting access/refresh tokens as this node's credentials — the password itself is never persisted, only used for that one request. Tokens are refreshed automatically as they're used. **Click Deploy after logging in** — see [Token persistence](#token-persistence) below for why.
- **cookidoo-get-user-info** — on each input message, fetches the signed-in user's profile and sets it as `msg.payload`.
- **cookidoo-shopping-recipes** — shopping-list operations scoped to recipes and their ingredient items (get the list, get ingredient items, add/remove ingredients for a recipe or a custom recipe, edit ingredient ownership), picked via an **operation** dropdown -- overridable per message with `msg.operation`. `msg.payload` is the operation's input where one is needed, and becomes its result on output. See the node's help in the editor for the exact `msg.payload` shape per operation.
- **cookidoo-shopping-additional-items** — the same operation-dropdown pattern as above, for additional (not recipe-linked) items: get, add, edit (name), edit ownership, remove.
- **cookidoo-clear-shopping-list** — removes *everything* from the shopping list. Deliberately its own node rather than one more dropdown entry on the two above: a destructive, whole-list action shouldn't be a stray dropdown selection away.
- **cookidoo-search-recipes** — searches recipes. `msg.payload` in is a plain search string (shorthand for `{ query: ... }`) or a full options object; the result replaces it.
- **cookidoo-get-recipe-details** — fetches a recipe's full details (ingredients, step groups, nutrition groups, categories, collections, utensils, serving size, active/total time). `msg.payload` in is the recipe id (e.g. from a `cookidoo-search-recipes` hit); the result replaces it.
- **cookidoo-custom-recipes** — CRUD on the signed-in user's custom recipes (list, get, add-from an official recipe, remove), picked via an **operation** dropdown -- overridable per message with `msg.operation`, same pattern as the shopping-list nodes.
- **cookidoo-calendar** — operations on the recipe-planning calendar (get a week, add/remove recipes for a day, including the custom-recipe equivalents), same operation-dropdown pattern. A `day` is always an ISO-8601 `YYYY-MM-DD` string.
- **cookidoo-collections** — CRUD on the signed-in user's managed (Vorwerk-curated) and custom (self-created) recipe collections (count/get/add/remove for each, plus add/remove-recipe on custom collections), same operation-dropdown pattern.

## Token persistence

Node-RED credentials (`RED.nodes.addCredentials`, which is how the tokens are stored) only update an in-memory cache — they are written to `<userDir>/flows_cred.json` on disk exclusively as part of a **Deploy**, whether triggered by the editor's Deploy button or the `POST /flows` admin API it calls. There is no separate, lighter-weight way for a node to persist just its own credentials; this is true of every Node-RED node, not something specific to this one.

Practically, for **cookidoo-config**:

- After clicking **Login**, the tokens work immediately (the running client is updated live), but are only durable once you click **Deploy**. If Node-RED restarts before that, they're gone and you'll need to log in again.
- Once deployed at least once, the tokens keep working across restarts, refreshing automatically as needed.
- A background token refresh rotates the refresh token and updates the running client the same way (immediately, but not durably) — so a restart between a refresh and your next Deploy can also lose sync with what's on disk. The node's status reflects this: a solid **green** dot means the current tokens are the ones loaded from disk (durable); a **yellow** dot after a login or a refresh means they aren't saved yet.
- If you're actively developing against the [`docker-compose.yml`](../../docker-compose.yml) setup with `pnpm dev:node-red` (which restarts the container on every code change), this is very easy to hit: log in, then Deploy once before your next edit, or you'll be logging in again after each auto-restart.

## Status

Early, incremental slice: config node, `cookidoo-get-user-info`, the shopping list (`cookidoo-shopping-recipes`, `cookidoo-shopping-additional-items`, `cookidoo-clear-shopping-list`), recipes (`cookidoo-search-recipes`, `cookidoo-get-recipe-details`), custom recipes (`cookidoo-custom-recipes`), the calendar (`cookidoo-calendar`), and collections (`cookidoo-collections`). More nodes (device/remote-monitoring, ...) are added as the underlying `cookidoo-api-js` client grows.

## Installation

```bash
cd ~/.node-red
npm install node-red-cookidoo
```

## Development

From the repo root:

```bash
pnpm install
pnpm --filter node-red-cookidoo test
```

For manual, interactive testing in an actual Node-RED editor, see the [`docker-compose.yml`](../../docker-compose.yml) at the repo root.

## Credits

Built on [`cookidoo-api-js`](../cookidoo-api-js), itself ported from [**cookidoo-api**](https://github.com/miaucl/cookidoo-api) by [Cyrill Raccaud (miaucl)](https://github.com/miaucl). See the [repo root README](../../README.md#credits) for more.
