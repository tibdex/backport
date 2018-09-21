// @flow strict

import type { Github } from "@octokit/rest";
import createDebug from "debug";
import backportPullRequest from "github-backport";
import {
  type PullRequestNumber,
  type Reference,
  type RepoName,
  type RepoOwner,
} from "shared-github-internals/lib/git";

import { name as packageName } from "../package";

type Username = string;

const debug = createDebug(packageName);

const defaultUserHasWritePermission = async ({
  octokit,
  owner,
  repo,
  username,
}) => {
  const {
    data: { permission },
  } = await octokit.repos.reviewUserPermissionLevel({ owner, repo, username });
  debug("commenter permission:", permission);
  return ["admin", "write"].includes(permission);
};

const ensureUserHasWritePermission = async ({
  commenter,
  number,
  octokit,
  owner,
  repo,
  userHasWritePermission,
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
      number,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

const ensurePullRequest = async ({ number, octokit, owner, repo }) => {
  try {
    debug("checking comment is on a pull request");
    await octokit.pullRequests.get({ number, owner, repo });
  } catch (error) {
    const message = "issue is not a visible pull request";
    debug(message, error);
    await octokit.issues.createComment({
      body: "Issues cannot be backported, only pull requests.",
      number,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

const internalBackport = async ({
  base,
  head,
  number,
  octokit,
  owner,
  repo,
}) => {
  try {
    const backportedPullRequestNumber = await backportPullRequest({
      base,
      head,
      number,
      octokit,
      owner,
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
      number,
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
  number,
  octokit,
  owner,
  repo,
  // Should only be used in tests.
  _userHasWritePermission = defaultUserHasWritePermission,
}: {
  base: Reference,
  commenter: Username,
  head?: Reference,
  number: PullRequestNumber,
  octokit: Github,
  owner: RepoOwner,
  repo: RepoName,
  _userHasWritePermission?: ({
    octokit: Github,
    owner: RepoOwner,
    repo: RepoName,
    username: Username,
  }) => Promise<boolean>,
}) => {
  debug("starting", { base, commenter, head, number, owner, repo });
  await ensureUserHasWritePermission({
    commenter,
    number,
    octokit,
    owner,
    repo,
    userHasWritePermission: _userHasWritePermission,
  });
  await ensurePullRequest({ number, octokit, owner, repo });

  debug("backporting");
  return internalBackport({
    base,
    head,
    number,
    octokit,
    owner,
    repo,
  });
};

export default backport;
