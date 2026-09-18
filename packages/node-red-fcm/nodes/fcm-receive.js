"use strict";

module.exports = function (RED) {
  /**
   * Surfaces one `fcm-config` connection as two outputs:
   *
   *   1. the FCM registration token -- once on connect and again every time
   *      the library rotates it. Wire this into whatever "register this
   *      token" call the app's backend expects.
   *   2. every received push message.
   *
   * This node deliberately knows nothing about any particular app's payload
   * shape; decoding is the consuming flow's job.
   */
  function FcmReceiveNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.fcmConfig = RED.nodes.getNode(config.fcm);
    if (!node.fcmConfig) {
      node.status({ fill: "red", shape: "ring", text: "no FCM config" });
      node.error("fcm-receive: no FCM config node selected.");
      return;
    }

    let messageCount = 0;

    function setReadyStatus(persisted) {
      const suffix = messageCount ? ` (${messageCount} msg)` : "";
      node.status(
        persisted
          ? { fill: "green", shape: "dot", text: `connected${suffix}` }
          : { fill: "yellow", shape: "dot", text: `token changed - deploy to save${suffix}` },
      );
    }

    node.status({ fill: "grey", shape: "ring", text: "connecting" });

    let persisted = false;
    const unsubscribe = node.fcmConfig.subscribe({
      onToken({ token, credentials, persisted: isPersisted }) {
        persisted = isPersisted;
        setReadyStatus(persisted);
        node.send([{ topic: "fcm-token", payload: token, credentials }, null]);
      },
      onMessage(envelope) {
        messageCount += 1;
        setReadyStatus(persisted);
        node.send([
          null,
          {
            topic: "fcm-message",
            // The FCM message itself (`data`/`notification`/...); the full
            // envelope is kept on `msg.fcm` for anything that needs the
            // persistent id. See this node's help.
            payload: envelope?.message ?? envelope,
            persistentId: envelope?.persistentId,
            fcm: envelope,
          },
        ]);
      },
      onError(err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        node.error(err);
      },
    });

    node.on("close", function (done) {
      unsubscribe();
      node.status({});
      done();
    });
  }

  RED.nodes.registerType("fcm-receive", FcmReceiveNode);
};
