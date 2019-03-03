import * as Octokit from "@octokit/rest";
import * as createDebug from "debug";
import { backportPullRequest } from "github-backport";
import {
  PullRequestNumber,
  RepoName,
  RepoOwner,
} from "shared-github-internals/lib/git";

type LabelName = string;

type Label = { name: LabelName };

type Payload = {
  label?: Label;
  pull_request: {
    labels: Label[];
    merged: boolean;
  };
};

const debug = createDebug("backport");

const regExp = /^backport ([^ ]+)(?: ([^ ]+))?$/;

const backport = async ({
  octokit,
  owner,
  payload,
  pullRequestNumber,
  repo,
}: {
  octokit: Octokit;
  owner: RepoOwner;
  payload: Payload;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
}) => {
  payload.pull_request.labels
    .map(({ name }) => name)
    .filter(name => regExp.test(name))
    .forEach(function(labelName) {
    if (
      !labelName ||
      !payload.pull_request.merged ||
      (payload.label && !regExp.test(payload.label.name))
    ) {
      // Ignore unlabeled or unmerged pull requests and unrelated label events.
      return;
    }
    // Thanks to the code above, we're sure that labelName matches.
    const [, base, head] = regExp.exec(labelName) as string[];

    debug("backporting", {
      base,
      head,
      owner,
      pullRequestNumber,
      repo,
    });
    try {
      const backportedPullRequestNumber = await backportPullRequest({
        base,
        head,
        octokit,
        owner,
        pullRequestNumber,
        repo,
      });
      debug("backported", backportedPullRequestNumber);
      return backportedPullRequestNumber;
    } catch (error) {
      const message = "backport failed";
      debug(message, error);
      await octokit.issues.createComment({
        body: [
          `The backport to \`${base}\` failed:`,
          "",
          "```",
          error.message,
          "```",
        ].join("\n"),
        number: pullRequestNumber,
        owner,
        repo,
      });
      throw new Error(message);
    }
  });
};

export { backport, Label };
