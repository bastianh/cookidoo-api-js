# node-red-cookidoo

Node-RED nodes for [Cookidoo](https://cookidoo.com), built on [`cookidoo-api-js`](../cookidoo-api-js).

## Disclaimer

The developers of this package are in no way endorsed by or affiliated with Cookidoo or Vorwerk, or any associated subsidiaries, logos or trademarks.

## Nodes

- **cookidoo-config** (config node) — holds the account email/password (via Node-RED's credential store) and localization (country/language). Logs in lazily, on first use by any node that references it, and shares that one client/session across all of them.
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
