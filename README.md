[![build status](https://img.shields.io/circleci/project/github/tibdex/backport.svg)](https://circleci.com/gh/tibdex/backport)

# Goal

Backport is a GitHub App, based on [Probot](https://probot.github.io/), to backport a pull request by simply commenting it. [Try it!](https://github.com/apps/backporting)

# Usage

1.  :electric_plug: Install the publicly hosted [Backport GitHub App](https://github.com/apps/backporting) on your repository.
2.  :speech_balloon: Let's say, as a user with write permission on the repository, you want to backport a pull request on a branch named `production`. Then post the comment `/backport production` on this pull request.
3.  :sparkles: That's it! The pull request will be backported to the `production` branch. If the pull request cannot be backported, a comment explaining why will automatically be posted.

## Naming the Head Branch

You can name the _head_ branch of pull requests created by Backport by passing the desired name as a second argument.

For instance, `/backport production awesome-branch` would backport the commits of the original pull request to a branch called `awesome-branch` and create a new pull request to merge `my-branch` into `production`.

# How it Works

Backport relies on [`github-backport`](https://www.npmjs.com/package/github-backport) to perform all the required Git operations directly through the GitHub REST API instead of having to clone repositories on a server and executing Git CLI commands.

`github-backport` is the :old_key: to being able to run Backport as a stateless, easy to maintain, and cheap to operate, GitHub App!

## Which Permissions & Webhooks Is Backport Using?

### Permissions

- **Repository contents** _[read & write]_: because the backporting process requires creating commits and manipulating branches.
- **Issues** _[read & write]_: to post comments when the backport process fails.
- **Pull requests** _[read & write]_: to create new pull requests.

### Webhooks

- **Issue comment**: to detect comments addressed to Backport.
