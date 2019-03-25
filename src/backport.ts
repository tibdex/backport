import * as Octokit from "@octokit/rest";
import * as createDebug from "debug";
import { backportPullRequest } from "github-backport";
import pSeries from "p-series";
import {
  fetchCommits,
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

const backportForLabel = async ({
  label,
  octokit,
  owner,
  pullRequestNumber,
  repo,
}: {
  label: LabelName;
  octokit: Octokit;
  owner: RepoOwner;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
}): Promise<PullRequestNumber> => {
  const [, base, head] = regExp.exec(label) as string[];
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
    const commitsToCherryPick = await fetchCommits({
      octokit,
      owner,
      pullRequestNumber,
      repo,
    });
    const definedHead = head || `backport-${pullRequestNumber}-on-${base}`;
    const message = "backport failed";
    debug(message, error);
    await octokit.issues.createComment({
      body: [
        `The backport to \`${base}\` failed:`,
        "",
        "```",
        error.message,
        "```",
        "To backport manually, run these commands in your terminal:",
        "```bash",
        "# Switch to the desired base branch.",
        `git checkout ${base}`,
        "# Update it to its latest state from GitHub.",
        "git pull --rebase",
        "# Cherry-pick all the commits of this pull request.",
        `git cherry-pick ${commitsToCherryPick.join(" ")}`,
        "# Create a new branch with these backported commits.",
        `git checkout -b ${definedHead}`,
        "# Push it to GitHub.",
        `git push --set-upstream origin ${definedHead}`,
        "```",
        `Then, create a pull request where the \`base\` branch is \`${base}\` and the \`compare\`/\`head\` branch is \`${definedHead}\`.`,
        "",
        "The isolated cherry-pick command is:",
        "```bash",
        `git cherry-pick ${commitsToCherryPick.join(" ")}`,
        "```",
      ].join("\n"),
      number: pullRequestNumber,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

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
}): Promise<PullRequestNumber[]> => {
  if (payload.pull_request.merged) {
    if (payload.label) {
      const label = payload.label.name;
      if (regExp.test(label)) {
        const backportedPullRequestNumber = await backportForLabel({
          label,
          octokit,
          owner,
          pullRequestNumber,
          repo,
        });
        return [backportedPullRequestNumber];
      }
    } else {
      // We're in the merged PR situation.
      const backportLabels = payload.pull_request.labels
        .map(({ name }) => name)
        .filter(name => regExp.test(name));
      return pSeries(
        backportLabels.map(label => () =>
          backportForLabel({ label, octokit, owner, pullRequestNumber, repo }),
        ),
      );
    }
  }

  // nop
  return [];
};

export { backport, Label };
