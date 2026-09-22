# @bastianh/node-red-cookidoo

## 0.1.1

### Patch Changes

- [`4580632`](https://github.com/bastianh/cookidoo-api-js/commit/458063234b980314b06f968520736f6d11c14645) Thanks [@bastianh](https://github.com/bastianh)! - Add `cookidooCookStatePayload` to normalize remote-monitoring push payloads whose cook-state fields arrive nested under `data`/`cookingActivity`/`remoteMonitoringInfo` (as an object or a JSON string) instead of flat, matching every shape the Cookidoo app itself accepts.
  
  In `node-red-cookidoo`, the `cookidoo-devices` node's `decode-push` operation now runs this normalization automatically, and drops a message that carries no recognizable cook state (no output, no error) instead of forwarding or mis-decoding it.
- Updated dependencies [[`4580632`](https://github.com/bastianh/cookidoo-api-js/commit/458063234b980314b06f968520736f6d11c14645), [`cf0e499`](https://github.com/bastianh/cookidoo-api-js/commit/cf0e4991cb8aa10648be488857fad81509dfaf80)]:
  - cookidoo-api-js@0.2.0
