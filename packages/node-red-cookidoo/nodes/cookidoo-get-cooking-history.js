"use strict";

module.exports = function (RED) {
  /**
   * Fetches the signed-in user's cooking history ("last cooked") on every
   * input message. The service returns the whole history in one response,
   * newest entry first; it takes no pagination parameters.
   */
  function CookidooGetCookingHistoryNode(config) {
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
        msg.payload = await client.getCookingHistory();
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-get-cooking-history", CookidooGetCookingHistoryNode);
};
