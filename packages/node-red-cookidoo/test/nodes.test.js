"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

/** A minimal fake of the RED runtime object, just enough for these nodes to register. */
function createFakeRed() {
  const registered = {};
  const httpAdminRoutes = [];
  return {
    registered,
    httpAdminRoutes,
    nodes: {
      registerType(type, ctor) {
        registered[type] = ctor;
      },
      createNode(node, config) {
        Object.assign(node, config);
        node.status = () => {};
        node.on = () => {};
      },
      getNode() {
        return null;
      },
    },
    httpAdmin: {
      get(path, ...handlers) {
        httpAdminRoutes.push({ path, handler: handlers[handlers.length - 1] });
      },
    },
    auth: {
      needsPermission: () => (_req, _res, next) => next && next(),
    },
  };
}

test("cookidoo-config registers the config node type and a localizations route", () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);

  assert.ok(RED.registered["cookidoo-config"], "cookidoo-config should be registered");
  assert.ok(
    RED.httpAdminRoutes.some((r) => r.path === "/cookidoo-api-js/localizations"),
    "localizations route should be registered",
  );
});

test("cookidoo-get-user-info registers its node type", () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-get-user-info.js")(RED);

  assert.ok(
    RED.registered["cookidoo-get-user-info"],
    "cookidoo-get-user-info should be registered",
  );
});

test("cookidoo-config node instance exposes a getClient() function", () => {
  const RED = createFakeRed();
  require("../nodes/cookidoo-config.js")(RED);

  const ConfigCtor = RED.registered["cookidoo-config"];
  const node = {};
  ConfigCtor.call(node, {
    countryCode: "ch",
    language: "de-CH",
    localizationUrl: "https://cookidoo.ch/foundation/de-CH",
    credentials: { email: "a@b.com", password: "secret" },
  });

  assert.equal(typeof node.getClient, "function");
});
