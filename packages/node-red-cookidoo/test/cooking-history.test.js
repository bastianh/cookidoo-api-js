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

test("cookidoo-get-cooking-history fetches the history and sets msg.payload", async () => {
  const { client, calls } = createFakeClient({
    getCookingHistory: [{ id: "r1", name: "Pizzateig" }],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-get-cooking-history.js")(RED);
  const node = instantiate(RED, "cookidoo-get-cooking-history", { cookidoo: "cfg1" });

  const msg = await runInput(node, {});
  assert.deepEqual(calls[0].args, []);
  assert.deepEqual(msg.payload, [{ id: "r1", name: "Pizzateig" }]);
});

test("cookidoo-get-cooking-history rejects when no config node is selected", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-get-cooking-history.js")(RED);
  const node = instantiate(RED, "cookidoo-get-cooking-history", { cookidoo: "" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
