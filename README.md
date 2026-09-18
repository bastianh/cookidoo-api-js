# cookidoo-api-js (monorepo)

An unofficial JavaScript/TypeScript port of [cookidoo-api](https://github.com/miaucl/cookidoo-api) (Python), plus a Node-RED integration built on top of it.

## Disclaimer

The developers of this project are in no way endorsed by or affiliated with Cookidoo or Vorwerk, or any associated subsidiaries, logos or trademarks.

## Packages

- [`packages/cookidoo-api-js`](packages/cookidoo-api-js) — the core client library (TypeScript, published as `cookidoo-api-js`). Signs in via the official OAuth2/PKCE login flow and exposes the Cookidoo API.
- [`packages/node-red-cookidoo`](packages/node-red-cookidoo) — Node-RED nodes (published as `@bastianh/node-red-cookidoo`) built on `cookidoo-api-js`, for use in Node-RED flows.
- [`packages/node-red-fcm`](packages/node-red-fcm) — Node-RED nodes (published as `@bastianh/node-red-fcm`) that obtain a Firebase Cloud Messaging registration token for *any* Firebase project and receive its push messages. Deliberately app-agnostic: it has nothing to do with Cookidoo and doesn't depend on the packages above, it just happens to be the missing piece for receiving Cookidoo's live cook state (see its README for that pairing as an example).

## Status

This is an early, incremental port. It currently covers the OAuth2/PKCE login flow, access-token refresh, token persistence, `getUserInfo`, the shopping list (recipes, ingredient items, additional items, clearing the list), recipes (search, full details), custom recipes (get, list, add-from, remove), the calendar (get a week, add/remove recipes, including custom ones), collections (managed and custom: count/get/add/remove, plus add/remove-recipe on custom collections), the REST side of devices/remote-monitoring (paired appliances, monitorable device ids, push-token register/unregister, push-payload decoding), and the cooking history ("last cooked"). Actually *receiving* Firebase push messages needs a real FCM client, which is out of scope for the client library itself -- see the [`cookidoo-api-js` README](packages/cookidoo-api-js/README.md#usage) for details, and [`node-red-fcm`](packages/node-red-fcm) for a general-purpose Node-RED receiver that can feed it. Further endpoints are ported incrementally from the [Python client](https://github.com/miaucl/cookidoo-api).

## Dev setup

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

This is a [pnpm workspace](https://pnpm.io/workspaces); each package also has its own `build`/`test`/`typecheck` scripts, runnable from within `packages/*`. Linting (ESLint, flat config) is set up once at the repo root and covers every package.

## Manual testing with Node-RED

A `docker-compose.yml` at the repo root spins up an official Node-RED image with this repo's packages mounted straight from your working tree, so you can drag the nodes into a flow and try them against a real account without publishing anything.

For a one-off look:

```bash
pnpm --filter cookidoo-api-js build   # dist/ has to exist before the container starts
docker compose up
```

For active development, with auto-reload on every change (two terminals):

```bash
pnpm --filter cookidoo-api-js dev     # tsup --watch, rebuilds dist/ on src/ changes
pnpm dev:node-red                     # brings the stack up and restarts it whenever dist/ or nodes/ actually change
```

Either way, open <http://localhost:1880>. See [`docker-compose.yml`](docker-compose.yml) and [`scripts/watch-node-red.mjs`](scripts/watch-node-red.mjs) for details — Node-RED only loads node code at process startup, so `dev:node-red` restarts the container for you instead of `docker compose restart`, but only when the built/node files actually changed (content-hashed, not just "a file event fired"), so it settles instead of restart-looping. This setup is for local, unauthenticated manual testing only — do not expose port 1880 beyond your machine.

## Credits

This project is an independent JavaScript/TypeScript port of [**cookidoo-api**](https://github.com/miaucl/cookidoo-api) by [Cyrill Raccaud (miaucl)](https://github.com/miaucl), the original (MIT-licensed) Python client. All credit for reverse-engineering the Cookidoo API — the OAuth2/PKCE login flow, the `.well-known` endpoint discovery, and the various request/response shapes — belongs to that project; this repo follows its design closely and ports it to the Node.js ecosystem. It is not affiliated with or endorsed by the upstream project.
