import { debug, error as logError, getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";

import { backport } from "./backport";
import { getLabelsToAdd } from "./get-labels-to-add";

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    const titleTemplate = getInput("title_template");
    const reusePRBody = getInput("reuse_pr_body");

    const labelsInput = getInput("add_labels");
    const labelsToAdd = getLabelsToAdd(labelsInput);
    await backport({
      labelsToAdd,
      payload: context.payload as EventPayloads.WebhookPayloadPullRequest,
      reusePRBody: Boolean(reusePRBody),
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
