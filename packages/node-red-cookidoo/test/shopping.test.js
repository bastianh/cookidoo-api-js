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

/** A fake Cookidoo client where each named method returns/throws a fixed value and records its calls. */
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

/** Run a node's "input" handler and collect what it sent/errored with. */
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

test("cookidoo-shopping-recipes dispatches the configured operation and returns its result", async () => {
  const { client, calls } = createFakeClient({
    getShoppingListRecipes: [{ id: "r1", name: "Pavlova" }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-recipes", {
    cookidoo: "cfg1",
    operation: "get-recipes",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(msg.payload, [{ id: "r1", name: "Pavlova" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "getShoppingListRecipes");
});

test("cookidoo-shopping-recipes forwards msg.payload as the operation's input", async () => {
  const { client, calls } = createFakeClient({ addIngredientItemsForRecipes: [] });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-recipes", {
    cookidoo: "cfg1",
    operation: "add-ingredients",
  });

  await runInput(node, { payload: ["r1", "r2"] });
  assert.deepEqual(calls[0].args, [["r1", "r2"]]);
});

test("cookidoo-shopping-recipes lets msg.operation override the configured operation", async () => {
  const { client, calls } = createFakeClient({
    getShoppingListRecipes: [],
    getIngredientItems: [],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-recipes", {
    cookidoo: "cfg1",
    operation: "get-recipes",
  });

  await runInput(node, { operation: "get-ingredient-items" });
  assert.equal(calls[0].name, "getIngredientItems");
});

test("cookidoo-shopping-recipes rejects an unknown operation", async () => {
  const { client } = createFakeClient({});
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-recipes", {
    cookidoo: "cfg1",
    operation: "not-a-real-operation",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-shopping-recipes rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-shopping-recipes.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-recipes", {
    cookidoo: "",
    operation: "get-recipes",
  });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});

test("cookidoo-shopping-additional-items dispatches edit-ownership with the given items", async () => {
  const { client, calls } = createFakeClient({
    editAdditionalItemsOwnership: [{ id: "a1", name: "Napkins", isOwned: true }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-additional-items.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-additional-items", {
    cookidoo: "cfg1",
    operation: "edit-ownership",
  });

  const items = [{ id: "a1", name: "Napkins", isOwned: true }];
  const msg = await runInput(node, { payload: items });
  assert.deepEqual(msg.payload, [{ id: "a1", name: "Napkins", isOwned: true }]);
  assert.deepEqual(calls[0].args, [items]);
});

test("cookidoo-shopping-additional-items rejects an unknown operation", async () => {
  const { client } = createFakeClient({});
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-shopping-additional-items.js")(RED);
  const node = instantiate(RED, "cookidoo-shopping-additional-items", {
    cookidoo: "cfg1",
    operation: "bogus",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-clear-shopping-list clears the list and passes the message through", async () => {
  const { client, calls } = createFakeClient({ clearShoppingList: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-clear-shopping-list.js")(RED);
  const node = instantiate(RED, "cookidoo-clear-shopping-list", { cookidoo: "cfg1" });

  const msg = await runInput(node, { payload: "unchanged" });
  assert.equal(msg.payload, "unchanged");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "clearShoppingList");
});

test("cookidoo-clear-shopping-list rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-clear-shopping-list.js")(RED);
  const node = instantiate(RED, "cookidoo-clear-shopping-list", { cookidoo: "" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
