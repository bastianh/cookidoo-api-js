"use strict";

const { PushReceiver } = require("@eneris/push-receiver");

/**
 * Test seam. `PushReceiver`'s `connect`/`destroy` are instance class fields,
 * not prototype methods, so they cannot be stubbed on the prototype -- tests
 * replace `create` instead so nothing ever talks to Google's servers.
 */
const receiverFactory = {
  create: (clientConfig) => new PushReceiver(clientConfig),
};

/** Every field the user has to supply; none of them has a default. */
const REQUIRED_FIELDS = ["bundleId", "projectId", "appId", "apiKey", "messagingSenderId"];

module.exports = function (RED) {
  /**
   * Holds the Firebase app identifiers of whatever app you are receiving push
   * for, plus the FCM registration credentials obtained with them. Owns a
   * single `PushReceiver` shared by every `fcm-receive` node pointing at this
   * config node.
   *
   * The connection is opened lazily, on the first `subscribe()` call, and
   * closed again once the last subscriber goes away (the same way Node-RED's
   * own MQTT broker config node works) -- a config node nothing references
   * never dials out.
   */
  function FcmConfigNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.bundleId = (config.bundleId || "").trim();
    node.firebase = {
      projectId: (config.projectId || "").trim(),
      appId: (config.appId || "").trim(),
      apiKey: (config.apiKey || "").trim(),
      messagingSenderId: (config.messagingSenderId || "").trim(),
    };

    const missing = REQUIRED_FIELDS.filter(
      (field) => !(field === "bundleId" ? node.bundleId : node.firebase[field]),
    );
    node.configured = missing.length === 0;

    node.receiver = null;
    // Whether the credentials currently in use are the ones on disk. Node-RED
    // only writes credentials out as part of a Deploy, so a registration made
    // or rotated at runtime is live but not yet durable -- which is the whole
    // green/yellow distinction below.
    node.credentialsPersisted = false;

    const subscribers = new Set();
    let storedCredentials = null;
    let starting = null;

    if (node.credentials.fcmCredentials) {
      try {
        storedCredentials = JSON.parse(node.credentials.fcmCredentials);
        node.credentialsPersisted = true;
        node.status({ fill: "green", shape: "ring", text: "registered - not connected" });
      } catch {
        node.status({ fill: "red", shape: "ring", text: "invalid stored credentials" });
      }
    } else if (node.configured) {
      node.status({ fill: "grey", shape: "ring", text: "not registered" });
    } else {
      node.status({ fill: "grey", shape: "ring", text: "not configured" });
    }

    function notify(event, ...args) {
      for (const handlers of subscribers) {
        try {
          handlers[event]?.(...args);
        } catch (err) {
          node.error(err);
        }
      }
    }

    function emitToken(token) {
      if (!token) return;
      notify("onToken", {
        token,
        credentials: storedCredentials,
        persisted: node.credentialsPersisted,
      });
    }

    /**
     * The library rotates the FCM registration periodically. Hand the new
     * credentials to `addCredentials` so they survive the next Deploy, and
     * tell subscribers the token changed -- whatever backend this token was
     * registered with has to be told about the new one.
     */
    function onCredentialsChanged({ newCredentials }) {
      storedCredentials = newCredentials;
      node.credentialsPersisted = false;
      node.credentials.fcmCredentials = JSON.stringify(newCredentials);
      RED.nodes.addCredentials(node.id, node.credentials);
      node.status({ fill: "yellow", shape: "dot", text: "token changed - deploy to save" });
      emitToken(newCredentials?.fcm?.token);
    }

    function start() {
      if (starting) return starting;
      if (!node.configured) {
        const err = new Error(
          `fcm-config: missing required setting(s): ${missing.join(", ")}. Open this config node in the editor and fill in your Firebase app's identifiers.`,
        );
        node.status({ fill: "red", shape: "ring", text: "not configured" });
        notify("onError", err);
        return Promise.resolve();
      }

      const receiver = receiverFactory.create({
        bundleId: node.bundleId,
        firebase: { ...node.firebase },
        ...(storedCredentials ? { credentials: storedCredentials } : {}),
      });
      node.receiver = receiver;
      receiver.onCredentialsChanged(onCredentialsChanged);
      receiver.onNotification((envelope) => notify("onMessage", envelope));

      node.status({ fill: "yellow", shape: "ring", text: "connecting" });
      starting = receiver
        .connect()
        .then(() => {
          node.status(
            node.credentialsPersisted
              ? { fill: "green", shape: "dot", text: "connected" }
              : { fill: "yellow", shape: "dot", text: "token changed - deploy to save" },
          );
          notify("onConnect");
          // A restored registration does not fire onCredentialsChanged, so
          // the token is announced here rather than only from that callback.
          emitToken(receiver.fcmToken);
        })
        .catch((err) => {
          starting = null;
          node.receiver = null;
          node.status({ fill: "red", shape: "ring", text: "connect failed" });
          notify("onError", err);
        });
      return starting;
    }

    function stop() {
      starting = null;
      const receiver = node.receiver;
      node.receiver = null;
      if (!receiver) return;
      // `destroy()` rejects the receiver's internal "ready" promise with
      // `Client destroyed` when it is torn down before it ever connected --
      // which, with nothing attached to it, is an unhandled rejection that
      // takes the whole Node-RED process down. Claiming it here first makes
      // the teardown a non-event. (Seen for real: deploy a config node with
      // an unreachable Firebase project, then deploy it away again.)
      receiver.whenReady?.catch(() => {});
      try {
        receiver.destroy();
      } catch (err) {
        node.error(err);
      }
    }

    /**
     * Register for this config node's token and push messages, connecting on
     * the first subscriber. `handlers` may provide `onToken`, `onMessage`,
     * `onConnect` and `onError`. Returns a function that unsubscribes again,
     * closing the connection once nothing is listening any more.
     */
    node.subscribe = function (handlers) {
      subscribers.add(handlers);
      start();
      return function unsubscribe() {
        subscribers.delete(handlers);
        if (subscribers.size === 0) stop();
      };
    };

    node.on("close", function (done) {
      stop();
      done();
    });
  }

  RED.nodes.registerType("fcm-config", FcmConfigNode, {
    credentials: {
      // A JSON-stringified `Credentials` from @eneris/push-receiver. Never
      // bound to an editor input: it is only ever written by the rotation
      // callback above.
      fcmCredentials: { type: "password" },
    },
  });
};

module.exports.receiverFactory = receiverFactory;
