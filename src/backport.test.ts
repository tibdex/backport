import * as Octokit from "@octokit/rest";
import {
  deleteReference,
  PullRequestNumber,
  Reference,
  RepoName,
  RepoOwner,
} from "shared-github-internals/lib/git";
import { createTestContext } from "shared-github-internals/lib/tests/context";
import {
  createPullRequest,
  createReferences,
  DeleteReferences,
  RefsDetails,
} from "shared-github-internals/lib/tests/git";

import backport, { Label } from "./backport";

const [initial, dev, feature] = ["initial", "dev", "feature"];

const [initialCommit, devCommit, featureCommit] = [
  {
    lines: [initial, initial],
    message: initial,
  },
  {
    lines: [dev, initial],
    message: dev,
  },
  {
    lines: [dev, feature],
    message: feature,
  },
];

let octokit: Octokit;
let owner: RepoOwner;
let repo: RepoName;

const getLabel = ({ base, head }: { base: Reference; head?: Reference }) => ({
  name: `backport ${base}${head ? ` ${head}` : ""}`,
});

const getMergedPullRequestPayload = ({
  base,
  head,
  label = getLabel({ base, head }),
  merged = true,
}: {
  base: Reference;
  head?: Reference;
  label?: Label;
  merged?: boolean;
}) => ({
  pull_request: {
    labels: [label],
    merged,
  },
});

const getLabeledPullRequestPayload = ({
  base,
  head,
  label = getLabel({ base, head }),
  merged = true,
}: {
  base: Reference;
  head?: Reference;
  label?: Label;
  merged?: boolean;
}) => ({
  label,
  pull_request: {
    labels: [label],
    merged,
  },
});

beforeAll(() => {
  ({ octokit, owner, repo } = createTestContext());
});

describe.each([
  ["pull request merged", getMergedPullRequestPayload],
  ["label added on merged pull request", getLabeledPullRequestPayload],
])("nominal behavior for %s", (tmp, getPayload) => {
  const state = {
    initialCommit,
    refsCommits: {
      dev: [devCommit],
      feature: [devCommit, featureCommit],
      master: [],
    },
  };

  let backportedPullRequestNumber: PullRequestNumber;
  let base: Reference;
  let deleteReferences: DeleteReferences;
  let featurePullRequestNumber: PullRequestNumber;
  let head: Reference;
  let refsDetails: RefsDetails;

  beforeAll(async () => {
    ({ deleteReferences, refsDetails } = await createReferences({
      octokit,
      owner,
      repo,
      state,
    }));
    featurePullRequestNumber = await createPullRequest({
      base: refsDetails.dev.ref,
      head: refsDetails.feature.ref,
      octokit,
      owner,
      repo,
    });
    base = refsDetails.master.ref;
    head = `backport-${featurePullRequestNumber}-head`;
    const result = await backport({
      octokit,
      owner,
      payload: getPayload({
        base,
        head,
      }),
      pullRequestNumber: featurePullRequestNumber,
      repo,
    });
    backportedPullRequestNumber = result as PullRequestNumber;
  }, 20000);

  afterAll(async () => {
    await deleteReferences();
    await deleteReference({
      octokit,
      owner,
      ref: head,
      repo,
    });
  });

  test("pull request backported on the expected base", async () => {
    const {
      data: {
        base: { ref: actualBase },
      },
    } = await octokit.pullRequests.get({
      number: backportedPullRequestNumber,
      owner,
      repo,
    });
    expect(actualBase).toBe(base);
  });
});

test.each([
  [
    "unmerged pull request",
    getMergedPullRequestPayload({ base: "unused", merged: false }),
  ],
  [
    "unlabeled pull request",
    getMergedPullRequestPayload({ base: "unused", label: { name: "nope" } }),
  ],
  [
    "unrelated label event",
    getLabeledPullRequestPayload({ base: "unused", label: { name: "nope" } }),
  ],
  [
    "label event on unmerged pull request",
    getLabeledPullRequestPayload({ base: "unused", merged: false }),
  ],
])("ignoring %s", async (tmp, payload) => {
  const result = await backport({
    octokit,
    owner,
    payload,
    pullRequestNumber: 1337, // unused
    repo,
  });
  expect(result).toBeUndefined();
});

describe("error messages", () => {
  const getLastIssueComment = async (pullRequestNumber: PullRequestNumber) => {
    const { data: comments } = await octokit.issues.getComments({
      number: pullRequestNumber,
      owner,
      repo,
    });
    return comments[comments.length - 1].body;
  };

  describe("backport conflict", () => {
    const master = "master";

    const masterCommit = {
      lines: [initial, master],
      message: master,
    };

    const state = {
      initialCommit,
      refsCommits: {
        dev: [devCommit],
        feature: [devCommit, featureCommit],
        master: [masterCommit],
      },
    };

    let base: Reference;
    let deleteReferences: DeleteReferences;
    let pullRequestNumber: PullRequestNumber;
    let refsDetails: RefsDetails;

    beforeAll(async () => {
      ({ deleteReferences, refsDetails } = await createReferences({
        octokit,
        owner,
        repo,
        state,
      }));
      base = refsDetails.master.ref;
      pullRequestNumber = await createPullRequest({
        base: refsDetails.dev.ref,
        head: refsDetails.feature.ref,
        octokit,
        owner,
        repo,
      });
    }, 15000);

    afterAll(async () => {
      await deleteReferences();
    });

    test(
      "error and comment",
      async () => {
        await expect(
          backport({
            octokit,
            owner,
            payload: getMergedPullRequestPayload({ base }),
            pullRequestNumber,
            repo,
          }),
        ).rejects.toThrow("backport failed");
        const comment = await getLastIssueComment(pullRequestNumber);
        expect(comment).toMatch(
          new RegExp(`The backport to \`${base}\` failed`),
        );
      },
      15000,
    );
  });
});
