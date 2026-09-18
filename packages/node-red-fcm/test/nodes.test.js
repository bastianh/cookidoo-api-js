"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const fcmConfigModule = require("../nodes/fcm-config.js");
const fcmReceiveModule = require("../nodes/fcm-receive.js");

const FIREBASE = {
  bundleId: "com.example.app",
  projectId: "your-project-id",
  appId: "your-app-id",
  apiKey: "your-api-key",
  messagingSenderId: "your-messaging-sender-id",
};

/**
 * A fake of the bits of the RED runtime these nodes touch: node
 * registration/instantiation, a credentials store and the `close` handler.
 * Good enough to exercise the nodes without a real Node-RED runtime.
 */
function createFakeRed() {
  const registered = {};
  const credentialsStore = {};
  const instances = {};

  return {
    nodes: {
      registerType(type, ctor, opts) {
        registered[type] = { ctor, opts };
      },
      createNode(node, config) {
        node.id = config.id;
        node.type = config.type;
        node.credentials = credentialsStore[node.id] || {};
        node.statuses = [];
        node.errors = [];
        node.sent = [];
        node.status = (s) => node.statuses.push(s);
        node.error = (e) => node.errors.push(e);
        node.send = (m) => node.sent.push(m);
        node._handlers = {};
        node.on = (event, handler) => {
          node._handlers[event] = handler;
        };
      },
      getNode(id) {
        return instances[id] || null;
      },
      addCredentials(id, creds) {
        credentialsStore[id] = creds;
      },
    },
    // Test-only helpers below, not part of the real RED API.
    _registered: registered,
    _credentialsStore: credentialsStore,
    _instantiate(type, id, config = {}) {
      const entry = registered[type];
      if (!entry) throw new Error(`type not registered: ${type}`);
      const node = {};
      entry.ctor.call(node, { id, type, ...config });
      instances[id] = node;
      return node;
    },
  };
}

/**
 * Replaces the real `PushReceiver` for the duration of a test. Returns the
 * receivers handed out so far plus a `restore()` -- nothing here ever reaches
 * Google's servers.
 */
function stubReceiverFactory({ connectError = null } = {}) {
  const original = fcmConfigModule.receiverFactory.create;
  const instances = [];

  fcmConfigModule.receiverFactory.create = (clientConfig) => {
    const credentialsListeners = [];
    const notificationListeners = [];
    // Mirrors the real client: tearing it down before it ever became ready
    // rejects `whenReady`. Nothing attaches to that promise on its own, so
    // any test that destroys a receiver would take the whole run down with
    // an unhandled rejection if the node stopped claiming it.
    let rejectReady;
    const receiver = {
      clientConfig,
      fcmToken: "token-from-connect",
      connectCount: 0,
      destroyed: false,
      whenReady: new Promise((_resolve, reject) => {
        rejectReady = reject;
      }),
      onCredentialsChanged(listener) {
        credentialsListeners.push(listener);
        return () => {};
      },
      onNotification(listener) {
        notificationListeners.push(listener);
        return () => {};
      },
      connect: async () => {
        receiver.connectCount += 1;
        if (connectError) throw connectError;
      },
      destroy: () => {
        receiver.destroyed = true;
        rejectReady(new Error("Client destroyed"));
      },
      // Test-only emitters.
      _rotateCredentials(newCredentials) {
        for (const listener of credentialsListeners) listener({ newCredentials });
      },
      _pushMessage(envelope) {
        for (const listener of notificationListeners) listener(envelope);
      },
    };
    instances.push(receiver);
    return receiver;
  };

  return {
    instances,
    restore() {
      fcmConfigModule.receiverFactory.create = original;
    },
  };
}

/** Collects what a subscriber is told, for the config-node tests. */
function collectingSubscriber() {
  const events = [];
  return {
    events,
    handlers: {
      onToken: (data) => events.push({ event: "token", data }),
      onMessage: (data) => events.push({ event: "message", data }),
      onConnect: () => events.push({ event: "connect" }),
      onError: (err) => events.push({ event: "error", data: err }),
    },
  };
}

/** Lets the config node's `connect().then(...)` chain settle. */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function setup(options) {
  const RED = createFakeRed();
  fcmConfigModule(RED);
  fcmReceiveModule(RED);
  return { RED, receivers: stubReceiverFactory(options) };
}

test("fcm-config registers the config node type with a credentials spec", () => {
  const RED = createFakeRed();
  fcmConfigModule(RED);
  assert.ok(RED._registered["fcm-config"], "fcm-config should be registered");
  assert.deepEqual(RED._registered["fcm-config"].opts, {
    credentials: { fcmCredentials: { type: "password" } },
  });
});

