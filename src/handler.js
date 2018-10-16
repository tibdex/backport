// @flow strict

import { serverless } from "@probot/serverless-lambda";
import commands from "probot-commands";

import backport from "./backport";

const probot = serverless((app: { log(string): void }) => {
  app.log("App loaded");

  commands(app, "backport", async (context, command) => {
    const {
      comment: {
        user: { login: commenter },
      },
    } = context.payload;
    const [base, head] = command.arguments
      .split(" ")
      .filter(word => word !== "");
    await backport(
      context.issue({
        base,
        commenter,
        head,
        octokit: context.github,
      })
    );
  });
});

export { probot };
