# Was Ablago darf

Statt bei jedem Paket und jedem Mappentyp einzeln nachzufragen, legst du **einmal** fest, was Ablago darf. Ablago hält sich im Server daran – auch, wenn jemand die Oberfläche umgeht – und fragt innerhalb dieser Grenze nicht mehr einzeln nach.

Die Karte **Was Ablago darf** steht ganz oben in der [Übersicht der Werkbank](uebersicht.md). Sie zeigt deine beiden Antworten als zwei Sätze. Mit **Ändern …** siehst du die beiden Fragen; unter der gewählten Antwort steht ein Satz, was sie bedeutet, darunter „Das heißt für euch“. Ändern darf nur, wer **Gesamte Verwaltung** hat; sehen können die Karte alle, die verwalten.

## Frage 1: Welche Pakete darf Ablago nutzen? { #pakete }

| Antwort | Was dazukommt |
| --- | --- |
| **Keine – nur Ablago selbst** | Ihr richtet Mappentypen und Abläufe selbst ein. Was Ablago mitbringt, etwa die Texterkennung, arbeitet trotzdem. |
| **Nur Vorlagen** | Dazu fertige Mappentypen und Ansichten wie Haushalt oder Verträge – ohne eigenen Code. |
| **Auch Helfer, die nur hier arbeiten** (empfohlen, Vorgabe) | Dazu Pakete mit eigenem Code, etwa ein Trennblatt oder eine KI auf diesem Gerät. Nichts verlässt Ablago. |
| **Auch Helfer, die Dienste im Netz nutzen** | Dazu Pakete, die Dienste im Netz nutzen – im Internet oder bei euch zu Hause: Sicherung an ein entferntes Ziel, Mails über einen Versanddienst, ein KI-Assistent. Inhalte nur aus Bereichen, die ihr freigebt; Gesundheit bleibt immer drin. |

Woran Ablago erkennt, wozu ein Paket gehört, steht im Paket selbst: ohne eigenen Code ist es eine Vorlage, mit Code und ohne Adressen im Netz ein Helfer, der nur hier arbeitet, mit Adressen im Netz (auch einer Dienst-Adresse aus den Einstellungen) ein Helfer, der Dienste im Netz nutzt – ob der Dienst im Internet oder bei euch zu Hause läuft, etwa eine KI auf dem NAS.

- **Installieren und Aktualisieren:** Ein Paket über der Grenze lässt sich nicht installieren. Die Vorschau sagt in Worten, warum, etwa „„Übersetzung“ nutzt Dienste im Netz – das habt ihr nicht erlaubt.“, und bietet **Erlauben …** an.
- **Updates:** Hebt ein Update ein Paket über die Grenze (zum Beispiel nutzt es neu Dienste im Netz), installiert Ablago es nicht: „Das Update für „Übersetzung“ nutzt neu Dienste im Netz – das habt ihr nicht erlaubt.“ Die installierte Fassung läuft weiter.
- **Was Ablago mitbringt** (eingebaute Helfer) läuft auf jeder Antwort: Texterkennung, PDF/A, Volltext und Umwandeln aus dem offiziellen Katalog, ohne Internet – samt ihren Zusätzen wie weiteren Sprachen der Texterkennung. Ein Paket eines anderen Herausgebers, das so einen Helfer ersetzt, folgt Frage 1.

## Frage 2: Wie viel soll Ablago von sich aus tun? { #selbst }

- **Nichts von sich aus**
- **Erkennen und vorlegen** (empfohlen, Vorgabe)
- **Alles erledigen, ich prüfe danach**

Ablago merkt sich die Antwort schon jetzt. Wirken wird sie, sobald Ablago Post und Dokumente von sich aus erkennt; bis dahin ändert sie nichts.

## Was immer eine eigene Entscheidung bleibt { #immer }

Auf jeder Antwort fragt Ablago weiter einzeln nach bei:

- einem fremden oder unsignierten Katalog und einem Herausgeber, den es noch nicht gab,
- Rechten an der Verwaltung oder an Sicherungen,
- Gesundheit und ähnlich schutzbedürftigen Mappentypen,
- allem, was schon heute eine frische Anmeldung braucht.

## Ändern { #aendern }

- **Erhöhen** braucht eine frische Anmeldung. Die Änderung steht mit altem und neuem Wert im Nachweis-Journal (Zugang und Rechte), und alle mit Verwaltungsrecht bekommen eine Mail. Es passiert nichts von selbst: Kein Paket wird installiert, kein Mappentyp freigegeben.
- **Senken** wirkt sofort und steht im Journal. Passen installierte Pakete nicht mehr zur neuen Antwort, nennt Ablago sie vorher mit Grund; mit **Anhalten und speichern** werden sie [angehalten](pakete.md#anhalten) – ihre Mappentypen, Mappen und Einstellungen bleiben.

## Bei der Einrichtung { #einrichtung }

Der Einrichtungsassistent stellt beide Fragen im Schritt [Was darf Ablago?](installation.md#was-darf-ablago), vor den Paketen. Danach wählt Ablago die Pakete selbst – passend zur ersten Antwort, zur Nutzung und zur Empfehlung im offiziellen, signierten Katalog; was nicht erlaubt ist, steht mit Grund daneben. Das gibt es nur bei der Einrichtung: Später kommen keine Pakete von selbst dazu.

## Anbieter und Einrichtungsdatei { #anbieter }

In der [Einrichtungsdatei](einrichtungsdatei.md) stehen beide Antworten unter `darf`. Ein Anbieter, der Ablago für andere betreibt, legt dort mit `hoechstens` Höchstwerte fest. Der Server setzt sie durch; höhere Antworten sind in der Karte ausgegraut mit „Von eurem Anbieter festgelegt“.

## Nach dem Update { #update }

Installationen, die es schon vor dieser Version gab, bekommen Antworten, mit denen sich nichts ändert: bei Frage 1 „Auch Helfer, die Dienste im Netz nutzen“ – so viel, wie bisher ging –, bei Frage 2 „Erkennen und vorlegen“. Nichts wird angehalten, nichts wird ungefragt strenger oder lockerer. Einmal erscheint in der Übersicht der Hinweis „Neu: Was Ablago darf – bitte einmal ansehen“. Neue Installationen starten mit den empfohlenen Antworten.
