"use strict";

module.exports = function (RED) {
  /**
   * Removes all additional items, ingredients and recipes from the shopping
   * list. Kept as its own node -- deliberately not one more entry in the
   * other shopping nodes' operation dropdowns -- since it's a destructive,
   * whole-list action that shouldn't be a stray dropdown selection away.
   */
  function CookidooClearShoppingListNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      if (!node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      try {
        const client = await node.cookidooConfig.getClient();
        await client.clearShoppingList();
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-clear-shopping-list", CookidooClearShoppingListNode);
};
