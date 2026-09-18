"use strict";

/**
 * CRUD operations on the signed-in user's managed (Vorwerk-curated) and
 * custom (self-created) recipe collections. `msg.payload` is the
 * operation's input (where one is needed) and becomes the operation's
 * result on output. The configured operation can be overridden per message
 * via `msg.operation`.
 */
const OPERATIONS = {
  "count-managed": (client) => client.countManagedCollections(),
  "get-managed": (client, payload) => client.getManagedCollections(payload),
  "add-managed": (client, payload) => client.addManagedCollection(payload),
  "remove-managed": (client, payload) => client.removeManagedCollection(payload),
  "count-custom": (client) => client.countCustomCollections(),
  "get-custom": (client, payload) => client.getCustomCollections(payload),
  "add-custom": (client, payload) => client.addCustomCollection(payload),
  "remove-custom": (client, payload) => client.removeCustomCollection(payload),
  "add-recipes": (client, payload) =>
    client.addRecipesToCustomCollection(payload.collectionId, payload.recipeIds),
  "remove-recipe": (client, payload) =>
    client.removeRecipeFromCustomCollection(payload.collectionId, payload.recipeId),
};

module.exports = function (RED) {
  function CookidooCollectionsNode(config) {
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
        done(new Error(`cookidoo-collections: unknown operation "${operation}".`));
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

  RED.nodes.registerType("cookidoo-collections", CookidooCollectionsNode);
};
