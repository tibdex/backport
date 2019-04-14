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
    const definedHead = head || `backport-${pullRequestNumber}-to-${base}`;
    debug("backport failed", error);
    await octokit.issues.createComment({
      body: [
        `The backport to \`${base}\` failed:`,
        "",
        "```",
        error.message,
        "```",
        "To backport manually, run these commands in your terminal:",
        "```bash",
        "# Fetch latest updates from GitHub.",
        "git fetch",
        "# Create new working tree.",
        `git worktree add .worktrees/backport ${base}`,
        "# Navigate to the new directory.",
        "cd .worktrees/backport",
        "# Cherry-pick all the commits of this pull request and resolve the likely conflicts.",
        `git cherry-pick ${commitsToCherryPick.join(" ")}`,
        "# Create a new branch with these backported commits.",
        `git checkout -b ${definedHead}`,
        "# Push it to GitHub.",
        `git push --set-upstream origin ${definedHead}`,
        "# Go back to the original working tree.",
        "cd ../..",
        "# Delete the working tree.",
        "git worktree remove .worktrees/backport",
        "```",
        `Then, create a pull request where the \`base\` branch is \`${base}\` and the \`compare\`/\`head\` branch is \`${definedHead}\`.`,
      ].join("\n"),
      number: pullRequestNumber,
      owner,
      repo,
    });
    throw new Error(base);
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
      const results = await pSeries(
        backportLabels.map(label => async () => {
          try {
            return await backportForLabel({
              label,
              octokit,
              owner,
              pullRequestNumber,
              repo,
            });
          } catch (error) {
            return error;
          }
        }),
      );

      const errors = results.filter(result => result instanceof Error);

      if (errors.length > 0) {
        throw new Error(
          `backport(s) to ${errors.map(error => error.message)} failed`,
        );
      }

      return results;
    }
  }

  // nop
  return [];
};

export { backport, Label };
