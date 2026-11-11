# Developing clients {#clients-entwickeln}

**Clients** are programs that run **outside Ablago** and talk to Ablago: the app for Homey Pro, later an integration for Home Assistant, a phone app, add-ins for the office. Ablago itself needs no client – everything works in the browser. A client is an extra.

## Where clients live { #wo-clients-liegen }

All clients are in the repository [motom001/dms-clients](https://github.com/motom001/dms-clients), each in a **folder of its own directly below the root** (e.g. `homey/`) with `README.md` and `CHANGELOG.md`. Which exist and which are planned is in the [README](https://github.com/motom001/dms-clients#readme). Like everything at Ablago, a new client starts with an issue (template "New client") and the label `freigegeben`.

The rules in detail are in the [CONTRIBUTING of dms-clients](https://github.com/motom001/dms-clients/blob/main/CONTRIBUTING.md) – that is their one place. In short:

- **Only Ablago's API v1** ([Interface](https://help.ablago.app/admin/aktuell/en/api/)). If something is missing there, request it in the repository `dms` – a client builds no detours and never accesses database or files.
- **Narrowest key level:** "counters only", "read only" or "read and write". The client's README says which it needs and why.
- **No telemetry, no advertising, no connections to third parties.** A client only talks to the Ablago address that someone enters. Exceptions only where the platform strictly requires them, and then in the README.
- **README and CHANGELOG per client**, version in the format `X.Y.Z`; the release arises by itself after the merge. Commits with `git commit -s`.

## Interfaces for clients { #schnittstellen-fur-clients }

Most integrations only need **numbers**, no content:

- **Counter endpoint** `GET /api/v1/ich/zaehler` with the key level "counters only" – returns the numbers the interface shows too, without titles, senders or documents. See [Counter endpoint and key levels](aufbau.md#zaehler-endpunkt).
- **Reporting to the outside** – Ablago does not report on its own; clients query the counter. There has been no separate webhook since #991; in future an automation reports (see [Reporting to the outside](aufbau.md#nach-aussen-melden)).

More than numbers (filing post, reading folders) works via the other endpoints of API v1 with a key "read only" or "read and write".

## The same in all clients { #gleich-in-allen-clients }

A client should look and work like Ablago itself: name **Ablago**, terms from the [glossary](https://help.ablago.app/benutzer/aktuell/en/begriffe/) addressing the user as "you", paths the way you click ("Click your name at the top right → My account → Security → API keys"), icons from [Lucide](https://lucide.dev) in the same shapes as the interface, logo and colours only from the folder `marke/` of [dms-website](https://github.com/motom001/dms-website). The exact names of the numbers and triggers are in the CONTRIBUTING of `dms-clients`.

## Home network and data protection { #heimnetz-und-datenschutz }

- Ablago usually runs in the home network. A client must be able to handle addresses such as `http://ablago.home.arpa:8080` and says understandably when it can't reach Ablago.
- API keys belong in the platform's secure storage (keychain, encrypted settings), never in logs.
- A client stores at most what it needs for display, and says in the README under "Data protection" what is where.
- What is under [What every contribution keeps to](index.md#was-jeder-beitrag-einhalt) applies to all contributions – above all: nothing leaves the device without explicit consent.
