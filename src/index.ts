import { debug, getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import { WebhookPayloadPullRequest } from "@octokit/webhooks";

import { backport } from "./backport";

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    const titleTemplate = getInput("title_template");
    debug(JSON.stringify(context, null, 2));
    await backport({
      payload: context.payload as WebhookPayloadPullRequest,
      titleTemplate,
      token,
    });
  } catch (error) {
    setFailed(error.message);
  }
};

run();
