# Anmeldeschutz

Nach zu vielen falschen Passwörtern sperrt das DMS die Anmeldung. Unter **Werkbank → Anmeldeschutz** stellst du ein, wann und wie lange.

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
