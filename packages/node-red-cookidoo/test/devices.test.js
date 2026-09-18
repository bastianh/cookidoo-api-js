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

test("cookidoo-devices gets paired appliances", async () => {
  const { client, calls } = createFakeClient({ getDevices: [{ type: "TM7" }] });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "cfg1", operation: "get-devices" });

  const msg = await runInput(node, {});
  assert.deepEqual(calls[0].args, []);
  assert.deepEqual(msg.payload, [{ type: "TM7" }]);
});

test("cookidoo-devices gets monitorable device ids", async () => {
  const { client } = createFakeClient({ getMonitoredDeviceIds: ["dev-1"] });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", {
    cookidoo: "cfg1",
    operation: "get-monitored-device-ids",
  });

  const msg = await runInput(node, {});
  assert.deepEqual(msg.payload, ["dev-1"]);
});

test("cookidoo-devices registers a push token from { pushToken, mobileAppId }", async () => {
  const { client, calls } = createFakeClient({ registerPushToken: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", {
    cookidoo: "cfg1",
    operation: "register-push-token",
  });

  await runInput(node, { payload: { pushToken: "fcm-token", mobileAppId: "install-1" } });
  assert.deepEqual(calls[0].args, ["fcm-token", "install-1"]);
});

test("cookidoo-devices unregisters a push token", async () => {
  const { client, calls } = createFakeClient({ unregisterPushToken: undefined });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", {
    cookidoo: "cfg1",
    operation: "unregister-push-token",
  });

  await runInput(node, { payload: "fcm-token" });
  assert.deepEqual(calls[0].args, ["fcm-token"]);
});

test("cookidoo-devices decodes a push payload without needing a config node", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "", operation: "decode-push" });

  const msg = await runInput(node, {
    payload: { deviceId: "dev-1", state: "running", recipeId: "r1" },
  });
  assert.equal(msg.payload.deviceId, "dev-1");
  assert.equal(msg.payload.state, "RUNNING");
  assert.equal(msg.payload.recipeId, "r1");
});

test("cookidoo-devices decodes a push payload nested under data.cookingActivity", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "", operation: "decode-push" });

  const msg = await runInput(node, {
    payload: {
      data: { cookingActivity: { deviceId: "dev-1", state: "running", recipeId: "r1" } },
    },
  });
  assert.equal(msg.payload.deviceId, "dev-1");
  assert.equal(msg.payload.state, "RUNNING");
});

test("cookidoo-devices drops a push message that carries no cook state", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "", operation: "decode-push" });

  const msg = await runInput(node, { payload: { data: { unrelated: "message" } } });
  assert.equal(msg, null);
});

test("cookidoo-devices lets msg.operation override the configured operation", async () => {
  const { client, calls } = createFakeClient({
    getDevices: [],
    getMonitoredDeviceIds: ["dev-1"],
  });
  const RED = createFakeRed({ getClient: async () => client });
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "cfg1", operation: "get-devices" });

  await runInput(node, { operation: "get-monitored-device-ids" });
  assert.equal(calls[0].name, "getMonitoredDeviceIds");
});

test("cookidoo-devices rejects an unknown operation", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", {
    cookidoo: "",
    operation: "not-a-real-operation",
  });

  await assert.rejects(() => runInput(node, {}), /unknown operation/);
});

test("cookidoo-devices rejects when no config node is selected for a network operation", async () => {
  const RED = createFakeRed(null);
  require("../nodes/cookidoo-devices.js")(RED);
  const node = instantiate(RED, "cookidoo-devices", { cookidoo: "", operation: "get-devices" });

  await assert.rejects(() => runInput(node, {}), /No Cookidoo config node selected/);
});
