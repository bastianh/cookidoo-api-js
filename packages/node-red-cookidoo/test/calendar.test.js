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

test("cookidoo-calendar gets the recipes in a calendar week for the given day", async () => {
  const { client, calls } = createFakeClient({
    getRecipesInCalendarWeek: [{ id: "2025-03-04" }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", { cookidoo: "cfg1", operation: "get-week" });

  const msg = await runInput(node, { payload: "2025-03-04" });
  assert.deepEqual(calls[0].args, ["2025-03-04"]);
  assert.deepEqual(msg.payload, [{ id: "2025-03-04" }]);
});

test("cookidoo-calendar adds recipes from { day, recipeIds }", async () => {
  const { client, calls } = createFakeClient({ addRecipesToCalendar: { id: "2025-03-04" } });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", {
    cookidoo: "cfg1",
    operation: "add-recipes",
  });

  await runInput(node, { payload: { day: "2025-03-04", recipeIds: ["r1", "r2"] } });
  assert.deepEqual(calls[0].args, ["2025-03-04", ["r1", "r2"]]);
});

test("cookidoo-calendar removes a recipe from { day, recipeId }", async () => {
  const { client, calls } = createFakeClient({
    removeRecipeFromCalendar: { id: "2025-03-04", recipes: [] },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", {
    cookidoo: "cfg1",
    operation: "remove-recipe",
  });

  await runInput(node, { payload: { day: "2025-03-04", recipeId: "r1" } });
  assert.deepEqual(calls[0].args, ["2025-03-04", "r1"]);
});

test("cookidoo-calendar adds custom recipes from { day, recipeIds }", async () => {
  const { client, calls } = createFakeClient({
    addCustomRecipesToCalendar: { id: "2025-03-04" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", {
    cookidoo: "cfg1",
    operation: "add-custom-recipes",
  });

  await runInput(node, { payload: { day: "2025-03-04", recipeIds: ["cr1"] } });
  assert.deepEqual(calls[0].args, ["2025-03-04", ["cr1"]]);
});

test("cookidoo-calendar removes a custom recipe from { day, recipeId }", async () => {
  const { client, calls } = createFakeClient({
    removeCustomRecipeFromCalendar: { id: "2025-03-04", recipes: [] },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", {
    cookidoo: "cfg1",
    operation: "remove-custom-recipe",
  });

  await runInput(node, { payload: { day: "2025-03-04", recipeId: "cr1" } });
  assert.deepEqual(calls[0].args, ["2025-03-04", "cr1"]);
});

test("cookidoo-calendar lets msg.operation override the configured operation", async () => {
  const { client, calls } = createFakeClient({
    "get-week": [],
    getRecipesInCalendarWeek: [],
    addRecipesToCalendar: { id: "2025-03-04" },
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", { cookidoo: "cfg1", operation: "get-week" });

  await runInput(node, {
    operation: "add-recipes",
    payload: { day: "2025-03-04", recipeIds: ["r1"] },
  });
  assert.equal(calls[0].name, "addRecipesToCalendar");
});

test("cookidoo-calendar rejects an unknown operation", async () => {
  const { client } = createFakeClient({});
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", {
    cookidoo: "cfg1",
    operation: "not-a-real-operation",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-calendar rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-calendar.js")(RED);
  const node = instantiate(RED, "cookidoo-calendar", { cookidoo: "", operation: "get-week" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
