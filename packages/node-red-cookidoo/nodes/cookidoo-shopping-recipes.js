"use strict";

/**
 * Shopping-list operations scoped to recipes and their ingredient items.
 * `msg.payload` is the operation's input (where one is needed) and becomes
 * the operation's result on output. The configured operation can be
 * overridden per message via `msg.operation`.
 */
const OPERATIONS = {
  "get-recipes": (client) => client.getShoppingListRecipes(),
  "get-ingredient-items": (client) => client.getIngredientItems(),
  "add-ingredients": (client, payload) => client.addIngredientItemsForRecipes(payload),
  "remove-ingredients": (client, payload) => client.removeIngredientItemsForRecipes(payload),
  "add-ingredients-custom": (client, payload) =>
    client.addIngredientItemsForCustomRecipes(payload),
  "remove-ingredients-custom": (client, payload) =>
    client.removeIngredientItemsForCustomRecipes(payload),
  "edit-ingredients-ownership": (client, payload) => client.editIngredientItemsOwnership(payload),
};

module.exports = function (RED) {
  function CookidooShoppingRecipesNode(config) {
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
        done(new Error(`cookidoo-shopping-recipes: unknown operation "${operation}".`));
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

  RED.nodes.registerType("cookidoo-shopping-recipes", CookidooShoppingRecipesNode);
};
