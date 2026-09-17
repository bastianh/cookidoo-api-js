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

test("cookidoo-search-recipes wraps a string payload as { query }", async () => {
  const { client, calls } = createFakeClient({ searchRecipes: { recipes: [], total: 0 } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-search-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-search-recipes", { cookidoo: "cfg1" });

  await runInput(node, { payload: "chicken" });
  assert.deepEqual(calls[0].args, [{ query: "chicken" }]);
});

test("cookidoo-search-recipes passes a full options object through as-is", async () => {
  const { client, calls } = createFakeClient({
    searchRecipes: { recipes: [{ id: "r1", name: "Soup" }], total: 1 },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-search-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-search-recipes", { cookidoo: "cfg1" });

  const options = { query: "soup", portions: 4, tmv: "TM6" };
  const msg = await runInput(node, { payload: options });
  assert.deepEqual(calls[0].args, [options]);
  assert.deepEqual(msg.payload, { recipes: [{ id: "r1", name: "Soup" }], total: 1 });
});

test("cookidoo-search-recipes defaults to an empty options object without a payload", async () => {
  const { client, calls } = createFakeClient({ searchRecipes: { recipes: [], total: 0 } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-search-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-search-recipes", { cookidoo: "cfg1" });

  await runInput(node, {});
  assert.deepEqual(calls[0].args, [{}]);
});

test("cookidoo-search-recipes rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-search-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-search-recipes", { cookidoo: "" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});

test("cookidoo-get-recipe-details fetches details for the given id", async () => {
  const { client, calls } = createFakeClient({
    getRecipeDetails: { id: "r1", name: "Pavlova" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-get-recipe-details.js")(RED);
  const node = instantiate(RED, "cookidoo-get-recipe-details", { cookidoo: "cfg1" });

  const msg = await runInput(node, { payload: "r1" });
  assert.deepEqual(calls[0].args, ["r1"]);
  assert.deepEqual(msg.payload, { id: "r1", name: "Pavlova" });
});

test("cookidoo-get-recipe-details rejects a non-string payload", async () => {
  const { client } = createFakeClient({ getRecipeDetails: {} });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-get-recipe-details.js")(RED);
  const node = instantiate(RED, "cookidoo-get-recipe-details", { cookidoo: "cfg1" });

  await assert.rejects(() => runInput(node, { payload: 42 }), /must be a recipe id string/);
});

test("cookidoo-get-recipe-details rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-get-recipe-details.js")(RED);
  const node = instantiate(RED, "cookidoo-get-recipe-details", { cookidoo: "" });

  await assert.rejects(() => runInput(node, { payload: "r1" }), /No Cookidoo config node selected/);
});
