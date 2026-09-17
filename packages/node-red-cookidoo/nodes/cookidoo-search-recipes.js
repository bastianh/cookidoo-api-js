"use strict";

module.exports = function (RED) {
  /**
   * Searches recipes on every input message. `msg.payload` is either a
   * plain search string (shorthand for `{ query: ... }`) or a full
   * CookidooSearchRecipesOptions object; the result is set as `msg.payload`.
   */
  function CookidooSearchRecipesNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      if (!node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      const options = typeof msg.payload === "string" ? { query: msg.payload } : msg.payload || {};
      try {
        const client = await node.cookidooConfig.getClient();
        msg.payload = await client.searchRecipes(options);
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-search-recipes", CookidooSearchRecipesNode);
};
