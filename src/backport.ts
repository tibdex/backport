import { error as logError, group, warning, info } from "@actions/core";
import { exec } from "@actions/exec";
import { GitHub } from "@actions/github";
import { WebhookPayloadPullRequest } from "@octokit/webhooks";

const labelRegExp = /^backport ([^ ]+)(?: ([^ ]+))?$/;

const getLabelNames = ({
  action,
  label,
  labels,
}: {
  action: WebhookPayloadPullRequest["action"];
  label: { name: string };
  labels: WebhookPayloadPullRequest["pull_request"]["labels"];
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
  action: WebhookPayloadPullRequest["action"];
  label: { name: string };
  labels: WebhookPayloadPullRequest["pull_request"]["labels"];
  pullRequestNumber: number;
}): { [base: string]: string } =>
  getLabelNames({ action, label, labels }).reduce((baseToHead, labelName) => {
    const matches = labelRegExp.exec(labelName);
    if (matches === null) {
      return baseToHead;
    }

    const [, base, head = `backport-${pullRequestNumber}-to-${base}`] = matches;
    return { ...baseToHead, [base]: head };
  }, {});

const warnIfSquashIsNotTheOnlyAllowedMergeMethod = async ({
  github,
  owner,
  repo,
}: {
  github: GitHub;
  owner: string;
  repo: string;
}) => {
  const {
    data: { allow_merge_commit, allow_rebase_merge },
  } = await github.repos.get({ owner, repo });
  if (allow_merge_commit || allow_rebase_merge) {
    warning(
      [
        "Your repository allows merge commits and rebase merging.",
        " However, Backport only supports rebased and merged pull requests with a single commit and squashed and merged pull requests.",
        " Consider only allowing squash merging.",
        " See https://help.github.com/en/github/administering-a-repository/about-merge-methods-on-github for more information.",
      ].join("\n"),
    );
  }
};

const backportOnce = async ({
  base,
  body,
  commitToBackport,
  github,
  head,
  owner,
  repo,
  title,
  user,
}: {
  base: string;
  body: string;
  commitToBackport: string;
  github: GitHub;
  head: string;
  owner: string;
  repo: string;
  title: string;
  user: string;
}) => {
  const git = async (...args: string[]) => {
    await exec("git", args, { cwd: repo });
  };

  await git("switch", base);
  await git("switch", "--create", head);
  try {
    await git("cherry-pick", commitToBackport);
  } catch (error) {
    await git("cherry-pick", "--abort");
    throw error;
  }

  await git("push", "--set-upstream", "origin", head);
  await github.pulls.create({
    base,
    body,
    head: `${user}:${head}`,
    maintainer_can_modify: true,
    owner,
    repo,
    title,
  });
};

const getFailedBackportCommentBody = ({
  base,
  commitToBackport,
  errorMessage,
  head,
}: {
  base: string;
  commitToBackport: string;
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
    `git cherry-pick ${commitToBackport}`,
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
  payload: {
    action,
    // The payload has a label property when the action is "labeled".
    // @ts-ignore
    label,
    pull_request: {
      labels,
      merge_commit_sha: mergeCommitSha,
      merged,
      number: pullRequestNumber,
      title: originalTitle,
    },
    repository: {
      name: repo,
      owner: { login: owner },
    },
    // @ts-ignore
    user: { login: user },
  },
  token,
}: {
  payload: WebhookPayloadPullRequest;
  token: string;
}) => {
  if (!merged) {
    return;
  }

  const backportBaseToHead = getBackportBaseToHead({
    action,
    label,
    labels,
    pullRequestNumber,
  });

  if (Object.keys(backportBaseToHead).length === 0) {
    return;
  }

  const github = new GitHub(token);

  await warnIfSquashIsNotTheOnlyAllowedMergeMethod({ github, owner, repo });

  // The merge commit SHA is actually not null.
  const commitToBackport = String(mergeCommitSha);
  info(`Backporting ${commitToBackport} from #${pullRequestNumber}`);

  await exec("git", [
    "clone",
    `https://x-access-token:${token}@github.com/${user}/${repo}.git`,
  ]);

  const git = async (...args: string[]) => {
    await exec("git", args, { cwd: repo });
  };

  await git(
    "remote",
    "add",
    "upstream",
    `https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
  );

  await exec("git", [
    "config",
    "--global",
    "user.email",
    "github-actions[bot]@users.noreply.github.com",
  ]);
  await exec("git", ["config", "--global", "user.name", "github-actions[bot]"]);

  for (const [base, head] of Object.entries(backportBaseToHead)) {
    const body = `Backport ${commitToBackport} from #${pullRequestNumber}`;
    const title = `[Backport ${base}] ${originalTitle}`;
    await group(`Backporting to ${base} on ${head}`, async () => {
      try {
        await backportOnce({
          base,
          body,
          commitToBackport,
          github,
          head,
          owner,
          repo,
          title,
          user,
        });
      } catch (error) {
        const errorMessage = error.message;
        logError(`Backport failed: ${errorMessage}`);
        await github.issues.createComment({
          body: getFailedBackportCommentBody({
            base,
            commitToBackport,
            errorMessage,
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
