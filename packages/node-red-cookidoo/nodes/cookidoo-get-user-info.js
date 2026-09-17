"use strict";

module.exports = function (RED) {
  /** Fetches the signed-in user's Cookidoo profile on every input message. */
  function CookidooGetUserInfoNode(config) {
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
        msg.payload = await client.getUserInfo();
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-get-user-info", CookidooGetUserInfoNode);
};