test("fcm-config ships no defaults for the Firebase identifiers", () => {
  const RED = createFakeRed();
  fcmConfigModule(RED);
  const node = RED._instantiate("fcm-config", "cfg-empty", {});

  assert.equal(node.configured, false);
  assert.equal(node.bundleId, "");
  assert.deepEqual(node.firebase, {
    projectId: "",
    appId: "",
    apiKey: "",
    messagingSenderId: "",
  });
});

test("an unconfigured fcm-config reports an error instead of connecting", async () => {
  const { RED, receivers } = setup();
  try {
    const node = RED._instantiate("fcm-config", "cfg-unconfigured", { bundleId: "com.example.app" });
    const subscriber = collectingSubscriber();
    node.subscribe(subscriber.handlers);
    await flush();

    assert.equal(receivers.instances.length, 0, "no receiver should be created");
    const error = subscriber.events.find((e) => e.event === "error");
    assert.ok(error, "subscriber should be told about the missing settings");
    assert.match(error.data.message, /projectId, appId, apiKey, messagingSenderId/);
  } finally {
    receivers.restore();
  }
});

test("fcm-config connects on the first subscriber and announces the token", async () => {
  const { RED, receivers } = setup();
  try {
    const node = RED._instantiate("fcm-config", "cfg-connect", FIREBASE);
    assert.equal(receivers.instances.length, 0, "must not dial out before being subscribed to");

    const subscriber = collectingSubscriber();
    node.subscribe(subscriber.handlers);
    await flush();

    assert.equal(receivers.instances.length, 1);
    assert.deepEqual(receivers.instances[0].clientConfig, {
      bundleId: FIREBASE.bundleId,
      firebase: {
        projectId: FIREBASE.projectId,
        appId: FIREBASE.appId,
        apiKey: FIREBASE.apiKey,
        messagingSenderId: FIREBASE.messagingSenderId,
      },
    });
    const token = subscriber.events.find((e) => e.event === "token");
    assert.equal(token.data.token, "token-from-connect");
    assert.equal(token.data.persisted, false);
  } finally {
    receivers.restore();
  }
});

test("a second subscriber shares the one connection and gets the token too", async () => {
  const { RED, receivers } = setup();
  try {
    const node = RED._instantiate("fcm-config", "cfg-shared", FIREBASE);
    const first = collectingSubscriber();
    const second = collectingSubscriber();
    const unsubscribeFirst = node.subscribe(first.handlers);
    node.subscribe(second.handlers);
    await flush();

    assert.equal(receivers.instances.length, 1, "one receiver for both subscribers");
    receivers.instances[0]._pushMessage({ message: { data: { a: 1 } }, persistentId: "p1" });
    assert.ok(first.events.some((e) => e.event === "message"));
    assert.ok(second.events.some((e) => e.event === "message"));

    unsubscribeFirst();
    assert.equal(receivers.instances[0].destroyed, false, "still one subscriber left");
  } finally {
    receivers.restore();
  }
});

test("fcm-config restores stored credentials and reports them as persisted", async () => {
  const { RED, receivers } = setup();
  try {
    const stored = { fcm: { token: "stored-token" } };
    RED._credentialsStore["cfg-restored"] = { fcmCredentials: JSON.stringify(stored) };
    const node = RED._instantiate("fcm-config", "cfg-restored", FIREBASE);
    assert.equal(node.credentialsPersisted, true);

    const subscriber = collectingSubscriber();
    node.subscribe(subscriber.handlers);
    await flush();

    assert.deepEqual(receivers.instances[0].clientConfig.credentials, stored);
    const token = subscriber.events.find((e) => e.event === "token");
    assert.equal(token.data.persisted, true);
  } finally {
    receivers.restore();
  }
});

test("stored credentials that are not valid JSON are reported, not thrown", () => {
  const RED = createFakeRed();
  fcmConfigModule(RED);
  RED._credentialsStore["cfg-broken"] = { fcmCredentials: "{not json" };
  const node = RED._instantiate("fcm-config", "cfg-broken", FIREBASE);

  assert.equal(node.credentialsPersisted, false);
  assert.ok(node.statuses.some((s) => s.fill === "red" && /invalid stored/i.test(s.text)));
});

