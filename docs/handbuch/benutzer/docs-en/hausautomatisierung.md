# Connecting Ablago to home automation {#ablago-in-die-hausautomatisierung-einbinden}

A lamp in the hallway that lights up when new post has arrived. A notification on your phone when a deadline is coming up. The number of open tasks on the wall tablet. For this you connect Ablago to your **home automation** – without anyone having to open Ablago.

The home automation only gets **numbers**: how much new post, how much is under *To do*, how much is **due within 7 days** and how much is overdue. It never sees titles, senders, names or documents.

## What's available {#was-es-gibt}

| System | Status |
| --- | --- |
| **Homey Pro** | App **Ablago** – values on the device and Flow cards such as "New post arrived" and "Deadline becomes due". Guide in the [README of the Homey app](https://github.com/motom001/dms-clients/blob/main/homey/README.md). |
| **Home Assistant** | later ([motom001/dms-clients#3](https://github.com/motom001/dms-clients/issues/3)) |
| Others (Node-RED, ioBroker, your own scripts) | via the [counter interface](https://help.ablago.app/admin/aktuell/en/api/#zaehler) with the same key, instantly via [webhook](#sofort-melden-webhook) |

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

If it should happen **instantly**, additionally set up a **webhook** (next section): then Ablago reports by itself, a few seconds after new post arrives, and the query can run less often.

## Report instantly (webhook) { #sofort-melden-webhook }

With a **webhook**, Ablago reports to your home automation as soon as your numbers change. The message contains **only the numbers** – the same as with the *counters only* key –, never titles, senders or contents.

**Once beforehand (administrator):** under **Workbench → Webhooks**, an administrator approves the address of the home automation as a **target**, e.g. `http://homey.home.arpa` or `http://192.168.178.20:1880`. Ablago only reports to approved targets. Without encryption (`http://`) this only works on the home network; otherwise `https://` is required.

**Then you:**

1. Open **My account → Notifications → Report instantly (webhooks)** and choose **+ New webhook**.
2. Enter a **name** (e.g. "Node-RED") and the **address of the receiver**, e.g. `http://192.168.178.20:1880/dms`.
3. Copy the **secret** (it begins with `whsec_`) and enter it at the receiver – it is only shown in full now. With it, the receiver checks that the message really comes from Ablago.
4. Right after that, a first message arrives with your current numbers. With **Send test** you send another one at any time; below it you see whether it arrived.

What happens:

- **Several changes at once** – such as 20 letters from the scanner – arrive as **a few messages**: at most one every 30 seconds, and the last one always has the newest state.
- **If the home automation is off**, Ablago tries again at increasing intervals, for about a day. You see the error on the webhook. If it doesn't work for that long, Ablago switches the webhook off and tells you under My account; the administrators get an e-mail. **Switch on** continues.
- **Arrived twice?** Every message has an **event id**. If the same id arrives again (for instance after Ablago restarts), it is a repeat and can be skipped.

A message looks like this:

```json
{"art":"zaehler.geaendert","id":"7c0e6a8e-3d1f-4f0a-9c55-2b8f0d3e4a11","zeit":"2026-11-03T07:15:02.000Z","daten":{"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}}
```

With **Send test**, `art` has the value `probe`.

### Example: Node-RED {#beispiel-node-red}

A small flow: an **http in** node accepts the message, a **function** node checks the signature, after that you can branch (lamp on, notification …).

1. Node **http in**: method `POST`, address `/dms`. Behind it, a node **http response** with status `204`, so Ablago knows that the message has arrived.
2. Node **function** between the two; under **Setup → Modules**, enter the module `crypto` with the name `crypto`, and in the tab **On Message**:

    ```js
    // The webhook's secret, e.g. as an environment variable of the flow.
    const geheimnis = env.get('DMS_WEBHOOK_GEHEIMNIS');
    const zeit = msg.req.headers['x-dms-zeit'];
    const signatur = msg.req.headers['x-dms-signatur'] || '';
    // Ablago sends compact JSON; JSON.stringify yields the same text again.
    const rumpf = JSON.stringify(msg.payload);
    const soll = 'v1=' + crypto.createHmac('sha256', geheimnis).update(zeit + '.' + rumpf).digest('hex');
    const frisch = Math.abs(Date.now() / 1000 - Number(zeit)) < 300;
    if (!frisch || signatur.length !== soll.length || !crypto.timingSafeEqual(Buffer.from(signatur), Buffer.from(soll))) {
      msg.statusCode = 401;
      return [null, msg];          // output 2: reject
    }
    // skip repeats
    const gesehen = flow.get('dms_ids') || [];
    if (gesehen.includes(msg.payload.id)) return [null, msg];
    flow.set('dms_ids', [...gesehen.slice(-50), msg.payload.id]);
    msg.payload = msg.payload.daten;  // { neuePost, zuErledigen, ueberfaellig, stand, geaendert }
    return [msg, msg];               // output 1: continue in the flow, output 2: response
    ```

3. Set the function node to **2 outputs**: output 2 to **http response**, output 1 to your logic, e.g. a **switch** on `msg.payload.neuePost > 0`.

Whether an app already uses the webhook is stated in its README. Format, headers and checking the signature in other languages are described in the [Developer manual](https://help.ablago.app/entwickler/aktuell/en/aufbau/#webhooks).

Technical details of the interface are in the [Administrator manual](https://help.ablago.app/admin/aktuell/en/api/#zaehler).
