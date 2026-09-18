"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

/** A minimal fake RED that hands every node the same fixed config node. */
function createFakeRed(cookidooConfigNode) {
  const registered = {};
  return {
    registered,
    nodes: {
      registerType(type, ctor) {
        registered[type] = ctor;
      },
      createNode(node, config) {
        Object.assign(node, config);
        node.status = () => {};
        node._handlers = {};
        node.on = (event, handler) => {
          node._handlers[event] = handler;
        };
      },
      getNode() {
        return cookidooConfigNode;
      },
    },
  };
}

function createFakeClient(methodResults) {
  const calls = [];
  const client = {};
  for (const [name, result] of Object.entries(methodResults)) {
    client[name] = async (...args) => {
      calls.push({ name, args });
      if (result instanceof Error) throw result;
      return result;
    };
  }
  return { client, calls };
}

function instantiate(RED, type, config) {
  const node = {};
  RED.registered[type].call(node, config);
  return node;
}

function runInput(node, msg) {
  return new Promise((resolve, reject) => {
    let sent = null;
    node._handlers.input(
      msg,
      (m) => {
        sent = m;
      },
      (err) => (err ? reject(err) : resolve(sent)),
    );
  });
}

test("cookidoo-collections counts managed collections", async () => {
  const { client, calls } = createFakeClient({
    countManagedCollections: { totalElements: 1, totalPages: 1 },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "count-managed",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(calls[0].args, []);
  assert.deepEqual(msg.payload, { totalElements: 1, totalPages: 1 });
});

test("cookidoo-collections gets managed collections with an optional page", async () => {
  const { client, calls } = createFakeClient({
    getManagedCollections: [{ id: "col1" }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "get-managed",
  });

  const msg = await runInput(node, { payload: 2 });
  assert.deepEqual(calls[0].args, [2]);
  assert.deepEqual(msg.payload, [{ id: "col1" }]);
});

test("cookidoo-collections adds a managed collection from an id", async () => {
  const { client, calls } = createFakeClient({ addManagedCollection: { id: "col1" } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "add-managed",
  });

  await runInput(node, { payload: "col1" });
  assert.deepEqual(calls[0].args, ["col1"]);
});

test("cookidoo-collections removes a managed collection from an id", async () => {
  const { client, calls } = createFakeClient({ removeManagedCollection: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "remove-managed",
  });

  await runInput(node, { payload: "col1" });
  assert.deepEqual(calls[0].args, ["col1"]);
});

test("cookidoo-collections counts custom collections", async () => {
  const { client } = createFakeClient({
    countCustomCollections: { totalElements: 1, totalPages: 1 },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "count-custom",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(msg.payload, { totalElements: 1, totalPages: 1 });
});

test("cookidoo-collections gets custom collections", async () => {
  const { client, calls } = createFakeClient({ getCustomCollections: [{ id: "cus1" }] });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "get-custom",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(calls[0].args, [undefined]);
  assert.deepEqual(msg.payload, [{ id: "cus1" }]);
});

test("cookidoo-collections adds a custom collection from a name", async () => {
  const { client, calls } = createFakeClient({ addCustomCollection: { id: "cus1" } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "add-custom",
  });

  await runInput(node, { payload: "Testliste" });
  assert.deepEqual(calls[0].args, ["Testliste"]);
});

test("cookidoo-collections removes a custom collection from an id", async () => {
  const { client, calls } = createFakeClient({ removeCustomCollection: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "remove-custom",
  });

  await runInput(node, { payload: "cus1" });
  assert.deepEqual(calls[0].args, ["cus1"]);
});

test("cookidoo-collections adds recipes from { collectionId, recipeIds }", async () => {
  const { client, calls } = createFakeClient({ addRecipesToCustomCollection: { id: "cus1" } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "add-recipes",
  });

  await runInput(node, { payload: { collectionId: "cus1", recipeIds: ["r1", "r2"] } });
  assert.deepEqual(calls[0].args, ["cus1", ["r1", "r2"]]);
});

test("cookidoo-collections removes a recipe from { collectionId, recipeId }", async () => {
  const { client, calls } = createFakeClient({
    removeRecipeFromCustomCollection: { id: "cus1" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "remove-recipe",
  });

  await runInput(node, { payload: { collectionId: "cus1", recipeId: "r1" } });
  assert.deepEqual(calls[0].args, ["cus1", "r1"]);
});

test("cookidoo-collections lets msg.operation override the configured operation", async () => {
  const { client, calls } = createFakeClient({
    getManagedCollections: [],
    addCustomCollection: { id: "cus1" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "get-managed",
  });

  await runInput(node, { operation: "add-custom", payload: "Testliste" });
  assert.equal(calls[0].name, "addCustomCollection");
});

test("cookidoo-collections rejects an unknown operation", async () => {
  const { client } = createFakeClient({});
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", {
    cookidoo: "cfg1",
    operation: "not-a-real-operation",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-collections rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-collections.js")(RED);
  const node = instantiate(RED, "cookidoo-collections", { cookidoo: "", operation: "get-managed" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
