import { getInput, setFailed } from "@actions/core";
import { context } from "@actions/github";
import type { PullRequestEvent } from "@octokit/webhooks-types";
import ensureError from "ensure-error";
import { template } from "lodash-es";
import { backport } from "./backport.js";

const run = async () => {
  try {
    const [getBody, getHead, _getLabels, getTitle] = [
      "body_template",
      "head_template",
      "labels_template",
      "title_template",
    ].map((name) => template(getInput(name)));

    const labelPattern = getInput("label_pattern");
    const token = getInput("github_token", { required: true });

    const getLabels = ({
      base,
      labels,
    }: Readonly<{ base: string; labels: readonly string[] }>): string[] => {
      const json = _getLabels({ base, labels });
      try {
        return JSON.parse(json) as string[];
      } catch (_error: unknown) {
        const error = ensureError(_error);
        throw new Error(`Could not parse labels from invalid JSON: ${json}.`, {
          cause: error,
        });
      }
    };

    const labelRegExp = new RegExp(labelPattern);

    const payload = context.payload as PullRequestEvent;

    if (payload.action !== "closed" && payload.action !== "labeled") {
      throw new Error(
        `Unsupported pull request event action: ${payload.action}.`,
      );
    }

    await backport({
      getBody,
      getHead,
      getLabels,
      getTitle,
      labelRegExp,
      payload,
      token,
    });
  } catch (_error: unknown) {
    const error = ensureError(_error);
    setFailed(error);
  }
};

void run();
