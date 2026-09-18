"use strict";

/**
 * CRUD operations on the signed-in user's custom recipes. `msg.payload` is
 * the operation's input (where one is needed) and becomes the operation's
 * result on output. The configured operation can be overridden per message
 * via `msg.operation`.
 */
const OPERATIONS = {
  get: (client, payload) => client.getCustomRecipe(payload),
  list: (client) => client.listCustomRecipes(),
  "add-from": (client, payload) =>
    client.addCustomRecipeFrom(payload.recipeId, payload.servingSize),
  remove: (client, payload) => client.removeCustomRecipe(payload),
};

module.exports = function (RED) {
  function CookidooCustomRecipesNode(config) {
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
        done(new Error(`cookidoo-custom-recipes: unknown operation "${operation}".`));
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

  RED.nodes.registerType("cookidoo-custom-recipes", CookidooCustomRecipesNode);
};
