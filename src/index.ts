import { debug, getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import { WebhookPayloadPullRequest } from "@octokit/webhooks";

import { backport } from "./backport";
import { getLabelsToAdd } from "./get-labels-to-add";

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    debug(JSON.stringify(context, null, 2));
    const labelsInput = getInput("labels");
    const labelsToAdd = getLabelsToAdd(labelsInput);
    await backport({
      labelsToAdd,
      payload: context.payload as WebhookPayloadPullRequest,
      token,
    });
  } catch (error) {
    setFailed(error.message);
  }
};

run();
