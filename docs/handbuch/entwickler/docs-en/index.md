# Contributing to Ablago {#mitmachen-bei-ablago}

Great that you want to contribute! Ablago is a small project with one maintainer ([motom001](https://github.com/motom001)). So that contributions fit together and nothing is built in vain, a simple way of working applies.

**Issues and pull requests are welcome in German or English.** For English-speaking contributors there are [README](https://github.com/motom001/dms/blob/main/README.en.md), [CONTRIBUTING](https://github.com/motom001/dms/blob/main/CONTRIBUTING.en.md) and [SECURITY](https://github.com/motom001/dms/blob/main/SECURITY.en.md) in English; the issue templates are bilingual.

## How it works {#so-lauft-es}

![How a contribution runs: issue as a user story, discussion, label "freigegeben", implementing in a branch, pull request, checks, merge by the maintainer, then release, image, manual and app stores automatically](grafiken/ablauf-beitrag.png){ loading=lazy }

1. **Everything starts with an issue**, written as a user story: *"As … I want …, so that …"* and with acceptance criteria as a checklist. That applies to requests as well as bugs. Template: [New issue](https://github.com/motom001/dms/issues/new/choose). State **who** the request is for: which of the [personas](personas.md), from the beginner family to the large enterprise.
2. **Discussion happens in the issue** until it is clear what will be built and what won't.
3. **Only what carries the label `freigegeben` (approved) is implemented.** Only the maintainer gives this label. Without approval a pull request isn't merged, even if it is good. Better ask in the issue before you get going.
4. **Pull request** with `Closes #…`, tests, updated manual and release notes (see [Submitting a contribution](beitrag.md)).
5. **Only the maintainer merges.** Afterwards release, image, manual and the app store entries arise by themselves (see [Release](release.md)).

!!! info "Why the label only comes from the maintainer"
    Ablago manages contracts, ID documents and tax records of families and small businesses. Every function has to be maintained, documented and considered in backup and restore for good. Approval is the moment at which the maintainer says: this fits the product, and I can carry it in the long term. A workflow removes the label again if someone else sets it.

!!! note "Who we build for"
    Ablago is document filing for home and small businesses. At its core it is built for Lena, the beginner, Jonas with his phone and Markus with his NAS; Petra, Mr Özdemir, the self-employed such as Katrin and small businesses are also part of the focus. If a function conflicts with simplicity for the first three, the three win. More: [Who we build for](personas.md).

## What every contribution keeps to { #was-jeder-beitrag-einhalt }

These guard rails come from Ablago's mission and apply to core, packages and clients alike:

- **Nothing leaves the device without explicit consent.** Every way outside is switched off until a person triggers it or an administrator switches it on – and the manual says what goes out and where (see [Ways outside](nach-draussen.md#wege-nach-draussen)).
- **No telemetry,** not even anonymous, no crash reports, nothing from outside servers in interface and manual.
- **Open formats:** what comes in must come out again in open formats (full export, archive version).
- **Updates change nothing secretly:** every change has a version and release notes; data is only restructured with a migration and traceably.
- **Thinks along, on your device:** recognising, reminding and searching run locally; an outside service only if someone sets it up explicitly.
- **Simple first:** something new mustn't make things more complicated for Lena, Jonas and Markus.

## Where to start { #wo-anfangen }

1. [Getting started](loslegen.md): fetch, start and check the project.
2. [Architecture](aufbau.md): the map – what lives where and which way a request takes.
3. [Adding something new](checklisten.md): checklists for a new page in the workbench and a new route.
4. [Submitting a contribution](beitrag.md): what a pull request brings along.

Which repository is there for what is under [Our repositories](repositories.md).

## Where you can help {#wo-du-helfen-kannst}

- **Report bugs**, ideally with **Workbench → System health → Version and updates → Copy overview for GitHub**.
- **Check and illustrate guides**, e.g. for [Synology, QNAP, UGREEN, TrueNAS or Unraid](https://help.ablago.app/installieren/aktuell/en/), if you have such a device.
- **Issues with the label `good first issue`**: small, well-delimited tasks.
- **Clients** for home automation, phone or office in the repository [dms-clients](https://github.com/motom001/dms-clients) – see [Developing clients](clients.md).
- **Translations:** interface and manuals exist in German and English (#729, #730). Improvements to the English are welcome; further languages will come as language packages ([#731](https://github.com/motom001/dms/issues/731)).

## Licence {#lizenz}

Ablago is under the [Apache-2.0](https://github.com/motom001/dms/blob/main/LICENSE) (up to and including 0.92.0: AGPL-3.0). With a contribution you put it under the same licence. Don't commit real documents or personal data, only code and sample data.
