"use strict";

/**
 * Operations on the recipe-planning calendar. `msg.payload` is the
 * operation's input (where one is needed) and becomes the operation's
 * result on output. The configured operation can be overridden per message
 * via `msg.operation`.
 */
const OPERATIONS = {
  "get-week": (client, payload) => client.getRecipesInCalendarWeek(payload),
  "add-recipes": (client, payload) => client.addRecipesToCalendar(payload.day, payload.recipeIds),
  "remove-recipe": (client, payload) =>
    client.removeRecipeFromCalendar(payload.day, payload.recipeId),
  "add-custom-recipes": (client, payload) =>
    client.addCustomRecipesToCalendar(payload.day, payload.recipeIds),
  "remove-custom-recipe": (client, payload) =>
    client.removeCustomRecipeFromCalendar(payload.day, payload.recipeId),
};

module.exports = function (RED) {
  function CookidooCalendarNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.operation = config.operation;
    node.cookidooConfig = RED.nodes.getNode(config.cookidoo);

    node.on("input", async function (msg, send, done) {
      if (!node.cookidooConfig) {
        done(new Error("No Cookidoo config node selected."));
        return;
      }
      const operation = msg.operation || node.operation;
      const handler = OPERATIONS[operation];
      if (!handler) {
        done(new Error(`cookidoo-calendar: unknown operation "${operation}".`));
        return;
      }
      try {
        const client = await node.cookidooConfig.getClient();
        msg.payload = await handler(client, msg.payload);
        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("cookidoo-calendar", CookidooCalendarNode);
};
