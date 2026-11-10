# Anmeldeschutz

Nach zu vielen falschen Passwörtern sperrt Ablago die Anmeldung. Unter **Werkbank → Einstellungen → Anmeldeschutz** stellst du ein, wann und wie lange. Den Schlüssel für Passwörter und Sicherungen findest du unter **Benutzer und Sicherheit → [Verschlüsselung](verschluesselung.md)**.

--8<-- "ausgeblendet-organisation.md"

## Zwei Sperren

| Sperre | Standard | Wofür |
| --- | --- | --- |
| **Je E-Mail-Adresse und IP** | 5 Fehlversuche → 1 Minute | jemand vertippt sich oder probiert ein Passwort für ein Konto durch |
| **Je IP-Adresse**, über alle E-Mail-Adressen | 30 Fehlversuche → 60 Minuten | jemand probiert von einer Adresse aus viele Konten durch |

Die Sperrdauer je IP darf auch **0** sein: Dann bleibt die Adresse gesperrt, bis jemand, der den Anmeldeschutz verwaltet, sie freigibt. Die Fehlversuche je IP zählen innerhalb der Sperrdauer (bei „dauerhaft“ innerhalb einer Stunde).

Fehlversuche und Sperren stehen in der Datenbank: Sie überstehen einen Neustart und gelten für alle Prozesse von Ablago an derselben Datenbank. Eine Wiederherstellung aus der Sicherung bringt keine Sperren mit. Jede Sperre und jedes Entsperren steht im [Protokoll](fehlersuche.md#protokoll).

## Mail an die Verwaltenden { #mail-an-die-administratoren }

Ist Ablago aus dem Internet erreichbar, probieren Fremde ständig Passwörter durch. Das ist normal, und die Sperren passieren automatisch. Darum schickt Ablago im Standard **keine Mail**, wenn es sperrt. Was gesperrt ist, siehst du jederzeit unter **Werkbank → Anmeldeschutz** und im Protokoll.

Wer trotzdem Bescheid wissen will, schaltet unter **Werkbank → Ablage aufbauen → [Automatisierungen](automatisierungen.md#benachrichtigungen)** eine oder beide Automatisierungen ein (das Paket **Benachrichtigungen** bringt sie ausgeschaltet mit; nach dem Update stehen sie so da, wie die früheren Haken hier gesetzt waren):

| Automatisierung | Was kommt |
| --- | --- |
| **Sammelmeldung Anmeldeschutz** (Zeitplan täglich 0:00 → *Anmeldeschutz melden: Sammelmeldung*) | Höchstens eine Mail am Tag, kurz nach Mitternacht, über die Sperren des Vortags: wie viele IP-Adressen und Benutzerkonten gesperrt wurden, dazu die fünf Adressen mit den meisten Fehlversuchen. War Ablago aus, kommt die Meldung beim nächsten Start und fasst die verpassten Tage zusammen. An Tagen ohne Sperre kommt nichts. |
| **Kontosperre sofort melden** (*Benutzerkonto gesperrt* → *Anmeldeschutz melden: Kontosperre*) | Eine Mail, sobald für ein bestehendes Konto zu viele falsche Passwörter oder Codes kamen. Das ist seltener und wichtiger als eine gesperrte IP: Vielleicht hat jemand das Passwort dieses Kontos im Visier. Je Konto höchstens eine Mail am Tag; Fehlversuche mit unbekannten Adressen lösen keine Mail aus. |

Die Mails gehen an alle aktiven Personen mit Verwaltungsrecht für *Anmeldeschutz* (oder „Gesamte Verwaltung“) und E-Mail-Adresse und brauchen einen eingerichteten [Mailversand](installation.md#e-mail-und-adresse).

!!! note "Bis Version 0.84.7"
    Früher kam im Standard bei jeder gesperrten IP sofort eine Mail. Mit 0.84.8 ist die Mail im Standard aus – auch in bestehenden Installationen, in denen niemand den Haken selbst umgelegt hat. Wer ihn seit 0.84.8 einschaltet, bekommt die tägliche Sammelmeldung statt einer Mail je Sperre.

## Gesperrte Adressen

Ganz unten auf der Seite zeigt der Abschnitt **Gesperrte Adressen** jede gesperrte IP mit Grund, Beginn und Ende – bei vielen Sperren in einer Liste mit fester Höhe, in der du scrollst. **Freigeben** hebt die Sperre sofort auf. Oben auf der Seite steht deine eigene Adresse, wie Ablago sie sieht.

!!! warning "Hinter einem Reverse-Proxy"
    Damit die Sperre je IP die richtige Adresse trifft, muss Ablago die Angaben des Proxys glauben. Sitzt der Proxy auf demselben Rechner oder in einem privaten Netz, erkennt Ablago das von selbst (`TRUST_PROXY` nicht gesetzt oder `auto`). Prüfe oben auf der Seite: Steht dort bei deiner Adresse die Adresse des Proxys statt die deines Geräts, sieht Ablago für alle Anmeldungen dieselbe Adresse und sperrt im Ernstfall alle aus. Siehe [Hinter einem Reverse-Proxy](installation.md#hinter-einem-reverse-proxy).

## Ausnahmen

Unter **Nie sperren** stehen Adressen oder Netze, die nie gesperrt werden, z. B. dein Heimnetz `192.168.0.0/16` oder das Firmennetz. Mehrere durch Komma getrennt, höchstens 50.

## Ausgesperrt?

Bist du selbst gesperrt und niemand sonst, der verwaltet, kann dich freigeben, hilft der [Befehl `dms`](konsole.md) im Container:

- `dms gesperrt` zeigt die gesperrten Adressen,
- `dms entsperren <ip>` gibt eine Adresse sofort frei.

Ohne Zugriff auf den Container warte die Sperrdauer ab oder melde dich von einem anderen Gerät oder Netz an. Kommt niemand mit Verwaltungsrecht mehr hinein, hilft der [Notfallcode vom Notfallblatt](was-ist-passiert.md#notfallcode) oder die [RESCUE-Datei](notfall.md).

Kommst du wegen der [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) nicht weiter – Handy und Wiederherstellungscodes weg –, entfernt `dms zweifaktor-zuruecksetzen <email>` sie bei deinem Benutzer; danach reicht wieder das Passwort. Ist sie vorgeschrieben und du hast sie noch nicht eingerichtet, kannst du die Pflicht unter **Werkbank → Anmeldeschutz** trotzdem jederzeit ausschalten – auch auf der Einrichtungsseite nach der Anmeldung.

## Notfallzugang { #notfallzugang }

Wer sich ausgesperrt hat, kommt mit dem **Notfallcode** vom [Notfallblatt](verschluesselung.md#notfallblatt) über die Adresse von Ablago mit `/notfall` am Ende wieder hinein und legt für eine Person mit Verwaltungsrecht ein neues Passwort fest – Schritt für Schritt unter [Mit dem Notfallcode wieder hinein](was-ist-passiert.md#notfallcode). Hier steht, auf welchem Notfallblatt der gültige Code steht; **Zum Notfallblatt** führt zur [Verschlüsselung](verschluesselung.md#notfallblatt), wo du ein neues herunterlädst. Jedes neue Notfallblatt bringt einen neuen Code; der vorige gilt dann nicht mehr.

- **Vorgabe: nur aus dem Heimnetz.** Die Seite `/notfall` geht nur von Geräten aus privaten Netzen (z. B. `192.168.…`, `10.…`, `fd…`), nicht aus dem Internet.
- **Notfallzugang aus dem Internet erlauben:** Mit diesem Haken geht es von überall – für alle, die die Adresse kennen und den Code haben. Ablago warnt davor und verlangt dafür eine [frische Anmeldung](verwalten.md#frische-anmeldung). Zurück auf „nur Heimnetz“ geht ohne.
- Jede Fehleingabe sperrt die Eingabe 30 Sekunden – je Adressbereich (IPv4 einzeln, IPv6 je /64). Fehlversuche zählen außerdem in den Anmeldeschutz oben; viele Fehlversuche melden die Verwaltenden gebündelt per E-Mail, höchstens einmal je Stunde.

!!! info "Hinter einem Reverse Proxy"
    Ob eine Anfrage aus dem Heimnetz kommt, entscheidet Ablago nach der echten Adresse des Browsers. Dafür muss der Proxy `X-Forwarded-For` setzen (das tun alle üblichen) und Ablago ihm vertrauen ([Was der Proxy Ablago mitteilt](installation.md#was-der-proxy-dem-dms-mitteilt)). Kommt eine solche Angabe an, obwohl `TRUST_PROXY=false` gilt, oder steht `TRUST_PROXY=true` (dann könnte jeder die Angabe fälschen), gilt die Anfrage als „nicht aus dem Heimnetz“. Ein Proxy, der gar keine Adresse weitergibt, lässt alle Anfragen wie aus dem Heimnetz aussehen – richte ihn so ein, dass er `X-Forwarded-For` setzt.

Meint Ablago, du seist nicht im Heimnetz, steht unter dem Hinweis in der Werkbank, welche Adresse es sieht und warum: Entweder ist es eine **öffentliche Adresse** (siehe unten), oder **dein Proxy gibt die Adresse so weiter, dass Ablago ihr nicht trauen kann** – dann `TRUST_PROXY` und die Köpfe des Proxys prüfen wie unter [Was der Proxy Ablago mitteilt](installation.md#was-der-proxy-dem-dms-mitteilt).

### Zu Hause über den öffentlichen Namen { #zu-hause-uber-den-offentlichen-namen }

Rufst du Ablago zu Hause über seinen öffentlichen Namen auf (z. B. `ablage.example.org`), zeigt dieser Name auf die öffentliche Adresse deines Anschlusses. Die Anfrage geht dann vom Router nach außen und gleich wieder herein (Hairpin-NAT); der Proxy sieht und meldet die öffentliche Adresse, z. B. `203.0.113.7`. Ablago hat dann recht: Diese Anfrage kam über das Internet.

Abhilfe ist ein **lokaler DNS-Eintrag** (Split-DNS): Im Heimnetz zeigt derselbe Name direkt auf den Proxy, z. B. `ablage.example.org → 192.168.1.10`. Den Eintrag legst du im Router oder in deinem DNS-Server im Heimnetz an (oft „lokaler DNS“, „DNS-Rebind-Schutz – Ausnahmen“ oder „Host-Overrides“ genannt). Danach ein paar Minuten warten oder den Browser neu starten; in der Werkbank steht dann eine Adresse aus dem Heimnetz. Das Zertifikat bleibt gültig, weil der Name gleich bleibt.

## Zwei-Faktor-Anmeldung

Jeder Benutzer kann unter **Mein Konto → Sicherheit** (oben rechts auf deinen Namen klicken) eine Zwei-Faktor-Anmeldung mit einer Authenticator-App einrichten (TOTP, 6 Stellen, 30 Sekunden) und bekommt dazu zehn Wiederherstellungscodes. Wie das für Benutzer aussieht, beschreibt das [Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/profil/#zwei-faktor-anmeldung).

Unter **Werkbank → Anmeldeschutz** im Block **Zwei-Faktor-Anmeldung** **schreibst du sie je Systemrolle vor**: mit den Haken **Für alle vorschreiben, die verwalten dürfen** und **Für Mitglieder vorschreiben**. Die Pflicht greift **bei der nächsten Anmeldung**: Wer sie dann noch nicht hat, sieht nach der Anmeldung nur die Einrichtung und kommt erst danach weiter. Abschalten kann er sie selbst nicht mehr. Wer gerade angemeldet ist, arbeitet weiter und sieht oben einen Hinweis mit dem Weg zur Einrichtung.

Schreibst du sie für alle vor, die verwalten dürfen, und hast sie selbst noch nicht, fragt Ablago vorher nach: **Jetzt einrichten** führt dich zu **Mein Konto → Sicherheit**, **Trotzdem vorschreiben** schaltet die Pflicht ein – du richtest sie dann bei deiner nächsten Anmeldung ein. Die Einstellung selbst bleibt für Administratoren immer erreichbar: Ausschalten geht auch, solange du die Einrichtung noch vor dir hast; die Einrichtungsseite nach der Anmeldung bietet dafür **Pflicht für Administratoren ausschalten** an.

Falsche Codes zählen wie falsche Passwörter für den [Anmeldeschutz](#zwei-sperren). Ein Link zum Zurücksetzen des Passworts ersetzt nur das Passwort; den Code fragt Ablago trotzdem ab.

**Handy verloren?** Unter **Werkbank → Benutzer** steht beim Benutzer, ob die Zwei-Faktor-Anmeldung eingerichtet ist; **Zurücksetzen** entfernt sie. Danach reicht wieder das Passwort – ist sie vorgeschrieben, richtet der Benutzer sie bei der nächsten Anmeldung neu ein. Jedes Einrichten, Zurücksetzen und jede Anmeldung mit Wiederherstellungscode steht im [Protokoll](fehlersuche.md#protokoll).

Das Geheimnis liegt mit dem [Schlüssel von Ablago](verschluesselung.md) verschlüsselt in der Datenbank und ist damit Teil der Sicherung; ein Schlüsselwechsel schlüsselt es mit um. Wiederherstellungscodes speichert Ablago nur als Prüfwert.

!!! warning "Uhrzeit"
    Die Codes hängen an der Uhrzeit. Weicht die Uhr des Servers mehr als etwa 30 Sekunden ab, passen sie nicht. Lass den Server die Zeit per NTP stellen.

!!! tip "Selbst ausgesperrt?"
    Hast du Handy und Codes verloren, entfernt `dms zweifaktor-zuruecksetzen <email>` im Container deine Zwei-Faktor-Anmeldung (siehe [Befehl `dms`](konsole.md)). Kommst du nicht an den Container, hilft der [Notfallzugang](notfall.md).

## Anmeldung über einen Anbieter (OpenID Connect)

Statt mit Passwort melden sich Benutzer mit dem Konto eines Identitätsanbieters an – etwa **Microsoft Entra ID** (Microsoft 365), **Google Workspace**, **Keycloak**, **Authentik** oder **Authelia**. Auf der Anmeldeseite erscheint dann ein Knopf wie **Mit Firmenkonto anmelden**. Der Anbieter sieht dabei jede Anmeldung (wer, wann) – deine Unterlagen sieht er nicht.

### Beim Anbieter

Lege beim Anbieter eine Anwendung (Client) vom Typ *Web* an:

- **Weiterleitungs-URI** (Redirect URI): steht in der Werkbank, z. B. `https://dms.example.org/api/konto/anbieter/rueckkehr`. Sie folgt aus der [Adresse von Ablago](installation.md); trage diese vorher ein.
- **Abmelde-Adresse** (Post-Logout Redirect URI): die Adresse von Ablago mit `/` am Ende.
- **Scopes:** `openid`, `email`, `profile`.
- Notiere **Client-ID** und **Client-Secret**.

| Anbieter | Adresse des Anbieters (Issuer) |
| --- | --- |
| Microsoft Entra ID | `https://login.microsoftonline.com/<Tenant-ID>/v2.0` |
| Google | `https://accounts.google.com` |
| Keycloak | `https://<server>/realms/<realm>` |
| Authentik | `https://<server>/application/o/<anwendung>/` |
| Authelia | `https://<server>` |

### In Ablago { #im-dms }

Unter **Werkbank → Anmeldeschutz → Anmeldung über einen Anbieter** trägst du ein:

- **Adresse des Anbieters** (Issuer),
- **Client-ID**,
- **Client-Secret** – leer lassen bei öffentlichen Clients, die kein Secret haben. Ist schon eines gespeichert, lässt ein leeres Feld es unverändert; **Secret löschen** entfernt es,
- **Beschriftung des Knopfes** auf der Anmeldeseite.

Dann klickst du auf **Verbindung prüfen**. Danach **Eingeschaltet – Knopf auf der Anmeldeseite** ankreuzen und speichern. Das Client-Secret liegt mit dem [Schlüssel von Ablago](verschluesselung.md) verschlüsselt in der Datenbank.

- **Zuordnung:** über die E-Mail-Adresse. Gibt es sie in Ablago nicht, lehnt das Ablago ab – außer **Unbekannte Adressen als neue Benutzer anlegen** ist an; dann entsteht ein Benutzer – mit „Gesamte Verwaltung“ oder ohne Verwaltungsrecht, je nach **Neue Benutzer verwalten**. Bei Entra ID dient auch der Anmeldename (UPN) als Adresse.
- **Gruppe für „Gesamte Verwaltung“:** Ist sie gesetzt, folgt „Gesamte Verwaltung“ bei jeder Anmeldung der Gruppe: Wer in der Gruppe ist, bekommt sie, wer nicht mehr dazugehört, verliert sie. Die letzte Person mit „Gesamte Verwaltung“ behält sie. Eine Auswahl einzelner Bereiche bleibt unberührt (siehe [Wer darf Ablago verwalten?](verwalten.md)).
- **Passwort-Anmeldung nur noch für Personen, die verwalten dürfen:** Alle anderen melden sich nur noch über den Anbieter an. Wer verwalten darf, behält sein Passwort als Notzugang, falls der Anbieter einmal nicht erreichbar ist.
- **Beim Abmelden auch beim Anbieter abmelden:** Wer sich über den Anbieter angemeldet hat, wird beim Abmelden auch dort abgemeldet (wenn der Anbieter das anbietet).
- Eine eingerichtete [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) von Ablago gilt auch hier. Verlangt schon der Anbieter einen zweiten Faktor, schreibe sie in Ablago für diese Rollen nicht zusätzlich vor.

Jede Anmeldung, Ablehnung und angelegter Benutzer steht im [Protokoll](fehlersuche.md#protokoll). Schlägt eine Anmeldung fehl, zeigt die Anmeldeseite den Grund.

!!! tip "Im eigenen Netz"
    Läuft der Anbieter im Heimnetz (z. B. Keycloak auf dem NAS), geht auch `http://` – aber nur für Adressen im eigenen Netz. Ablago muss den Anbieter selbst erreichen können.

    Als eigenes Netz gelten:

    - `localhost` und Namen ohne Punkt (z. B. `http://keycloak:8080`),
    - private IP-Adressen: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x` sowie private und lokale IPv6-Adressen (`::1`, `fc…`/`fd…`, `fe80…`),
    - Namen mit den Endungen `.local`, `.lan`, `.internal` und `.home.arpa` – die offizielle Endung für Heimnetze (z. B. `http://auth.home.arpa`).

    Nur die echte Endung zählt: `auth.home.arpa.example.org` ist eine Adresse im Internet und braucht `https://`. Andere Namen wie `.fritz.box` oder `.home` brauchen ebenfalls `https://` – oder du gibst dem Anbieter einen Namen unter `.home.arpa` bzw. nimmst seine IP-Adresse. Dasselbe gilt für die Endpunkte bei [Postfächern](postfaecher.md#anderer-anbieter) mit „anderem Anbieter“.
