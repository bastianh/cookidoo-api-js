"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const cookidooApiJs = require("cookidoo-api-js");

/**
 * A fake of the bits of the RED runtime object these nodes touch: node
 * registration/instantiation, a credentials store, and admin HTTP routes.
 * Good enough to exercise the nodes' logic without a real Node-RED runtime.
 */
function createFakeRed() {
  const registered = {};
  const httpAdminRoutes = { get: [], post: [] };
  const credentialsStore = {};
  const instances = {};

  return {
    nodes: {
      registerType(type, ctor, opts) {
        registered[type] = { ctor, opts };
      },
      createNode(node, config) {
        node.id = config.id;
        node.type = config.type;
        node.credentials = credentialsStore[node.id] || config.credentials || {};
        node.status = () => {};
        node.on = () => {};
      },
      getNode(id) {
        return instances[id] || null;
      },
      addCredentials(id, creds) {
        credentialsStore[id] = creds;
      },
    },
    httpAdmin: {
      get(path, ...handlers) {
        httpAdminRoutes.get.push({ path, handler: handlers[handlers.length - 1] });
      },
      post(path, ...handlers) {
        httpAdminRoutes.post.push({ path, handler: handlers[handlers.length - 1] });
      },
    },
    auth: {
      needsPermission: () => (_req, _res, next) => next && next(),
    },
    // Test-only helpers below, not part of the real RED API.
    _routes: httpAdminRoutes,
    _credentialsStore: credentialsStore,
    _instantiate(type, id, config = {}) {
      const entry = registered[type];
      if (!entry) throw new Error(`type not registered: ${type}`);
      const node = {};
      entry.ctor.call(node, { id, type, ...config });
      instances[id] = node;
      return node;
    },
  };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
  };
  return res;
}

const DEFAULT_LOCALIZATION = {
  countryCode: "ch",
  language: "de-CH",
  localizationUrl: "https://cookidoo.ch/foundation/de-CH",
};

test("cookidoo-config registers the config node type and its routes", () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);

  RED._instantiate("cookidoo-config", "cfg-registration", DEFAULT_LOCALIZATION);
  assert.ok(
    RED._routes.get.some((r) => r.path === "/cookidoo-api-js/localizations"),
    "localizations route should be registered",
  );
  assert.ok(
    RED._routes.post.some((r) => r.path === "/cookidoo-api-js/login"),
    "login route should be registered",
  );
});

test("cookidoo-get-user-info registers its node type", () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-get-user-info.js")(RED);
  RED._instantiate("cookidoo-get-user-info", "n1");
  // Instantiating successfully (registerType having been called) is enough
  // of a smoke test here; the real behaviour is exercised via getClient().
});

test("getClient() rejects when the node has never been logged in", async () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);
  const node = RED._instantiate("cookidoo-config", "cfg-nologin", DEFAULT_LOCALIZATION);

  assert.equal(node.client.authData, null);
  await assert.rejects(() => node.getClient(), /not logged in/i);
});

test("a config node restores previously stored tokens on startup", async () => {
  const RED = createFakeRed();
  RED._credentialsStore["cfg-restored"] = {
    email: "a@b.com",
    authData: JSON.stringify({
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      expiresAt: Date.now() / 1000 + 3600,
    }),
  };
  require("../nodes/cookidoo-config.js")(RED);
  const node = RED._instantiate("cookidoo-config", "cfg-restored", DEFAULT_LOCALIZATION);

  assert.equal(node.client.authData.accessToken, "stored-access");
  const client = await node.getClient();
  assert.equal(client, node.client);
});

test("POST /login persists only the tokens (never the password) and updates a live node", async () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);
  const node = RED._instantiate("cookidoo-config", "cfg-login", DEFAULT_LOCALIZATION);
  assert.equal(node.client.authData, null);

  const originalLogin = cookidooApiJs.Cookidoo.prototype.login;
  cookidooApiJs.Cookidoo.prototype.login = async function () {
    // Stand in for the real OAuth2/PKCE exchange against Cookidoo's servers.
    this.applyAuthData({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: Date.now() / 1000 + 3600,
    });
  };

  try {
    const loginRoute = RED._routes.post.find((r) => r.path === "/cookidoo-api-js/login");
    const req = {
      body: { id: "cfg-login", email: "a@b.com", password: "s3cr3t", ...DEFAULT_LOCALIZATION },
    };
    const res = fakeRes();
    await loginRoute.handler(req, res);

    assert.deepEqual(res.body, { success: true });

    const stored = RED._credentialsStore["cfg-login"];
    assert.equal(stored.email, "a@b.com");
    assert.equal(stored.password, undefined, "the password must never be persisted");
    assert.deepEqual(JSON.parse(stored.authData), {
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: JSON.parse(stored.authData).expiresAt,
    });

    // The already-deployed node's live client is updated immediately.
    assert.equal(node.client.authData.accessToken, "fresh-access");
    await node.getClient();
  } finally {
    cookidooApiJs.Cookidoo.prototype.login = originalLogin;
  }
});

test("POST /login rejects a request missing email or password", async () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);

  const loginRoute = RED._routes.post.find((r) => r.path === "/cookidoo-api-js/login");
  const req = { body: { id: "cfg-missing", email: "a@b.com", ...DEFAULT_LOCALIZATION } };
  const res = fakeRes();
  await loginRoute.handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(RED._credentialsStore["cfg-missing"], undefined);
});

test("POST /login surfaces a login failure and stores nothing", async () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);

  const originalLogin = cookidooApiJs.Cookidoo.prototype.login;
  cookidooApiJs.Cookidoo.prototype.login = async function () {
    throw new cookidooApiJs.CookidooAuthException("invalid credentials");
  };

  try {
    const loginRoute = RED._routes.post.find((r) => r.path === "/cookidoo-api-js/login");
    const req = {
      body: { id: "cfg-badlogin", email: "a@b.com", password: "wrong", ...DEFAULT_LOCALIZATION },
    };
    const res = fakeRes();
    await loginRoute.handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /invalid credentials/);
    assert.equal(RED._credentialsStore["cfg-badlogin"], undefined);
  } finally {
    cookidooApiJs.Cookidoo.prototype.login = originalLogin;
  }
});
