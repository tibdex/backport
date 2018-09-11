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

const debug = createDebug(packageName);

const backport = async ({
  base,
  head,
  number,
  octokit,
  owner,
  repo,
}: {
  base: Reference,
  head?: Reference,
  number: PullRequestNumber,
  octokit: Github,
  owner: RepoOwner,
  repo: RepoName,
}) => {
  debug("starting", { base, head, number, owner, repo });

  try {
    await octokit.pullRequests.get({ number, owner, repo });
  } catch (error) {
    const message = "issue is not a visible pull request";
    debug(message, error);
    await octokit.issues.createComment({
      body: "Issues cannot be backported, only pull requests.",
      number,
      octokit,
      owner,
      repo,
    });
    throw new Error(message);
  }

  debug("backporting");

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
        `The backport failed \`${base}\`:`,
        "",
        "```",
        error.message,
        "```",
      ].join("\n"),
      number,
      octokit,
      owner,
      repo,
    });
    throw new Error(message);
  }
};

export default backport;
