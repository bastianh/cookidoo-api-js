# node-red-cookidoo

Node-RED nodes for [Cookidoo](https://cookidoo.com), built on [`cookidoo-api-js`](../cookidoo-api-js).

## Disclaimer

The developers of this package are in no way endorsed by or affiliated with Cookidoo or Vorwerk, or any associated subsidiaries, logos or trademarks.

## Nodes

- **cookidoo-config** (config node) — holds the localization (country/language) and OAuth2 tokens for one Cookidoo account, shared by every node that references it. Its edit dialog has an email/password field and a **Login** button: clicking it runs the OAuth2/PKCE login once through a Node-RED admin route and stores only the resulting access/refresh tokens as this node's credentials — the password itself is never persisted, only used for that one request. Tokens are refreshed automatically as they're used, and the refreshed (rotated) tokens are written back the same way, so no redeploy or repeated login is needed as long as the refresh token stays valid.
- **cookidoo-get-user-info** — on each input message, fetches the signed-in user's profile and sets it as `msg.payload`.

## Status

Early, incremental slice: config node + a single demo node (`cookidoo-get-user-info`), enough to prove login + an authenticated call work end-to-end inside Node-RED. More nodes (shopping list, custom recipes, calendar, ...) are added as the underlying `cookidoo-api-js` client grows.

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
