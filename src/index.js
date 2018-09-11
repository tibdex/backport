// @flow strict

import commands from "probot-commands";

import backport from "./backport";

module.exports = (app: { log(string): void }) => {
  app.log("App loaded");

  commands(app, "backport", async (context, command) => {
    const base = command.arguments.trim();
    await backport(
      context.issue({
        base,
        octokit: context.github,
      })
    );
  });
};
