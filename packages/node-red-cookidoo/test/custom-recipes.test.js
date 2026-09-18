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

test("cookidoo-custom-recipes lists custom recipes", async () => {
  const { client, calls } = createFakeClient({
    listCustomRecipes: [{ id: "cr1", name: "Vongole" }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "list",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(msg.payload, [{ id: "cr1", name: "Vongole" }]);
  assert.equal(calls[0].name, "listCustomRecipes");
});

test("cookidoo-custom-recipes gets a custom recipe by id", async () => {
  const { client, calls } = createFakeClient({ getCustomRecipe: { id: "cr1" } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "get",
  });

  await runInput(node, { payload: "cr1" });
  assert.deepEqual(calls[0].args, ["cr1"]);
});

test("cookidoo-custom-recipes adds a recipe from { recipeId, servingSize }", async () => {
  const { client, calls } = createFakeClient({
    addCustomRecipeFrom: { id: "cr1", servingSize: 4 },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "add-from",
  });

  const msg = await runInput(node, { payload: { recipeId: "r1", servingSize: 4 } });
  assert.deepEqual(calls[0].args, ["r1", 4]);
  assert.deepEqual(msg.payload, { id: "cr1", servingSize: 4 });
});

test("cookidoo-custom-recipes removes a custom recipe by id", async () => {
  const { client, calls } = createFakeClient({ removeCustomRecipe: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "remove",
  });

  await runInput(node, { payload: "cr1" });
  assert.deepEqual(calls[0].args, ["cr1"]);
});

test("cookidoo-custom-recipes lets msg.operation override the configured operation", async () => {
  const { client, calls } = createFakeClient({
    listCustomRecipes: [],
    getCustomRecipe: { id: "cr1" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "list",
  });

  await runInput(node, { operation: "get", payload: "cr1" });
  assert.equal(calls[0].name, "getCustomRecipe");
});

test("cookidoo-custom-recipes rejects an unknown operation", async () => {
  const { client } = createFakeClient({});
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", {
    cookidoo: "cfg1",
    operation: "not-a-real-operation",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-custom-recipes rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-custom-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-custom-recipes", { cookidoo: "", operation: "list" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
