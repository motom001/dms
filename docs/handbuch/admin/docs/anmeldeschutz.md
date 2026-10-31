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
