"use strict";

const { cookidooCookingActivityFromPush } = require("cookidoo-api-js");

/**
 * Paired-appliance and remote-monitoring (push-token) operations.
 * `msg.payload` is the operation's input (where one is needed) and becomes
 * the operation's result on output. The configured operation can be
 * overridden per message via `msg.operation`.
 *
 * `decode-push` is the odd one out: it doesn't call the Cookidoo API at
 * all. Appliance state arrives out of band as a Firebase Cloud Messaging
 * data message, obtained and received by your own FCM client -- this node
 * only decodes an already-received payload. See the node's help.
 */
const OPERATIONS = {
  "get-devices": (client) => client.getDevices(),
  "get-monitored-device-ids": (client) => client.getMonitoredDeviceIds(),
  "register-push-token": (client, payload) =>
    client.registerPushToken(payload.pushToken, payload.mobileAppId),
  "unregister-push-token": (client, payload) => client.unregisterPushToken(payload),
  "decode-push": (client, payload) => cookidooCookingActivityFromPush(payload),
};

module.exports = function (RED) {
  function CookidooDevicesNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.operation = config.operation;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      const operation = msg.operation || node.operation;
      const handler = OPERATIONS[operation];
      if (!handler) {
        done(new Error(`cookidoo-devices: unknown operation "${operation}".`));
        return;
      }
      if (operation !== "decode-push" && !node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      try {
        const client = node.cookidooConfig ? await node.cookidooConfig.getClient() : null;
        msg.payload = await handler(client, msg.payload);
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-devices", CookidooDevicesNode);
};
