---
"cookidoo-api-js": minor
"@bastianh/node-red-cookidoo": patch
---

Add `cookidooCookStatePayload` to normalize remote-monitoring push payloads whose cook-state fields arrive nested under `data`/`cookingActivity`/`remoteMonitoringInfo` (as an object or a JSON string) instead of flat, matching every shape the Cookidoo app itself accepts.

In `node-red-cookidoo`, the `cookidoo-devices` node's `decode-push` operation now runs this normalization automatically, and drops a message that carries no recognizable cook state (no output, no error) instead of forwarding or mis-decoding it.
