"use strict";

/**
 * Shopping-list operations for additional (not recipe-linked) items.
 * `msg.payload` is the operation's input (where one is needed) and becomes
 * the operation's result on output. The configured operation can be
 * overridden per message via `msg.operation`.
 */
const OPERATIONS = {
  get: (client) => client.getAdditionalItems(),
  add: (client, payload) => client.addAdditionalItems(payload),
  edit: (client, payload) => client.editAdditionalItems(payload),
  "edit-ownership": (client, payload) => client.editAdditionalItemsOwnership(payload),
  remove: (client, payload) => client.removeAdditionalItems(payload),
};

module.exports = function (RED) {
  function CookidooShoppingAdditionalItemsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.operation = config.operation;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      if (!node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      const operation = msg.operation || node.operation;
      const handler = OPERATIONS[operation];
      if (!handler) {
        done(
          new Error(`cookidoo-shopping-additional-items: unknown operation "${operation}".`),
        );
        return;
      }
      try {
        const client = await node.cookidooConfig.getClient();
        msg.payload = await handler(client, msg.payload);
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType(
    "cookidoo-shopping-additional-items",
    CookidooShoppingAdditionalItemsNode,
  );
};
