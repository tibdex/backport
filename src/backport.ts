import * as Octokit from "@octokit/rest";
import * as createDebug from "debug";
import backportPullRequest from "github-backport";
import {
  PullRequestNumber,
  Reference,
  RepoName,
  RepoOwner,
} from "shared-github-internals/lib/git";

type Username = string;

type UserHasWritePermission = (
  {
    octokit,
    owner,
    repo,
    username,
  }: { octokit: Octokit; owner: RepoOwner; repo: RepoName; username: Username },
) => Promise<boolean>;

const debug = createDebug("backport");

const defaultUserHasWritePermission = async ({
  octokit,
  owner,
  repo,
  username,
}: {
  octokit: Octokit;
  owner: RepoOwner;
  repo: RepoName;
  username: Username;
}) => {
  const {
    data: { permission },
  } = await octokit.repos.reviewUserPermissionLevel({ owner, repo, username });
  debug("commenter permission:", permission);
  return ["admin", "write"].includes(permission);
};

const ensureUserHasWritePermission = async ({
  commenter,
  octokit,
  owner,
  pullRequestNumber,
  repo,
  userHasWritePermission,
}: {
  commenter: Username;
  octokit: Octokit;
  owner: RepoOwner;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
  userHasWritePermission: UserHasWritePermission;
}) => {
  try {
    debug("checking commenter permissions");
    const result = await userHasWritePermission({
      octokit,
      owner,
      repo,
      username: commenter,
    });
    if (!result) {
      throw new Error(`Missing write permission`);
    }
  } catch (error) {
    const message = `commenter ${commenter} doesn't have write permission`;
    debug(message, error);
    await octokit.issues.createComment({
      body: `Sorry @${commenter} but you need write permission on this repository to backport a pull request.`,
      number: pullRequestNumber,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

const ensurePullRequest = async ({
  octokit,
  owner,
  pullRequestNumber,
  repo,
}: {
  octokit: Octokit;
  owner: RepoOwner;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
}) => {
  try {
    debug("checking comment is on a pull request");
    await octokit.pullRequests.get({ number: pullRequestNumber, owner, repo });
  } catch (error) {
    const message = "issue is not a visible pull request";
    debug(message, error);
    await octokit.issues.createComment({
      body: "Issues cannot be backported, only pull requests.",
      number: pullRequestNumber,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

const internalBackport = async ({
  base,
  head,
  octokit,
  owner,
  pullRequestNumber,
  repo,
}: {
  base: Reference;
  head?: Reference;
  octokit: Octokit;
  owner: RepoOwner;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
}) => {
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
};

const backport = async ({
  base,
  commenter,
  head,
  octokit,
  owner,
  pullRequestNumber,
  repo,
  // Should only be used in tests.
  _userHasWritePermission = defaultUserHasWritePermission,
}: {
  base: Reference;
  commenter: Username;
  head?: Reference;
  octokit: Octokit;
  owner: RepoOwner;
  pullRequestNumber: PullRequestNumber;
  repo: RepoName;
  _userHasWritePermission?: UserHasWritePermission;
}) => {
  debug("starting", { base, commenter, head, owner, pullRequestNumber, repo });
  await ensureUserHasWritePermission({
    commenter,
    octokit,
    owner,
    pullRequestNumber,
    repo,
    userHasWritePermission: _userHasWritePermission,
  });
  await ensurePullRequest({ octokit, owner, pullRequestNumber, repo });

  debug("backporting");
  return internalBackport({
    base,
    head,
    octokit,
    owner,
    pullRequestNumber,
    repo,
  });
};

export { Username };

export default backport;
