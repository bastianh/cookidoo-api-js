---
"cookidoo-api-js": patch
---

Fix `cookidooCookingActivityFromPush` returning `null` for `currentTemperature`/`targetTemperature` when the push payload's `primaryInfo`/`secondaryInfo` carries a trailing degree marker (e.g. `"100°"`), as real remote-monitoring payloads do. The leading numeric run is now extracted instead of requiring the whole string to parse as a number.
