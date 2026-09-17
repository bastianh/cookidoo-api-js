"use strict";

module.exports = function (RED) {
  /**
   * Fetches a recipe's full details on every input message. `msg.payload`
   * is the recipe id; the result replaces it.
   */
  function CookidooGetRecipeDetailsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      if (!node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      if (typeof msg.payload !== "string" || !msg.payload) {
        done(new Error("cookidoo-get-recipe-details: msg.payload must be a recipe id string."));
        return;
      }
      try {
        const client = await node.cookidooConfig.getClient();
        msg.payload = await client.getRecipeDetails(msg.payload);
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-get-recipe-details", CookidooGetRecipeDetailsNode);
};
