import * as Octokit from "@octokit/rest";
import pSeries from "p-series";
import {
  deleteRef,
  PullRequestNumber,
  Ref,
  RepoName,
  RepoOwner,
} from "shared-github-internals/lib/git";
import { createTestContext } from "shared-github-internals/lib/tests/context";
import {
  createPullRequest,
  createRefs,
  DeleteRefs,
  RefsDetails,
} from "shared-github-internals/lib/tests/git";

import { backport, Label } from "./backport";

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

const getLabel = ({ base, head }: { base: Ref; head?: Ref }): Label => ({
  name: `backport ${base}${head ? ` ${head}` : ""}`,
});

beforeAll(() => {
  ({ octokit, owner, repo } = createTestContext());
});

describe("nominal behavior", () => {
  describe("pull request merged", () => {
    const state = {
      initialCommit,
      refsCommits: {
        dev: [devCommit],
        feature: [devCommit, featureCommit],
        production: [],
        staging: [],
      },
    };

    let backportedPullRequestNumbers: PullRequestNumber[];
    let bases: Ref[];
    let deleteRefs: DeleteRefs;
    let featurePullRequestNumber: PullRequestNumber;
    let refsDetails: RefsDetails;

    beforeAll(async () => {
      ({ deleteRefs, refsDetails } = await createRefs({
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
      bases = [refsDetails.production.ref, refsDetails.staging.ref];
      const results = await backport({
        octokit,
        owner,
        payload: {
          pull_request: {
            labels: bases.map(base => getLabel({ base })),
            merged: true,
          },
        },
        pullRequestNumber: featurePullRequestNumber,
        repo,
      });
      backportedPullRequestNumbers = (results as any) as PullRequestNumber[];
    }, 60000);

    afterAll(async () => {
      await deleteRefs();
      await pSeries(
        backportedPullRequestNumbers.map(pullRequestNumber => async () => {
          const {
            data: {
              head: { ref },
            },
          } = await octokit.pulls.get({
            owner,
            pull_number: pullRequestNumber,
            repo,
          });
          await deleteRef({
            octokit,
            owner,
            ref,
            repo,
          });
        }),
      );
    }, 10000);

    test("pull request backported on the expected bases", async () => {
      const actualBases = await pSeries(
        backportedPullRequestNumbers.map(pullRequestNumber => async () => {
          const {
            data: {
              base: { ref: actualBase },
            },
          } = await octokit.pulls.get({
            owner,
            pull_number: pullRequestNumber,
            repo,
          });
          return actualBase;
        }),
      );
      expect(actualBases).toEqual(bases);
    });
  });

  describe("label added on merged pull request", () => {
    const state = {
      initialCommit,
      refsCommits: {
        dev: [devCommit],
        feature: [devCommit, featureCommit],
        master: [],
      },
    };

    let backportedPullRequestNumber: PullRequestNumber;
    let base: Ref;
    let deleteRefs: DeleteRefs;
    let featurePullRequestNumber: PullRequestNumber;
    let head: Ref;
    let refsDetails: RefsDetails;

    beforeAll(async () => {
      ({ deleteRefs, refsDetails } = await createRefs({
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
      const label = getLabel({ base, head });
      const results = await backport({
        octokit,
        owner,
        payload: {
          label,
          pull_request: {
            labels: [label],
            merged: true,
          },
        },
        pullRequestNumber: featurePullRequestNumber,
        repo,
      });
      backportedPullRequestNumber = ((results as any) as PullRequestNumber[])[0];
    }, 30000);

    afterAll(async () => {
      await deleteRefs();
      await deleteRef({
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
      } = await octokit.pulls.get({
        owner,
        pull_number: backportedPullRequestNumber,
        repo,
      });
      expect(actualBase).toBe(base);
    });
  });
});

test.each([
  [
    "unmerged pull request",
    {
      pull_request: {
        labels: [getLabel({ base: "unused" })],
        merged: false,
      },
    },
  ],
  [
    "unlabeled pull request",
    {
      pull_request: {
        labels: [],
        merged: true,
      },
    },
  ],
  [
    "unrelated label event",
    {
      label: { name: "nope" },
      pull_request: {
        labels: [{ name: "nope" }],
        merged: true,
      },
    },
  ],
  [
    "label event on unmerged pull request",
    {
      label: getLabel({ base: "unused" }),
      pull_request: {
        labels: [getLabel({ base: "unused" })],
        merged: false,
      },
    },
  ],
])(
  "ignoring %s",
  // @ts-ignore
  async (tmp, payload) => {
    const backportedPullRequestNumbers = await backport({
      octokit,
      owner,
      payload: payload as any,
      pullRequestNumber: 1337, // unused
      repo,
    });
    expect(backportedPullRequestNumbers).toHaveLength(0);
  },
);

describe("error messages", () => {
  const getLastIssueComment = async (pullRequestNumber: PullRequestNumber) => {
    const { data: comments } = await octokit.issues.listComments({
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

    let base: Ref;
    let deleteRefs: DeleteRefs;
    let pullRequestNumber: PullRequestNumber;
    let refsDetails: RefsDetails;

    beforeAll(async () => {
      ({ deleteRefs, refsDetails } = await createRefs({
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
      await deleteRefs();
    });

    test("error and comment", async () => {
      await expect(
        backport({
          octokit,
          owner,
          payload: {
            pull_request: {
              labels: [getLabel({ base })],
              merged: true,
            },
          },
          pullRequestNumber,
          repo,
        }),
      ).rejects.toThrow(/backport.+failed/);
      const comment = await getLastIssueComment(pullRequestNumber);
      expect(comment).toMatch(new RegExp(`The backport to \`${base}\` failed`));
    }, 30000);
  });
});
