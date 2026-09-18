# node-red-fcm

Node-RED nodes that obtain a Firebase Cloud Messaging (FCM) registration token for **any** Firebase project and receive its push messages as flow messages.

This is a general-purpose FCM receiver. You point it at the Firebase app whose push you want to receive — nothing about any particular app is baked in, and no identifiers ship with this package. It lives in this monorepo next to [`@bastianh/node-red-cookidoo`](../node-red-cookidoo) because that's where the motivating use case came from, but it does not depend on it and knows nothing about it.

## Nodes

- **fcm-config** (config node) — the Firebase app you're targeting: its package/bundle id plus the app's `projectId`, `appId`, `apiKey` and `messagingSenderId`. All five are blank by default and required. It owns one `PushReceiver` connection, shared by every **fcm-receive** node that references it, and persists the FCM registration it obtains as its own credentials so a restart resumes that registration instead of creating a new one. The connection is opened when the first **fcm-receive** node subscribes and closed again when the last one goes away.
- **fcm-receive** — has no input; it emits on its own, on two outputs:
  - **output 1 (token)** — `msg.payload` is the current FCM registration token, sent once on connect and again every time the library rotates it. `msg.credentials` carries the full registration it came from. Wire this into whatever "register this token" call the app's backend expects — and note that it fires again on rotation, so re-register on every message rather than just the first.
  - **output 2 (message)** — `msg.payload` is the received FCM message (the envelope's `message`, so a data message's fields are under `msg.payload.data`), `msg.persistentId` its persistent id, and `msg.fcm` the raw `{ message, persistentId }` envelope.

Messages are passed through untouched — decoding an app's payload is the job of whatever you wire output 2 into.

## Getting your app's Firebase identifiers

The four Firebase values plus the bundle id belong to the app you're targeting, and this package ships no defaults for them. For an Android app they are ordinary app resources, not obfuscated or encrypted:

1. Get the app's APK (e.g. from APKMirror) matching your device's architecture. If you got an `.apkm` bundle, `unzip` out `base.apk` from it first.
2. Decode it with [`apktool`](https://apktool.org/): `apktool d -s -f base.apk -o decoded` (`-s` skips the slow smali disassembly, which isn't needed here).
3. Look in `decoded/res/values/strings.xml` for `project_id`, `google_app_id`, `google_api_key` and `gcm_defaultSenderId`. Some apps instead bundle a `google-services.json` carrying the same values.

The bundle id is the app's package name (the `applicationId`, e.g. as shown in its Play Store URL).

These identify a Firebase project to Google. They are not authentication secrets — Google's own security model puts access control server-side — but they *are* someone else's app identifiers, so this package keeps them out of its code, its docs and its tests, and stores yours only in your own flow.

> **A note on where they end up:** the five settings live in your flow file (`flows.json`), not in the credentials file. Only the FCM registration obtained with them is stored as credentials. Keep that in mind before sharing an exported flow.

## Credential persistence

Node-RED credentials (`RED.nodes.addCredentials`, which is how the registration is stored) only update an in-memory cache — they are written to `<userDir>/flows_cred.json` on disk exclusively as part of a **Deploy**. There is no lighter-weight way for a node to persist just its own credentials; this is true of every Node-RED node.

So, for **fcm-config**:

- The first registration works immediately, but is only durable once you click **Deploy**. Without one, the next restart registers from scratch and you get a different token.
- The library rotates the registration periodically, which is exactly the same situation: live right away, durable only after the next Deploy.
- The status reflects this: a solid **green** dot means the registration in use is the one loaded from disk; a **yellow** dot means it has changed since and isn't saved yet.

## Example: pairing this with `@bastianh/node-red-cookidoo`

Purely as an illustration of how the two compose — this package has no dependency on, or knowledge of, the Cookidoo one. Cookidoo pushes live appliance cook state as an FCM data message, so with this package's nodes pointed at Cookidoo's own Firebase app:

```
[fcm-config] --- [fcm-receive] --1 token---> [cookidoo-devices: register-push-token]
                              \--2 message--> [cookidoo-devices: decode-push] --> ...
```

Output 1 goes into `cookidoo-devices`'s `register-push-token` operation (a Function node in between to shape `msg.payload` into `{ pushToken, mobileAppId }`, with a UUID of your own that stays stable as `mobileAppId`), and output 2 into its `decode-push` operation, which turns the message into a `CookidooCookingActivity` and drops anything that carries no cook state. Any other backend with a "register this token" call works the same way.

## Installation

Not on npm yet — the package is marked `private` until its first release, so a release run can't publish it by accident. Once it is published:

```bash
cd ~/.node-red
npm install @bastianh/node-red-fcm
```

Until then, try it through the [`docker-compose.yml`](../../docker-compose.yml) setup described below.

## Development

From the repo root:

```bash
pnpm install
pnpm --filter @bastianh/node-red-fcm test
```

The tests stub the FCM client out entirely; nothing in this package's test suite talks to Google. For manual, interactive testing in an actual Node-RED editor, see the [`docker-compose.yml`](../../docker-compose.yml) at the repo root.

## Credits

Built on [`@eneris/push-receiver`](https://www.npmjs.com/package/@eneris/push-receiver) (MIT), which does the actual GCM check-in, Firebase registration and MCS connection work.
