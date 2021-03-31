import { debug, error as logError, getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";

import { backport } from "./backport";
import { getTokensFromCommaString } from "./get-tokens-from-comma-string";

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    const titleTemplate = getInput("title_template");
    debug(JSON.stringify(context, undefined, 2));
    const labelsInput = getInput("add_labels");
    const labelsToAdd = getTokensFromCommaString(labelsInput);
    const branchesInput = getInput("branches");
    const branches = getTokensFromCommaString(branchesInput);
    await backport({
      branches,
      labelsToAdd,
      payload: context.payload as EventPayloads.WebhookPayloadPullRequest,
      titleTemplate,
      token,
    });
  } catch (error: unknown) {
    if (typeof error !== "string" && !(error instanceof Error)) {
      throw new TypeError(`Caught error of unexpected type: ${typeof error}`);
    }

    setFailed(error);
  }
};

void run();
