# Anmeldeschutz

Nach zu vielen falschen Passwörtern sperrt das DMS die Anmeldung. Unter **Werkbank → Einstellungen → Anmeldeschutz** stellst du ein, wann und wie lange. Den Schlüssel für Passwörter und Sicherungen findest du unter **Benutzer und Sicherheit → [Verschlüsselung](verschluesselung.md)**.

--8<-- "ausgeblendet-organisation.md"

## Zwei Sperren

| Sperre | Standard | Wofür |
| --- | --- | --- |
| **Je E-Mail-Adresse und IP** | 5 Fehlversuche → 1 Minute | jemand vertippt sich oder probiert ein Passwort für ein Konto durch |
| **Je IP-Adresse**, über alle E-Mail-Adressen | 30 Fehlversuche → 60 Minuten | jemand probiert von einer Adresse aus viele Konten durch |

Die Sperrdauer je IP darf auch **0** sein: Dann bleibt die Adresse gesperrt, bis ein Administrator sie freigibt. Die Fehlversuche je IP zählen innerhalb der Sperrdauer (bei „dauerhaft“ innerhalb einer Stunde).

Sperren stehen in der Datenbank und überstehen einen Neustart. Jede Sperre und jedes Entsperren steht im [Protokoll](fehlersuche.md#protokoll).

## Mail an die Administratoren

Ist das DMS aus dem Internet erreichbar, probieren Fremde ständig Passwörter durch. Das ist normal, und die Sperren passieren automatisch. Darum schickt das DMS im Standard **keine Mail**, wenn es sperrt. Was gesperrt ist, siehst du jederzeit unter **Werkbank → Anmeldeschutz** und im Protokoll.

Wer trotzdem Bescheid wissen will, setzt im Block **Mail an die Administratoren** einen oder beide Haken:

| Haken | Was kommt |
| --- | --- |
| **Einmal am Tag eine Sammelmeldung über die Sperren schicken** | Höchstens eine Mail am Tag, kurz nach Mitternacht, über die Sperren des Vortags: wie viele IP-Adressen und Benutzerkonten gesperrt wurden, dazu die fünf Adressen mit den meisten Fehlversuchen. War das DMS aus, kommt die Meldung beim nächsten Start und fasst die verpassten Tage zusammen. An Tagen ohne Sperre kommt nichts. |
| **Sofort melden, wenn ein Benutzerkonto gesperrt wird** | Eine Mail, sobald für ein bestehendes Konto zu viele falsche Passwörter oder Codes kamen. Das ist seltener und wichtiger als eine gesperrte IP: Vielleicht hat jemand das Passwort dieses Kontos im Visier. Je Konto höchstens eine Mail am Tag; Fehlversuche mit unbekannten Adressen lösen keine Mail aus. |

Die Mails gehen an alle aktiven Administratoren mit E-Mail-Adresse und brauchen einen eingerichteten [Mailversand](installation.md#e-mail-und-adresse).

!!! note "Bis Version 0.84.7"
    Früher kam im Standard bei jeder gesperrten IP sofort eine Mail. Mit 0.84.8 ist die Mail im Standard aus – auch in bestehenden Installationen, in denen niemand den Haken selbst umgelegt hat. Wer ihn seit 0.84.8 einschaltet, bekommt die tägliche Sammelmeldung statt einer Mail je Sperre.

## Gesperrte Adressen

Ganz unten auf der Seite zeigt der Abschnitt **Gesperrte Adressen** jede gesperrte IP mit Grund, Beginn und Ende – bei vielen Sperren in einer Liste mit fester Höhe, in der du scrollst. **Freigeben** hebt die Sperre sofort auf. Oben auf der Seite steht deine eigene Adresse, wie das DMS sie sieht.

!!! warning "Hinter einem Reverse-Proxy"
    Damit die Sperre je IP die richtige Adresse trifft, muss das DMS die Angaben des Proxys glauben. Sitzt der Proxy auf demselben Rechner oder in einem privaten Netz, erkennt das DMS das von selbst (`TRUST_PROXY` nicht gesetzt oder `auto`). Prüfe oben auf der Seite: Steht dort bei deiner Adresse die Adresse des Proxys statt die deines Geräts, sieht das DMS für alle Anmeldungen dieselbe Adresse und sperrt im Ernstfall alle aus. Siehe [Hinter einem Reverse-Proxy](installation.md#hinter-einem-reverse-proxy).

## Ausnahmen

Unter **Nie sperren** stehen Adressen oder Netze, die nie gesperrt werden, z. B. dein Heimnetz `192.168.0.0/16` oder das Firmennetz. Mehrere durch Komma getrennt, höchstens 50.

## Ausgesperrt?

Bist du selbst gesperrt und kein anderer Administrator kann dich freigeben, hilft der [Befehl `dms`](konsole.md) im Container:

- `dms gesperrt` zeigt die gesperrten Adressen,
- `dms entsperren <ip>` gibt eine Adresse sofort frei.

Ohne Zugriff auf den Container warte die Sperrdauer ab oder melde dich von einem anderen Gerät oder Netz an. Gibt es keinen Administrator mehr, hilft der [Notfallzugang](notfall.md).

Kommst du wegen der [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) nicht weiter – Handy und Wiederherstellungscodes weg –, entfernt `dms zweifaktor-zuruecksetzen <email>` sie bei deinem Benutzer; danach reicht wieder das Passwort. Ist sie vorgeschrieben und du hast sie noch nicht eingerichtet, kannst du die Pflicht unter **Werkbank → Anmeldeschutz** trotzdem jederzeit ausschalten – auch auf der Einrichtungsseite nach der Anmeldung.

## Zwei-Faktor-Anmeldung

Jeder Benutzer kann unter **Profil → Sicherheit** eine Zwei-Faktor-Anmeldung mit einer Authenticator-App einrichten (TOTP, 6 Stellen, 30 Sekunden) und bekommt dazu zehn Wiederherstellungscodes. Wie das für Benutzer aussieht, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/profil/#zwei-faktor-anmeldung).

Unter **Werkbank → Anmeldeschutz** im Block **Zwei-Faktor-Anmeldung** **schreibst du sie je Systemrolle vor**: mit den Haken **Für Administratoren vorschreiben** und **Für Mitglieder vorschreiben**. Die Pflicht greift **bei der nächsten Anmeldung**: Wer sie dann noch nicht hat, sieht nach der Anmeldung nur die Einrichtung und kommt erst danach weiter. Abschalten kann er sie selbst nicht mehr. Wer gerade angemeldet ist, arbeitet weiter und sieht oben einen Hinweis mit dem Weg zur Einrichtung.

Schreibst du sie für Administratoren vor und hast sie selbst noch nicht, fragt das DMS vorher nach: **Jetzt einrichten** führt dich zu **Profil → Sicherheit**, **Trotzdem vorschreiben** schaltet die Pflicht ein – du richtest sie dann bei deiner nächsten Anmeldung ein. Die Einstellung selbst bleibt für Administratoren immer erreichbar: Ausschalten geht auch, solange du die Einrichtung noch vor dir hast; die Einrichtungsseite nach der Anmeldung bietet dafür **Pflicht für Administratoren ausschalten** an.

Falsche Codes zählen wie falsche Passwörter für den [Anmeldeschutz](#zwei-sperren). Ein Link zum Zurücksetzen des Passworts ersetzt nur das Passwort; den Code fragt das DMS trotzdem ab.

**Handy verloren?** Unter **Werkbank → Benutzer** steht beim Benutzer, ob die Zwei-Faktor-Anmeldung eingerichtet ist; **Zurücksetzen** entfernt sie. Danach reicht wieder das Passwort – ist sie vorgeschrieben, richtet der Benutzer sie bei der nächsten Anmeldung neu ein. Jedes Einrichten, Zurücksetzen und jede Anmeldung mit Wiederherstellungscode steht im [Protokoll](fehlersuche.md#protokoll).

Das Geheimnis liegt mit dem [Schlüssel des DMS](verschluesselung.md) verschlüsselt in der Datenbank und ist damit Teil der Sicherung; ein Schlüsselwechsel schlüsselt es mit um. Wiederherstellungscodes speichert das DMS nur als Prüfwert.

!!! warning "Uhrzeit"
    Die Codes hängen an der Uhrzeit. Weicht die Uhr des Servers mehr als etwa 30 Sekunden ab, passen sie nicht. Lass den Server die Zeit per NTP stellen.

!!! tip "Selbst ausgesperrt?"
    Hast du Handy und Codes verloren, entfernt `dms zweifaktor-zuruecksetzen <email>` im Container deine Zwei-Faktor-Anmeldung (siehe [Befehl `dms`](konsole.md)). Kommst du nicht an den Container, hilft der [Notfallzugang](notfall.md).

## Anmeldung über einen Anbieter (OpenID Connect)

Statt mit Passwort melden sich Benutzer mit dem Konto eines Identitätsanbieters an – etwa **Microsoft Entra ID** (Microsoft 365), **Google Workspace**, **Keycloak**, **Authentik** oder **Authelia**. Auf der Anmeldeseite erscheint dann ein Knopf wie **Mit Firmenkonto anmelden**.

### Beim Anbieter

Lege beim Anbieter eine Anwendung (Client) vom Typ *Web* an:

- **Weiterleitungs-URI** (Redirect URI): steht in der Werkbank, z. B. `https://dms.example.org/api/konto/anbieter/rueckkehr`. Sie folgt aus der [Adresse des DMS](installation.md); trage diese vorher ein.
- **Abmelde-Adresse** (Post-Logout Redirect URI): die Adresse des DMS mit `/` am Ende.
- **Scopes:** `openid`, `email`, `profile`.
- Notiere **Client-ID** und **Client-Secret**.

| Anbieter | Adresse des Anbieters (Issuer) |
| --- | --- |
| Microsoft Entra ID | `https://login.microsoftonline.com/<Tenant-ID>/v2.0` |
| Google | `https://accounts.google.com` |
| Keycloak | `https://<server>/realms/<realm>` |
| Authentik | `https://<server>/application/o/<anwendung>/` |
| Authelia | `https://<server>` |

### Im DMS

Unter **Werkbank → Anmeldeschutz → Anmeldung über einen Anbieter** trägst du ein:

- **Adresse des Anbieters** (Issuer),
- **Client-ID**,
- **Client-Secret** – leer lassen bei öffentlichen Clients, die kein Secret haben. Ist schon eines gespeichert, lässt ein leeres Feld es unverändert; **Secret löschen** entfernt es,
- **Beschriftung des Knopfes** auf der Anmeldeseite.

Dann klickst du auf **Verbindung prüfen**. Danach **Eingeschaltet – Knopf auf der Anmeldeseite** ankreuzen und speichern. Das Client-Secret liegt mit dem [Schlüssel des DMS](verschluesselung.md) verschlüsselt in der Datenbank.

- **Zuordnung:** über die E-Mail-Adresse. Gibt es sie im DMS nicht, lehnt das DMS ab – außer **Unbekannte Adressen als neue Benutzer anlegen** ist an; dann entsteht ein Benutzer mit der **Systemrolle neuer Benutzer** (Mitglied oder Administrator). Bei Entra ID dient auch der Anmeldename (UPN) als Adresse.
- **Gruppe für Administratoren:** Ist sie gesetzt, folgt die Systemrolle bei jeder Anmeldung der Gruppe: Mitglieder der Gruppe sind Administratoren, alle anderen Mitglieder. Der letzte aktive Administrator bleibt Administrator. Aus welchem Claim das DMS die Gruppen liest, steht im Feld **Claim mit den Gruppen** (meist `groups`). Bei Entra ID liefert der Claim `groups` die Objekt-IDs der Gruppen (Anwendung → *Token-Konfiguration* → *Gruppenanspruch hinzufügen*); trage dann die Objekt-ID ein.
- **Passwort-Anmeldung nur noch für Administratoren:** Mitglieder melden sich nur noch über den Anbieter an. Administratoren behalten ihr Passwort als Notzugang, falls der Anbieter einmal nicht erreichbar ist.
- **Beim Abmelden auch beim Anbieter abmelden:** Wer sich über den Anbieter angemeldet hat, wird beim Abmelden auch dort abgemeldet (wenn der Anbieter das anbietet).
- Eine eingerichtete [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) des DMS gilt auch hier. Verlangt schon der Anbieter einen zweiten Faktor, schreibe sie im DMS für diese Rollen nicht zusätzlich vor.

Jede Anmeldung, Ablehnung und angelegter Benutzer steht im [Protokoll](fehlersuche.md#protokoll). Schlägt eine Anmeldung fehl, zeigt die Anmeldeseite den Grund.

!!! tip "Im eigenen Netz"
    Läuft der Anbieter im Heimnetz (z. B. Keycloak auf dem NAS), geht auch `http://` – aber nur für Adressen im eigenen Netz. Das DMS muss den Anbieter selbst erreichen können.
