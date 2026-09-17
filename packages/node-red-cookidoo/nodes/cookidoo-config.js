"use strict";

const { Cookidoo, getLocalizationOptions } = require("cookidoo-api-js");

/**
 * Read and JSON-parse a request body without depending on whatever (if any)
 * body-parsing middleware Node-RED's admin app happens to have installed --
 * `req.body` is used if something already parsed it, otherwise the raw
 * stream is read directly.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      resolve(req.body);
      return;
    }
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

module.exports = function (RED) {
  /**
   * Holds the Cookidoo localization and the OAuth2 tokens obtained via the
   * "Login" button in the editor. The account password is never persisted:
   * it is only ever sent, transiently, to the `/login` admin route below,
   * which performs the login and stores just the resulting tokens.
   *
   * Constructs a single, shared `Cookidoo` client, restoring any previously
   * stored tokens on startup. Nodes look this config node up via
   * `RED.nodes.getNode(config.cookidoo)` and call `getClient()` rather than
   * constructing their own client.
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
      },
      {
        onAuthDataUpdate: (authData) => {
          // The server rotates the refresh token on every refresh; hand the
          // new one to addCredentials so this node keeps working. Node-RED
          // only writes credentials to disk on a Deploy though (there is no
          // public API for a node to do that itself), so this alone does
          // NOT survive a restart -- the status below says as much.
          node.credentials.authData = JSON.stringify(authData);
          RED.nodes.addCredentials(node.id, node.credentials);
          node.status({ fill: "yellow", shape: "dot", text: "token refreshed - deploy to save" });
        },
      },
    );

    if (node.credentials.authData) {
      try {
        // Loaded from disk (this node was already deployed with tokens), so
        // this state is durable -- unlike the yellow ones below.
        node.client.applyAuthData(JSON.parse(node.credentials.authData));
        node.status({ fill: "green", shape: "dot", text: "logged in" });
      } catch {
        node.status({ fill: "red", shape: "ring", text: "invalid stored token" });
      }
    } else {
      node.status({ fill: "grey", shape: "ring", text: "not logged in" });
    }

    /** Resolve to a logged-in Cookidoo client, or throw if none is set up yet. */
    node.getClient = async function () {
      if (!node.client.authData) {
        throw new Error(
          "Cookidoo: not logged in. Open this config node in the editor and click Login.",
        );
      }
      return node.client;
    };
  }

  RED.nodes.registerType("cookidoo-config", CookidooConfigNode, {
    credentials: {
      email: { type: "text" },
      // A JSON-stringified CookidooAuthData ({accessToken, refreshToken,
      // expiresAt}). Never bound to an editor input: it is only ever set
      // server-side, either by the /login route below or by the
      // onAuthDataUpdate refresh callback above.
      authData: { type: "password" },
    },
  });

  RED.httpAdmin.get(
    "/cookidoo-api-js/localizations",
    RED.auth.needsPermission("cookidoo-config.read"),
    function (_req, res) {
      res.json(getLocalizationOptions());
    },
  );

  /**
   * Performs a one-off Cookidoo login with the posted email/password and
   * stashes only the resulting OAuth2 tokens as this node's credentials --
   * the password is used for this one request and never stored. If the
   * config node is already deployed, its live client is updated immediately
   * so running flows pick up the new tokens right away.
   *
   * Note this does NOT itself persist anything to disk: like all Node-RED
   * credentials, that only happens on a Deploy (there is no public API for
   * a node to trigger that on its own) -- the client-side success message
   * and this node's status both say so.
   */
  RED.httpAdmin.post(
    "/cookidoo-api-js/login",
    RED.auth.needsPermission("cookidoo-config.write"),
    async function (req, res) {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        res.status(400).json({ success: false, message: "Invalid request body." });
        return;
      }

      const { id, email, password, countryCode, language, localizationUrl } = body;
      if (!id || !email || !password) {
        res.status(400).json({ success: false, message: "Missing id, email or password." });
        return;
      }

      try {
        const client = new Cookidoo({
          localization: { countryCode, language, url: localizationUrl },
          email,
          password,
        });
        await client.login();

        const credentials = { email, authData: JSON.stringify(client.authData) };
        RED.nodes.addCredentials(id, credentials);

        const existingNode = RED.nodes.getNode(id);
        if (existingNode && existingNode.type === "cookidoo-config") {
          existingNode.credentials = credentials;
          existingNode.client.applyAuthData(client.authData);
          existingNode.status({ fill: "yellow", shape: "dot", text: "logged in - deploy to save" });
        }

        res.json({ success: true });
      } catch (err) {
        res.status(400).json({ success: false, message: err.message });
      }
    },
  );
};
