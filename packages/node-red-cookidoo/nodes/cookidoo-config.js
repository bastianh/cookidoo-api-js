"use strict";

const { Cookidoo, getLocalizationOptions } = require("cookidoo-api-js");

module.exports = function (RED) {
  /**
   * Holds the Cookidoo credentials/localization and a single, shared,
   * lazily-logged-in `Cookidoo` client. Nodes look this config node up via
   * `RED.nodes.getNode(config.cookidoo)` and call `getClient()` rather than
   * constructing their own client, so a deploy with several Cookidoo nodes
   * still only logs in once.
   */
  function CookidooConfigNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.countryCode = config.countryCode;
    node.language = config.language;
    node.localizationUrl = config.localizationUrl;

    node.client = new Cookidoo(
      {
        localization: {
          countryCode: node.countryCode,
          language: node.language,
          url: node.localizationUrl,
        },
        email: node.credentials.email,
        password: node.credentials.password,
      },
      {
        onAuthDataUpdate: () => {
          node.status({ fill: "green", shape: "dot", text: "logged in" });
        },
      },
    );

    let loginPromise = null;

    /** Resolve to a logged-in Cookidoo client, sharing one in-flight login. */
    node.getClient = async function () {
      if (loginPromise === null) {
        node.status({ fill: "yellow", shape: "ring", text: "logging in..." });
        loginPromise = node.client.login().catch((err) => {
          loginPromise = null;
          node.status({ fill: "red", shape: "dot", text: "login failed" });
          throw err;
        });
      }
      await loginPromise;
      return node.client;
    };
  }

  RED.nodes.registerType("cookidoo-config", CookidooConfigNode, {
    credentials: {
      email: { type: "text" },
      password: { type: "password" },
    },
  });

  RED.httpAdmin.get(
    "/cookidoo-api-js/localizations",
    RED.auth.needsPermission("cookidoo-config.read"),
    function (_req, res) {
      res.json(getLocalizationOptions());
    },
  );
};
