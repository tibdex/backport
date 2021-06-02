import { error as logError, group, warning, info } from "@actions/core";
import { exec } from "@actions/exec";
import { getOctokit } from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import { EventPayloads } from "@octokit/webhooks";
import escapeRegExp from "lodash/escapeRegExp";

const labelRegExp = /^backport ([^ ]+)(?: ([^ ]+))?$/;

const getLabelNames = ({
  action,
  label,
  labels,
}: {
  action: EventPayloads.WebhookPayloadPullRequest["action"];
  label: { name: string };
  labels: EventPayloads.WebhookPayloadPullRequest["pull_request"]["labels"];
}): string[] => {
  switch (action) {
    case "closed":
      return labels.map(({ name }) => name);
    case "labeled":
      return [label.name];
    default:
      return [];
  }
};

const getBackportBaseToHead = ({
  action,
  label,
  labels,
  pullRequestNumber,
}: {
  action: EventPayloads.WebhookPayloadPullRequest["action"];
  label: { name: string };
  labels: EventPayloads.WebhookPayloadPullRequest["pull_request"]["labels"];
  pullRequestNumber: number;
}): Record<string, string> => {
  const baseToHead: Record<string, string> = {};

  getLabelNames({ action, label, labels }).forEach((labelName) => {
    const matches = labelRegExp.exec(labelName);

    if (matches !== null) {
      const [
        ,
        base,
        head = `backport-${pullRequestNumber}-to-${base}`,
      ] = matches;
      baseToHead[base] = head;
    }
  });

  return baseToHead;
};

const backportOnce = async ({
  base,
  body,
  commits,
  commitToBackport,
  github,
  head,
  labelsToAdd,
  owner,
  repo,
  title,
  pullRequestNumber
}: {
  base: string;
  body: string;
  commits: string[];
  commitToBackport: string;
  github: InstanceType<typeof GitHub>;
  head: string;
  labelsToAdd: string[];
  owner: string;
  repo: string;
  title: string;
  pullRequestNumber: number;
}) => {
  const git = async (...args: string[]) => {
    await exec("git", args, { cwd: repo });
  };

  let backportError = null;
  await git("fetch", "origin", `pull/${pullRequestNumber}/head`);
  await git("switch", base);
  await git("switch", "--create", head);

  try {
    await git("show", commitToBackport + "^2");
    // We have a merge commit
    try {
      await git("cherry-pick", `${commitToBackport}^..${commitToBackport}^2`);
    } catch (error: unknown) {
      await git("cherry-pick", "--abort");
      backportError = error;
    }
  } catch (error: unknown) {
    // No merge commit
    try {
      await git("cherry-pick", ...commits);
    } catch (error: unknown) {
      await git("cherry-pick", "--abort");
      backportError = error;
    }
  }

  if (backportError) {
    throw backportError;
  }

  await git("push", "--set-upstream", "origin", head);
  const {
    data: { number: backportPullRequestNumber },
  } = await github.pulls.create({
    base,
    body,
    head,
    owner,
    repo,
    title,
  });
  if (labelsToAdd.length > 0) {
    await github.issues.addLabels({
      issue_number: backportPullRequestNumber,
      labels: labelsToAdd,
      owner,
      repo,
    });
  }
};

const getFailedBackportCommentBody = ({
  base,
  commits,
  errorMessage,
  head,
}: {
  base: string;
  commits: string[];
  errorMessage: string;
  head: string;
}) => {
  const worktreePath = `.worktrees/backport-${base}`;
  return [
    `The backport to \`${base}\` failed:`,
    "```",
    errorMessage,
    "```",
    "To backport manually, run these commands in your terminal:",
    "```bash",
    "# Fetch latest updates from GitHub",
    "git fetch",
    "# Create a new working tree",
    `git worktree add ${worktreePath} ${base}`,
    "# Navigate to the new working tree",
    `cd ${worktreePath}`,
    "# Create a new branch",
    `git switch --create ${head}`,
    "# Cherry-pick the merged commit of this pull request and resolve the conflicts",
    `git cherry-pick ${commits}`,
    "# Push it to GitHub",
    `git push --set-upstream origin ${head}`,
    "# Go back to the original working tree",
    "cd ../..",
    "# Delete the working tree",
    `git worktree remove ${worktreePath}`,
    "```",
    `Then, create a pull request where the \`base\` branch is \`${base}\` and the \`compare\`/\`head\` branch is \`${head}\`.`,
  ].join("\n");
};

const backport = async ({
  labelsToAdd,
  payload: {
    action,
    label,
    pull_request: {
      labels,
      merge_commit_sha: mergeCommitSha,
      merged,
      number: pullRequestNumber,
      title: originalTitle,
      user: { login: pullRequestUser },
    },
    repository: {
      name: repo,
      owner: { login: owner },
    },
  },
  titleTemplate,
  token,
}: {
  labelsToAdd: string[];
  payload: EventPayloads.WebhookPayloadPullRequest;
  titleTemplate: string;
  token: string;
}) => {
  if (!merged) {
    return;
  }

  const backportBaseToHead = getBackportBaseToHead({
    action,
    // The payload has a label property when the action is "labeled".
    label: label!,
    labels,
    pullRequestNumber,
  });

  if (Object.keys(backportBaseToHead).length === 0) {
    return;
  }

  const github = getOctokit(token);

  const commitsResponse = await github.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
    {
      owner: owner,
      repo: repo,
      pull_number: pullRequestNumber,
    },
  );

  // The commit range (interesting for rebase merges)
  const commits = commitsResponse.data.map(({ sha }) => sha);

  // The merge commit itself (only interesting if it's a merge)
  const commitToBackport = String(mergeCommitSha);
  info(`Backporting #${pullRequestNumber}`);

  await exec("git", [
    "clone",
    `https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
  ]);
  await exec("git", [
    "config",
    "--global",
    "user.email",
    "github-actions[bot]@users.noreply.github.com",
  ]);
  await exec("git", ["config", "--global", "user.name", "github-actions[bot]"]);

  for (const [base, head] of Object.entries(backportBaseToHead)) {
    const body = `Backport #${pullRequestNumber}\n **Authored by:** @${pullRequestUser}`;

    let title = titleTemplate;
    Object.entries({
      base,
      originalTitle,
    }).forEach(([name, value]) => {
      title = title.replace(
        new RegExp(escapeRegExp(`{{${name}}}`), "g"),
        value,
      );
    });

    await group(`Backporting to ${base} on ${head}`, async () => {
      try {
        await backportOnce({
          base,
          body,
          commits,
          commitToBackport,
          github,
          head,
          labelsToAdd,
          owner,
          repo,
          title,
          pullRequestNumber
        });
      } catch (error: unknown) {
        if (!(error instanceof Error)) {
          throw new TypeError(
            `Caught error of unexpected type: ${typeof error}`,
          );
        }

        logError(error);
        await github.issues.createComment({
          body: getFailedBackportCommentBody({
            base,
            commits,
            errorMessage: error.message,
            head,
          }),
          issue_number: pullRequestNumber,
          owner,
          repo,
        });
      }
    });
  }
};

export { backport };
