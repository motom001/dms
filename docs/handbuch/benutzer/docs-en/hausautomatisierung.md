# Connecting Ablago to home automation {#ablago-in-die-hausautomatisierung-einbinden}

A lamp in the hallway that lights up when new post has arrived. A notification on your phone when a deadline is coming up. The number of open tasks on the wall tablet. For this you connect Ablago to your **home automation** – without anyone having to open Ablago.

The home automation only gets **numbers**: how much new post, how much is under *To do*, how much is **due within 7 days** and how much is overdue. It never sees titles, senders, names or documents.

## What's available {#was-es-gibt}

| System | Status |
| --- | --- |
| **Homey Pro** | App **Ablago** – values on the device and Flow cards such as "New post arrived" and "Deadline becomes due". Guide in the [README of the Homey app](https://github.com/motom001/dms-clients/blob/main/homey/README.md). |
| **Home Assistant** | later ([motom001/dms-clients#3](https://github.com/motom001/dms-clients/issues/3)) |
| Others (Node-RED, ioBroker, your own scripts) | via the [counter interface](https://help.ablago.app/admin/aktuell/en/api/#zaehler) with the same key |

The apps and integrations are in the repository [motom001/dms-clients](https://github.com/motom001/dms-clients). You don't need any of them – Ablago can be used entirely in the browser.

!!! note "Only on the home network"
    The home automation queries your Ablago directly on the home network. That's why it works with **Homey Pro**, not with Homey Cloud: a service on the internet can't reach a DMS on your home network.

## Create a "counters only" key {#schlussel-nur-zahler-anlegen}

The home automation signs in with an **API key**. Use the level **counters only** for it:

1. Sign in as the person whose numbers should be shown – the numbers always apply to the key's user and within their permissions.
2. Open **My account → Security → API keys** (click your name at the top right) and create a new key, e.g. "Homey".
3. Under **Permissions**, choose the level **counters only**.
4. Copy the key straight away (it begins with `dms_`) – it is only shown in full now – and enter it in the home automation together with the address of your Ablago (e.g. `https://dms.home.arpa`).

Why *counters only*: this key **only retrieves the numbers**; Ablago rejects everything else, including the [network drive](laufwerk.md). If it is lost – for instance with a backup of the home automation –, someone learns at most how much post and how many tasks you have.

!!! tip "For several people"
    If the family should see Lena's and Jonas's numbers separately, each person creates their own *counters only* key. How the individual app handles that is described in its README.

If you no longer need the key, delete it under **My account → Security → API keys**; the home automation then reports "key invalid".

## How quickly the home automation notices something new {#wie-schnell-die-hausautomatisierung-neues-bemerkt}

The apps query Ablago at a fixed interval (which one is in the app's README). If nothing has changed, Ablago only answers "nothing new" – that costs practically nothing. So the home automation notices new post at the latest after one query interval.

## Querying and reporting { #abfragen-und-melden }

Ablago keeps the two directions apart:

- **Querying via the interface:** the home automation fetches the numbers itself – with the *counters only* key (see above). This is how the Homey app, Node-RED, ioBroker and your own scripts work.
- **Reporting via automations:** if Ablago should report something to the outside on its own, an administrator will set this up under **Workbench → Automations**, with the Then card **"Call URL"**. This card comes with a later version ([#671](https://github.com/motom001/dms/issues/671)); until then the home automation queries.

!!! note "No personal webhook under My account any more"
    Previously, every person could enter a webhook under **My account** that reported their numbers instantly; it came with the **Webhooks** area in the Workbench with approved destinations. Both have been removed ([#991](https://github.com/motom001/dms/issues/991)); Ablago removed any webhooks during the update. Querying with the *counters only* key stays as it is.

Technical details of the interface are in the [Administrator manual](https://help.ablago.app/admin/aktuell/en/api/#zaehler).
