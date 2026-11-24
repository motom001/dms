# Tested platforms {#geprufte-plattformen}

These guides name many devices and systems. Here we say honestly **what the project tests itself** and what others have reported. We only make a promise where we can test ourselves.

## The levels {#die-stufen}

| Level | What it means | Promise |
| --- | --- | --- |
| **Tested automatically** | GitHub's machines test every change before it goes into Ablago – without a real NAS, but on both architectures. | yes, for every version |
| **Tested by the project** | The device stays with the project. We test on it before larger versions; the measurements are in [#576](https://github.com/motom001/dms/issues/576). | yes – until the date given |
| **Reported several times** | At least two independent reports from the community, one of them from recent versions. | no, a hint |
| **Single report** | "Runs according to one report." | no, a hint |

Every row names the **Ablago version and the date** of the last test or report. If a report is more than about 10 versions old, it says **older state** – new versions may behave differently.

## Tested by the project {#vom-projekt-gepruft}

| Device | Architecture | Level | Last test | Expected to be tested until | Reason |
| --- | --- | --- | --- | --- | --- |
| GitHub machine (Ubuntu, x64) | amd64 | tested automatically | ongoing: every change and every version | – | – |
| GitHub machine (Ubuntu, arm64) | arm64 | tested automatically | ongoing: every change and every version | – | – |
| UGREEN DXP4800 Plus | amd64 (Intel) | tested by the project | Ablago 0.143.0, 02.11.2026: load test `alle` ([measurements](https://github.com/motom001/dms/issues/576#issuecomment-6588590651)); runs there every day ([example](beispiel.md)) | 31.12.2028 | Device is still on sale; the current year plus 2 years of manufacturer warranty cover the support period |

**What the GitHub machines test:**

- **x64:** all automated tests with PostgreSQL 18, the images `dms` and `dms-komplett`, the templates for Synology, UGREEN, QNAP, TrueNAS, Unraid and the Raspberry Pi (start, Ablago responds, the setup wizard begins correctly). On top of that comes a weekly [load test](https://help.ablago.app/admin/aktuell/en/verkraftet/); the measurements are in [#576](https://github.com/motom001/dms/issues/576).
- **arm64:** on a real ARM machine (not emulated), build the images `dms` and `dms-komplett` and start them as a trial, plus the tools in the image.

The templates run on an ordinary Linux with Docker, not on the NAS itself. Whether a NAS's interface (Container Manager, App Center …) plays along only shows on a real device.

### Database: PostgreSQL { #postgresql }

| Major version | Status | Where |
| --- | --- | --- |
| **18** | **tested:** all automated tests, the templates, `dms-komplett` (since Ablago 0.306) | templates, `dms-komplett`, app from the [TrueNAS catalogue](truenas.md) |
| 17 | **no longer tested** (since Ablago 0.306; up to 0.305 all tests). Ablago starts and writes a note to the log. Only the move stays tested: back up on 17, restore on 18, data the same. | older installations with two containers |
| 16 | not tested; Ablago starts with a note in the log | your own database |
| 15 and older | Ablago doesn't start and states the reason | – |

How to move from 17 to 18 is described under [Updating → PostgreSQL 18](https://help.ablago.app/admin/aktuell/en/aktualisieren/#postgresql-18). Ablago's backups can be restored between 17 and 18 in both directions.

**The Raspberry Pi 5** is meant to become the next device "tested by the project". For that, the project is still looking for a device, see [What the project needs (#589)](https://github.com/motom001/dms/issues/589).

## Reported by the community {#aus-der-gemeinschaft-gemeldet}

| Device | Architecture | Level | Last report | Note |
| --- | --- | --- | --- | --- |
| *no report yet* | | | | |

A used mini PC, thin client or old notebook is often the cheapest choice – what to look out for is described under [Used hardware](gebrauchte-hardware.md).

Reports are a **hint, not a promise**. The project checks them for plausibility – do the values fit similar devices, are there contradictions? –, not for truth, and asks when something stands out. We never base decisions on reports alone; they can, however, be a reason to look for a device to be "tested by the project".

## What "expected to be tested until" means {#was-gepruft-voraussichtlich-bis-heit}

Every device the project tests itself gets a date **until when** we expect to test it, and the **reason** for it – for example a successor model, the end of updates from the manufacturer or an architecture for which there is no image any more. We set the duration for each device individually.

When a device runs out, it does **not disappear quietly**: it visibly changes to "no longer tested by the project (since version …, reason …)" and stays listed with its last measurements. We announce this in good time in the release notes.

| Device | No longer tested by the project since | Reason | Last measurements |
| --- | --- | --- | --- |
| *none so far* | | | |

## Report your device {#dein-gerat-melden}

Does Ablago run for you on a device that is missing here? We take reports in a fixed form, always with **device, Ablago version and date**:

- **With measurements:** [Run a load test yourself](https://help.ablago.app/admin/aktuell/en/lasttest/) and report the result in [Load test results (#576)](https://github.com/motom001/dms/issues/576).
- **Without measuring:** with the template "I use Ablago" – see [Who uses Ablago? (#466)](https://github.com/motom001/dms/issues/466).

Everything there is public – please no personal data, addresses, computer names or IP addresses.

Have a device to spare for the project – given, lent or for a few days? What we are looking for and why is in [What the project needs (#589)](https://github.com/motom001/dms/issues/589).
