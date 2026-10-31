# Anmeldeschutz

Nach zu vielen falschen Passwörtern sperrt das DMS die Anmeldung. Unter **Werkbank → Anmeldeschutz** stellst du ein, wann und wie lange.

--8<-- "ausgeblendet-organisation.md"

## Zwei Sperren

| Sperre | Standard | Wofür |
| --- | --- | --- |
| **Je E-Mail-Adresse und IP** | 5 Fehlversuche → 1 Minute | jemand vertippt sich oder probiert ein Passwort für ein Konto durch |
| **Je IP-Adresse**, über alle E-Mail-Adressen | 30 Fehlversuche → 60 Minuten | jemand probiert von einer Adresse aus viele Konten durch |

Die Sperrdauer je IP darf auch **0** sein: Dann bleibt die Adresse gesperrt, bis ein Administrator sie freigibt. Die Fehlversuche je IP zählen innerhalb der Sperrdauer (bei „dauerhaft“ innerhalb einer Stunde).

Sperren stehen in der Datenbank und überstehen einen Neustart. Jede Sperre und jedes Entsperren steht im [Protokoll](fehlersuche.md#protokoll). Auf Wunsch bekommen die Administratoren eine Mail, sobald eine IP gesperrt wird.

## Gesperrte Adressen

Die Liste zeigt jede gesperrte IP mit Grund, Beginn und Ende. **Entsperren** gibt sie sofort frei. Oben auf der Seite steht deine eigene Adresse, wie das DMS sie sieht.

!!! warning "Hinter einem Reverse-Proxy"
    Damit die Sperre je IP die richtige Adresse trifft, muss das DMS die Angaben des Proxys glauben – siehe [Hinter einem Reverse-Proxy](installation.md#hinter-einem-reverse-proxy). Sonst sieht es für alle Anmeldungen die Adresse des Proxys und sperrt im Ernstfall alle aus.

## Ausnahmen

Unter **Nie sperren** stehen Adressen oder Netze, die nie gesperrt werden, z. B. dein Heimnetz `192.168.0.0/16` oder das Firmennetz. Mehrere durch Komma getrennt.

## Ausgesperrt?

Bist du selbst gesperrt und kein anderer Administrator kann dich freigeben, warte die Sperrdauer ab oder melde dich von einem anderen Gerät oder Netz an. Für eine dauerhafte Sperre hilft der [Notfallzugang](notfall.md).

## Zwei-Faktor-Anmeldung

Jeder Benutzer kann unter **Profil → Sicherheit** eine Zwei-Faktor-Anmeldung mit einer Authenticator-App einrichten (TOTP, 6 Stellen, 30 Sekunden) und bekommt dazu zehn Wiederherstellungscodes. Wie das für Benutzer aussieht, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/profil/#zwei-faktor-anmeldung).

Unten auf dieser Seite **schreibst du sie je Rolle vor** – für Administratoren, für Mitglieder oder beide. Wer sie dann noch nicht hat, sieht nach der Anmeldung nur die Einrichtung und kommt erst danach weiter. Abschalten kann er sie selbst nicht mehr.

Falsche Codes zählen wie falsche Passwörter für den [Anmeldeschutz](#zwei-sperren). Ein Link zum Zurücksetzen des Passworts ersetzt nur das Passwort; den Code fragt das DMS trotzdem ab.

**Handy verloren?** Unter **Werkbank → Benutzer** steht beim Benutzer, ob die Zwei-Faktor-Anmeldung eingerichtet ist; **Zurücksetzen** entfernt sie. Danach reicht wieder das Passwort – ist sie vorgeschrieben, richtet der Benutzer sie bei der nächsten Anmeldung neu ein. Jedes Einrichten, Zurücksetzen und jede Anmeldung mit Wiederherstellungscode steht im [Protokoll](fehlersuche.md#protokoll).

Das Geheimnis liegt mit dem [Schlüssel des DMS](verschluesselung.md) verschlüsselt in der Datenbank und ist damit Teil der Sicherung; ein Schlüsselwechsel schlüsselt es mit um. Wiederherstellungscodes speichert das DMS nur als Prüfwert.

!!! warning "Uhrzeit"
    Die Codes hängen an der Uhrzeit. Weicht die Uhr des Servers mehr als etwa 30 Sekunden ab, passen sie nicht. Lass den Server die Zeit per NTP stellen.

!!! tip "Selbst ausgesperrt?"
    Hast du als einziger Administrator Handy und Codes verloren, hilft der [Notfallzugang](notfall.md).

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

Unter **Werkbank → Anmeldeschutz → Anmeldung über einen Anbieter** trägst du Adresse, Client-ID und Client-Secret ein und klickst auf **Verbindung prüfen**. Danach **Eingeschaltet** ankreuzen und speichern. Das Client-Secret liegt mit dem [Schlüssel des DMS](verschluesselung.md) verschlüsselt in der Datenbank.

- **Zuordnung:** über die E-Mail-Adresse. Gibt es sie im DMS nicht, lehnt das DMS ab – außer **Unbekannte Adressen als neue Benutzer anlegen** ist an; dann entsteht ein Benutzer mit der eingestellten Rolle. Bei Entra ID dient auch der Anmeldename (UPN) als Adresse.
- **Gruppe für Administratoren:** Ist sie gesetzt, folgt die Rolle bei jeder Anmeldung der Gruppe: Mitglieder der Gruppe sind Administratoren, alle anderen Mitglieder. Der letzte aktive Administrator bleibt Administrator. Bei Entra ID liefert der Claim `groups` die Objekt-IDs der Gruppen (Anwendung → *Token-Konfiguration* → *Gruppenanspruch hinzufügen*); trage dann die Objekt-ID ein.
- **Passwort-Anmeldung nur noch für Administratoren:** Mitglieder melden sich nur noch über den Anbieter an. Administratoren behalten ihr Passwort als Notzugang, falls der Anbieter einmal nicht erreichbar ist.
- **Beim Abmelden auch beim Anbieter abmelden:** Wer sich über den Anbieter angemeldet hat, wird beim Abmelden auch dort abgemeldet (wenn der Anbieter das anbietet).
- Eine eingerichtete [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) des DMS gilt auch hier. Verlangt schon der Anbieter einen zweiten Faktor, schreibe sie im DMS für diese Rollen nicht zusätzlich vor.

Jede Anmeldung, Ablehnung und angelegter Benutzer steht im [Protokoll](fehlersuche.md#protokoll). Schlägt eine Anmeldung fehl, zeigt die Anmeldeseite den Grund.

!!! tip "Im eigenen Netz"
    Läuft der Anbieter im Heimnetz (z. B. Keycloak auf dem NAS), geht auch `http://` – aber nur für Adressen im eigenen Netz. Das DMS muss den Anbieter selbst erreichen können.
