// @flow strict

import { deleteReference } from "shared-github-internals/lib/git";
import { createTestContext } from "shared-github-internals/lib/tests/context";
import {
  createPullRequest,
  createReferences,
} from "shared-github-internals/lib/tests/git";

import backport from "../src/backport";

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

let commenter, octokit, owner, repo;

beforeAll(() => {
  ({ octokit, owner, repo } = createTestContext());
  commenter = owner;
});

describe("nominal behavior", () => {
  const state = {
    initialCommit,
    refsCommits: {
      dev: [devCommit],
      feature: [devCommit, featureCommit],
      master: [],
    },
  };

  let backportedPullRequestNumber,
    base,
    deleteReferences,
    featurePullRequestNumber,
    head,
    refsDetails;

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
    backportedPullRequestNumber = await backport({
      base,
      commenter,
      head,
      number: featurePullRequestNumber,
      octokit,
      owner,
      repo,
    });
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

describe("error messages", () => {
  const getLastIssueComment = async number => {
    const { data: comments } = await octokit.issues.getComments({
      number,
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

    let base, deleteReferences, number, refsDetails;

    beforeAll(async () => {
      ({ deleteReferences, refsDetails } = await createReferences({
        octokit,
        owner,
        repo,
        state,
      }));
      base = refsDetails.master.ref;
      number = await createPullRequest({
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
            base,
            commenter,
            number,
            octokit,
            owner,
            repo,
          })
        ).rejects.toThrow("backport failed");
        const comment = await getLastIssueComment(number);
        expect(comment).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp
          new RegExp(`The backport to \`${base}\` failed`, "u")
        );
      },
      15000
    );
  });

  describe("trying to backport an issue", () => {
    let number;

    beforeAll(async () => {
      ({
        data: { number },
      } = await octokit.issues.create({ owner, repo, title: "Untitled" }));
    });

    afterAll(async () => {
      await octokit.issues.edit({ number, owner, repo, state: "closed" });
    });

    test("error and comment", async () => {
      await expect(
        backport({
          base: "unused",
          commenter,
          number,
          octokit,
          owner,
          repo,
        })
      ).rejects.toThrow("issue is not a visible pull request");
      const comment = await getLastIssueComment(number);
      expect(comment).toBe("Issues cannot be backported, only pull requests.");
    });
  });

  describe("commenter doesn't have write access", () => {
    const base = "unused-base";
    const head = "unused-head";

    const state = {
      initialCommit,
      refsCommits: {
        dev: [devCommit],
        feature: [devCommit, featureCommit],
      },
    };

    let deleteReferences, number, refsDetails;

    beforeAll(async () => {
      ({ deleteReferences, refsDetails } = await createReferences({
        octokit,
        owner,
        repo,
        state,
      }));
      number = await createPullRequest({
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
      "error, comment and no head branch created",
      async () => {
        await expect(
          backport({
            _userHasWritePermission: () => Promise.resolve(false),
            base,
            commenter,
            head,
            number,
            octokit,
            owner,
            repo,
          })
        ).rejects.toThrow(`commenter ${owner} doesn't have write permission`);
        const comment = await getLastIssueComment(number);
        expect(comment).toBe(
          `Sorry @${owner} but you need write permission on this repository to backport a pull request.`
        );
        await expect(
          octokit.repos.getBranch({
            branch: head,
            owner,
            repo,
          })
        ).rejects.toThrow(/Branch not found/u);
      },
      15000
    );
  });
});
