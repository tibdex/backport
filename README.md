Hotfix Bot is a [JavaScript GitHub Action](https://help.github.com/en/articles/about-actions#javascript-actions) to backport a pull request to a list of branches by simply adding a 'Hotfix' label to it.

It can backport [rebased and merged](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges#rebase-and-merge-your-pull-request-commits) pull requests with a single commit and [squashed and merged](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges#squash-and-merge-your-pull-request-commits) pull requests.
It thus integrates well with [Autosquash](https://github.com/marketplace/actions/autosquash).

# Usage

1.  :electric_plug: Add this [.github/workflows/hotfix.yml](.github/workflows/hotfix.yml) to your repository.
2.  :speech_balloon: Change the `branches` key to the branch names you want hotfixes backported to.
3.  :sparkles: That's it! When the pull request gets merged, it will be backported to the specified branches.
    If the pull request cannot be backported, a comment explaining why will automatically be posted.