test("rotated credentials are persisted and re-announced as not-yet-saved", async () => {
  const { RED, receivers } = setup();
  try {
    RED._credentialsStore["cfg-rotate"] = {
      fcmCredentials: JSON.stringify({ fcm: { token: "old-token" } }),
    };
    const node = RED._instantiate("fcm-config", "cfg-rotate", FIREBASE);
    const subscriber = collectingSubscriber();
    node.subscribe(subscriber.handlers);
    await flush();

    const rotated = { fcm: { token: "rotated-token" } };
    receivers.instances[0]._rotateCredentials(rotated);

    assert.deepEqual(JSON.parse(RED._credentialsStore["cfg-rotate"].fcmCredentials), rotated);
    assert.equal(node.credentialsPersisted, false);
    const tokens = subscriber.events.filter((e) => e.event === "token");
    assert.equal(tokens.at(-1).data.token, "rotated-token");
    assert.equal(tokens.at(-1).data.persisted, false);
    assert.ok(node.statuses.some((s) => s.fill === "yellow" && /deploy to save/.test(s.text)));
  } finally {
    receivers.restore();
  }
});

test("a failing connect is reported to subscribers rather than left hanging", async () => {
  const RED = createFakeRed();
  fcmConfigModule(RED);
  const receivers = stubReceiverFactory({ connectError: new Error("registration refused") });
  try {
    const node = RED._instantiate("fcm-config", "cfg-failing", FIREBASE);
    const subscriber = collectingSubscriber();
    node.subscribe(subscriber.handlers);
    await flush();

    const error = subscriber.events.find((e) => e.event === "error");
    assert.equal(error.data.message, "registration refused");
    assert.equal(node.receiver, null);
  } finally {
    receivers.restore();
  }
});

test("the connection is closed when the last subscriber leaves and on close", async () => {
  const { RED, receivers } = setup();
  try {
    const node = RED._instantiate("fcm-config", "cfg-stop", FIREBASE);
    const unsubscribe = node.subscribe(collectingSubscriber().handlers);
    await flush();
    unsubscribe();
    assert.equal(receivers.instances[0].destroyed, true);

    node.subscribe(collectingSubscriber().handlers);
    await flush();
    assert.equal(receivers.instances.length, 2, "re-subscribing reconnects");
    let closed = false;
    node._handlers.close(() => {
      closed = true;
    });
    assert.equal(receivers.instances[1].destroyed, true);
    assert.ok(closed);
  } finally {
    receivers.restore();
  }
});

test("fcm-receive sends the token on output 1 and messages on output 2", async () => {
  const { RED, receivers } = setup();
  try {
    RED._instantiate("fcm-config", "cfg1", FIREBASE);
    const node = RED._instantiate("fcm-receive", "n1", { fcm: "cfg1" });
    await flush();

    assert.deepEqual(node.sent[0][1], null, "a token must not go out of output 2");
    assert.equal(node.sent[0][0].payload, "token-from-connect");
    assert.equal(node.sent[0][0].topic, "fcm-token");

    const envelope = { message: { data: { hello: "world" } }, persistentId: "p1" };
    receivers.instances[0]._pushMessage(envelope);

    assert.deepEqual(node.sent[1][0], null, "a message must not go out of output 1");
    assert.deepEqual(node.sent[1][1].payload, envelope.message);
    assert.equal(node.sent[1][1].persistentId, "p1");
    assert.deepEqual(node.sent[1][1].fcm, envelope);
  } finally {
    receivers.restore();
  }
});

test("fcm-receive shows a green status only once the token is on disk", async () => {
  const { RED, receivers } = setup();
  try {
    RED._credentialsStore["cfg2"] = {
      fcmCredentials: JSON.stringify({ fcm: { token: "stored-token" } }),
    };
    RED._instantiate("fcm-config", "cfg2", FIREBASE);
    const node = RED._instantiate("fcm-receive", "n2", { fcm: "cfg2" });
    await flush();
    assert.deepEqual(node.statuses.at(-1), { fill: "green", shape: "dot", text: "connected" });

    receivers.instances[0]._rotateCredentials({ fcm: { token: "rotated-token" } });
    assert.equal(node.statuses.at(-1).fill, "yellow");
    assert.match(node.statuses.at(-1).text, /deploy to save/);
  } finally {
    receivers.restore();
  }
});

test("fcm-receive without a config node errors instead of silently doing nothing", () => {
  const { RED, receivers } = setup();
  try {
    const node = RED._instantiate("fcm-receive", "n3", { fcm: "" });
    assert.equal(node.errors.length, 1);
    assert.match(node.errors[0], /no FCM config/i);
    assert.equal(node.statuses.at(-1).fill, "red");
  } finally {
    receivers.restore();
  }
});

test("fcm-receive unsubscribes on close", async () => {
  const { RED, receivers } = setup();
  try {
    RED._instantiate("fcm-config", "cfg3", FIREBASE);
    const node = RED._instantiate("fcm-receive", "n4", { fcm: "cfg3" });
    await flush();

    let closed = false;
    node._handlers.close(() => {
      closed = true;
    });
    assert.ok(closed);
    assert.equal(receivers.instances[0].destroyed, true, "last subscriber gone, connection closed");
  } finally {
    receivers.restore();
  }
});
