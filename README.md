[![build status](https://img.shields.io/circleci/project/github/tibdex/backport.svg)](https://circleci.com/gh/tibdex/backport)

# Goal

Backport is a GitHub App, based on [Probot](https://probot.github.io/), to backport a pull request by simply commenting it. [Try it!](https://github.com/apps/backporting)

# Usage

1.  :electric_plug: Install the publicly hosted [Backport GitHub App](https://github.com/apps/backporting) on your repository.
2.  :speech_balloon: Post a comment on a pull request such as `/backport production`.
3.  :sparkles: That's it! This pull request will be backported to the `production` branch. If the pull request cannot be backported, a comment will automatically be posted to explain why.

# How it Works

Backport relies on [`github-backport`](https://www.npmjs.com/package/github-backport) (which itself relies on [`github-cherry-pick`](https://www.npmjs.com/package/github-cherry-pick)) to perform all the required Git operations directly through the GitHub REST API instead of having to clone repositories on a server and executing Git CLI commands.

`github-backport` is the :old_key: to being able to run backport as a stateless, easy to maintain, and cheap to operate, GitHub App!

## Which Permissions & Webhooks Is Backport Using?

### Permissions

- **Repository contents** _[read & write]_: because the backporting process requires creating commits and manipulating branches.
- **Issues** _[read & write]_: to post comments when the backport process fails.
- **Pull requests** _[read & write]_: to create new pull requests.

### Webhooks

- **Issue comment**: to detect command comments addressed to Backport.
