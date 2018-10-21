import { Application } from "probot";
import commands from "probot-commands";

import backport from "./backport";

module.exports = (app: Application) => {
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
    const { number: pullRequestNumber, owner, repo } = context.issue();
    await backport({
      base,
      commenter,
      head,
      // @ts-ignore The value is the good one even if the type doesn't match.
      octokit: context.github,
      owner,
      pullRequestNumber,
      repo,
    });
  });
};
