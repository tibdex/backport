Backport is a [JavaScript GitHub Action](https://help.github.com/en/articles/about-actions#javascript-actions) to backport a pull request by simply adding a label to it.

It can backport [rebased and merged](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges#rebase-and-merge-your-pull-request-commits) pull requests with a single commit and [squashed and merged](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges#squash-and-merge-your-pull-request-commits) pull requests.
It thus integrates well with [Autosquash](https://github.com/marketplace/actions/autosquash).

# Usage

1.  :electric_plug: Add this [.github/workflows/backport.yml](.github/workflows/backport.yml) to your repository.

2.  :speech_balloon: Let's say you want to backport a pull request on a branch named `production`.

    Then label it with `backport production`. (See [how to create labels](https://help.github.com/articles/creating-a-label/).)

3.  :sparkles: That's it! When the pull request gets merged, it will be backported to the `production` branch.
    If the pull request cannot be backported, a comment explaining why will automatically be posted.

_Note:_ multiple backport labels can be added.
For example, if a pull request has the labels `backport staging` and `backport production` it will be backported to both branches: `staging` and `production`.

## Inputs

- `github_token`: `string`- **required**

- `title_template`: `string` - A custom title tempalte that will be used as the title for the Backport pull request

- `reuse_pr_body`: `bool` - Allows Backport to copy the original pull request body contents and use them in the Backport pull request

- `add_labels`: `string[]` - String array of `labels` to be added to the Backport pull request (e.g. `reviewed,ready-for-release,etc.` -> All of these will be added as labels to the new PR)
