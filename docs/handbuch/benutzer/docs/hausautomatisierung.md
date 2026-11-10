# Ablago in die Hausautomatisierung einbinden

Eine Lampe im Flur, die leuchtet, wenn neue Post da ist. Eine Mitteilung aufs Handy, wenn eine Frist ansteht. Die Zahl der offenen Aufgaben auf dem Wand-Tablet. Dafür bindest du Ablago in deine **Hausautomatisierung** ein – ohne dass jemand Ablago öffnen muss.

Die Hausautomatisierung bekommt dabei **nur Zahlen**: wie viel neue Post, wie viel unter *Zu erledigen*, wie viel **fällig in 7 Tagen** und wie viel überfällig ist. Titel, Absender, Namen oder Dokumente sieht sie nie.

## Was es gibt

| System | Stand |
| --- | --- |
| **Homey Pro** | App **Ablago** – Werte am Gerät und Flow-Karten wie „Neue Post angekommen“ und „Frist wird fällig“. Anleitung im [README der Homey-App](https://github.com/motom001/dms-clients/blob/main/homey/README.md). |
| **Home Assistant** | später ([motom001/dms-clients#3](https://github.com/motom001/dms-clients/issues/3)) |
| Andere (Node-RED, ioBroker, eigene Skripte) | über die [Zähler-Schnittstelle](https://help.ablago.app/admin/aktuell/api/#zaehler) mit demselben Schlüssel, sofort per [Webhook](#sofort-melden-webhook) |

Die Apps und Anbindungen liegen im Repository [motom001/dms-clients](https://github.com/motom001/dms-clients). Du brauchst keine davon – Ablago ist vollständig im Browser bedienbar.

!!! note "Nur im Heimnetz"
    Die Hausautomatisierung fragt dein Ablago direkt im Heimnetz ab. Deshalb geht es mit **Homey Pro**, nicht mit Homey Cloud: Ein Dienst im Internet erreicht ein DMS in deinem Heimnetz nicht.

## Schlüssel „nur Zähler“ anlegen

Die Hausautomatisierung meldet sich mit einem **API-Schlüssel** an. Nimm dafür die Stufe **nur Zähler**:

1. Melde dich als die Person an, deren Zahlen angezeigt werden sollen – die Zahlen gelten immer für den Benutzer des Schlüssels und in seinen Rechten.
2. Öffne **Mein Konto → Sicherheit → API-Schlüssel** (oben rechts auf deinen Namen klicken) und erzeuge einen neuen Schlüssel, z. B. „Homey“.
3. Wähle unter **Rechte** die Stufe **nur Zähler**.
4. Kopiere den Schlüssel gleich (er beginnt mit `dms_`) – er ist nur jetzt ganz zu sehen – und trag ihn zusammen mit der Adresse deines Ablago (z. B. `https://dms.home.arpa`) in der Hausautomatisierung ein.

Warum *nur Zähler*: Dieser Schlüssel ruft **nur die Zahlen** ab; alles andere lehnt das Ablago ab, auch das [Laufwerk](laufwerk.md). Geht er verloren – etwa mit einer Sicherung der Hausautomatisierung –, erfährt jemand höchstens, wie viel Post und Aufgaben du hast.

!!! tip "Für mehrere Personen"
    Soll die Familie die Zahlen von Lena und Jonas getrennt sehen, legt jede Person ihren eigenen Schlüssel *nur Zähler* an. Wie die einzelne App das abbildet, steht in ihrem README.

Brauchst du den Schlüssel nicht mehr, löschst du ihn unter **Mein Konto → Sicherheit → API-Schlüssel**; die Hausautomatisierung meldet dann „Schlüssel ungültig“.

## Wie schnell die Hausautomatisierung Neues bemerkt

Die Apps fragen Ablago in einem festen Abstand ab (welcher, steht im README der App). Hat sich nichts geändert, antwortet Ablago nur mit „nichts Neues“ – das kostet praktisch nichts. Neue Post bemerkt die Hausautomatisierung also spätestens nach einem Abfrage-Abstand.

Soll es **sofort** gehen, richtest du zusätzlich einen **Webhook** ein (nächster Abschnitt): Dann meldet sich Ablago selbst, wenige Sekunden nachdem neue Post da ist, und die Abfrage darf seltener laufen.

## Sofort melden (Webhook) { #sofort-melden-webhook }

Mit einem **Webhook** meldet sich Ablago bei deiner Hausautomatisierung, sobald sich deine Zahlen ändern. Die Meldung enthält **nur die Zahlen** – dieselben wie beim Schlüssel *nur Zähler* –, nie Titel, Absender oder Inhalte.

**Einmal vorab (Administrator):** Unter **Werkbank → Webhooks** gibt ein Administrator die Adresse der Hausautomatisierung als **Ziel** frei, z. B. `http://homey.home.arpa` oder `http://192.168.178.20:1880`. Nur an freigegebene Ziele meldet Ablago. Ohne Verschlüsselung (`http://`) geht das nur im Heimnetz; sonst braucht es `https://`.

**Dann du:**

1. Öffne **Mein Konto → Benachrichtigungen → Sofort melden (Webhooks)** und wähle **+ Neuer Webhook**.
2. Gib einen **Namen** (z. B. „Node-RED“) und die **Adresse des Empfängers** ein, z. B. `http://192.168.178.20:1880/dms`.
3. Kopiere das **Geheimnis** (es beginnt mit `whsec_`) und trag es beim Empfänger ein – es ist nur jetzt ganz zu sehen. Damit prüft der Empfänger, dass die Meldung wirklich von Ablago kommt.
4. Gleich danach kommt eine erste Meldung mit deinen aktuellen Zahlen. Mit **Probe senden** schickst du jederzeit eine weitere; darunter siehst du, ob sie angekommen ist.

Was dabei geschieht:

- **Mehrere Änderungen auf einmal** – etwa 20 Briefe aus dem Scanner – kommen als **wenige Meldungen**: höchstens eine je 30 Sekunden, und die letzte hat immer den neuesten Stand.
- **Ist die Hausautomatisierung aus**, versucht es Ablago mit wachsenden Abständen erneut, etwa einen Tag lang. Den Fehler siehst du am Webhook. Klappt es so lange nicht, schaltet Ablago den Webhook ab und sagt dir das unter Mein Konto; die Administratoren bekommen eine E-Mail. Mit **Einschalten** geht es weiter.
- **Doppelt angekommen?** Jede Meldung hat eine **Ereignis-Id**. Kommt dieselbe Id noch einmal (etwa nach einem Neustart von Ablago), ist es eine Wiederholung und kann übergangen werden.

Eine Meldung sieht so aus:

```json
{"art":"zaehler.geaendert","id":"7c0e6a8e-3d1f-4f0a-9c55-2b8f0d3e4a11","zeit":"2026-11-03T07:15:02.000Z","daten":{"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}}
```

Bei **Probe senden** steht unter `art` der Wert `probe`.

### Beispiel: Node-RED

Ein kleiner Flow: Ein **http in**-Knoten nimmt die Meldung an, ein **function**-Knoten prüft die Signatur, danach kannst du verzweigen (Lampe an, Mitteilung …).

1. Knoten **http in**: Methode `POST`, Adresse `/dms`. Dahinter einen Knoten **http response** mit Status `204`, damit Ablago weiß, dass die Meldung angekommen ist.
2. Knoten **function** zwischen beide, unter **Setup → Module** das Modul `crypto` mit dem Namen `crypto` eintragen, und im Reiter **Nachricht empfangen**:

    ```js
    // Geheimnis des Webhooks, z. B. als Umgebungsvariable des Flows.
    const geheimnis = env.get('DMS_WEBHOOK_GEHEIMNIS');
    const zeit = msg.req.headers['x-dms-zeit'];
    const signatur = msg.req.headers['x-dms-signatur'] || '';
    // Das DMS schickt kompaktes JSON; JSON.stringify ergibt wieder denselben Text.
    const rumpf = JSON.stringify(msg.payload);
    const soll = 'v1=' + crypto.createHmac('sha256', geheimnis).update(zeit + '.' + rumpf).digest('hex');
    const frisch = Math.abs(Date.now() / 1000 - Number(zeit)) < 300;
    if (!frisch || signatur.length !== soll.length || !crypto.timingSafeEqual(Buffer.from(signatur), Buffer.from(soll))) {
      msg.statusCode = 401;
      return [null, msg];          // Ausgang 2: ablehnen
    }
    // Wiederholungen übergehen
    const gesehen = flow.get('dms_ids') || [];
    if (gesehen.includes(msg.payload.id)) return [null, msg];
    flow.set('dms_ids', [...gesehen.slice(-50), msg.payload.id]);
    msg.payload = msg.payload.daten;  // { neuePost, zuErledigen, ueberfaellig, stand, geaendert }
    return [msg, msg];               // Ausgang 1: weiter im Flow, Ausgang 2: Antwort
    ```

3. Den function-Knoten auf **2 Ausgänge** stellen: Ausgang 2 an **http response**, Ausgang 1 an deine Logik, z. B. einen **switch** auf `msg.payload.neuePost > 0`.

Ob eine App den Webhook schon nutzt, steht in ihrem README. Format, Köpfe und die Prüfung der Signatur in anderen Sprachen stehen im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/aufbau/#webhooks).

Technische Einzelheiten zur Schnittstelle stehen im [Administratorhandbuch](https://help.ablago.app/admin/aktuell/api/#zaehler).
