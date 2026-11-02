# Contributing

[Deutsch](CONTRIBUTING.md) · **English**

Thank you for your interest in the DMS! **Issues and pull requests are welcome in German or English.** How contributing works here is described in detail in the **[developer manual](https://motom001.github.io/dms/entwickler/aktuell/)** (German). The essentials in brief:

1. **Start with an issue**, written as a user story ("As a … I want …, so that …") with acceptance criteria. This applies to feature requests and bugs alike.
2. **Discussion happens in the issue** until it is clear what will be built.
3. **Only issues labelled `freigegeben` (approved) get implemented.** This label is set by the maintainer ([@motom001](https://github.com/motom001)) alone. Pull requests for issues that are not approved will not be merged.
4. **Pull request** with `Closes #…`, tests, an updated manual and, for a new version, release notes. Only the maintainer merges.

## New dependencies only with a reason

The DMS gets by with very little third-party code – this protects against supply-chain attacks and keeps maintenance and the image small. A **new runtime dependency** (an npm package under `dependencies`, or an Alpine package via `apk add` in the `Dockerfile`) is therefore only accepted with a reason given in the pull request:

- **What for** is it needed?
- **Why not** with what Node.js already provides, or with the dependencies and tools already in use?
- **Licence** – compatible with Apache-2.0?
- **Maintenance** – latest release, number of maintainers?
- **Its own dependencies** – what else does it bring into the image?

The pull request template asks for this; the "Abhängigkeiten" (dependencies) check points out new dependencies in the PR. The current list with the purpose of each is in the [developer manual](https://motom001.github.io/dms/entwickler/aktuell/aufbau/#abhaengigkeiten) (German).

By contributing, you license your contribution under the [Apache-2.0](LICENSE). Please do not commit real documents or personal data.

The DMS itself, its user interface and its manuals are in German; an English user interface and manual are planned (#357). You do not need to speak German to report a bug, suggest a feature or send a pull request.

## Code of conduct

Our [code of conduct](CODE_OF_CONDUCT.md) applies to how we treat each other. The German text there is a translation of the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) – read the English original there. Reports go to [dms.github@thomas.meissner.me](mailto:dms.github@thomas.meissner.me), in German or English.
