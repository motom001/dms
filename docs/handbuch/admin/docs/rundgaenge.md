# Rundgänge

Ein **Rundgang** zeigt Schritt für Schritt Stellen an der echten Oberfläche – Ablagos eigener bei der ersten Anmeldung, Rundgänge aus Paketen (etwa „Verträge im Überblick“) und eigene, die du hier schreibst. Alle stehen für die Personen, die sie nutzen dürfen, unter [Ablago entdecken](https://help.ablago.app/benutzer/aktuell/entdecken/).

Du findest sie unter **Werkbank → Ablage aufbauen → Rundgänge**. Der Bereich steht ab der Stufe **Betrieb** in der Leiste (siehe [Werkbank anpassen](uebersicht.md#werkbank-anpassen)); in kleineren Stufen blendest du ihn über „Werkbank anpassen“ ein. Hast du schon eigene Rundgänge geschrieben oder einen mitgelieferten ausgeschaltet, bleibt er nach dem Update eingeblendet. Die Rundgänge selbst laufen in jeder Stufe – es geht nur um den Bereich in der Werkbank. Bearbeiten darf, wer den Bereich verwaltet.

![Werkbank → Rundgänge: Liste und Editor](bilder/werkbank-rundgaenge.png)

## Die Liste

In der Mitte stehen **alle** Rundgänge: von Ablago, aus Paketen und eigene – mit Herkunft, wann sie starten (*bei der ersten Anmeldung*, *nach der Installation angeboten*, *von Hand* …), für wen sie sind und wie viele Schritte sie haben. Oben suchst du in Titel, Beschreibung und Paket und filterst nach Herkunft. Ausgeschaltete stehen blasser mit dem Vermerk *ausgeschaltet*.

## Ein- und ausschalten

Rechts oben am gewählten Rundgang steht der Schalter. Er gilt **für alle** und wirkt sofort: Ein ausgeschalteter Rundgang steht für niemanden mehr unter „Ablago entdecken“, wird nicht als Tipp angeboten und startet nicht von selbst – auch Ablagos eigener Rundgang bei der ersten Anmeldung. So schaltest du zum Beispiel die Rundgänge eines Pakets ab.

## Rundgänge von Ablago und aus Paketen ansehen

Ein Klick zeigt die Datei des Rundgangs (mit den Texten in deiner Sprache). Ändern kannst du sie nicht; mit **Als eigenen kopieren** entsteht eine Kopie zum Bearbeiten. **Ausprobieren** startet den Rundgang in einem neuen Fenster, nur für dich.

## Eigene Rundgänge schreiben { #schreiben }

**+ Neuer Rundgang** öffnet eine Vorlage. Ein Rundgang ist eine kleine Datei im YAML-Format – genau das Format, in dem auch Ablago und die Pakete ihre Rundgänge mitbringen ([Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/aufbau/#paket-rundgaenge)). Die Texte schreibst du direkt hinein:

```yaml
schluessel: urlaub_beantragen
titel: Urlaub beantragen
beschreibung: Wo Urlaubsanträge liegen und wie du einen anlegst.
fuer: lesen
oeffne:
  neu: { typ: urlaubsantrag }      # leeres Formular – gespeichert wird nichts
ersatz: Diesen Mappentyp darfst du nicht anlegen. Frag die Person, die Ablago bei euch verwaltet.
schritte:
  - schluessel: zeitraum
    ziel: mappe.feld:zeitraum
    ort: Rechts im Formular
    titel: Zeitraum
    text: Trag hier ein, von wann bis wann du frei hast.
```

- Höchstens **8 Schritte**, Titel bis 60, Texte bis 200 Zeichen. Texte sind reiner Text – HTML oder Formatierungen zeigt Ablago nicht an.
- Zu jedem `ziel` gehört `ort`: ein Satz für Screenreader, wo die Stelle steht.
- Eigene Rundgänge starten **nie von selbst**. Wer sie sehen darf, findet sie unter „Ablago entdecken“; als Tipp anbieten kannst du sie unter [Tipps](tipps.md).

### Ziele finden { #ziele }

Ziele sind feste **Ankerpunkte** – keine Namen zum Auswendiglernen:

- **Neben der Datei** stehen alle Ankerpunkte mit kurzer Beschreibung, darunter die echten **Felder und Register** eines Mappentyps, den du wählst, und die **Bereiche der Werkbank**. Ein Klick setzt den Anker an der Schreibmarke ein.
- **Ziel zeigen** öffnet Ablago in einem neuen Fenster im Auswahlmodus: Stellen mit Ankerpunkt werden beim Überfahren hervorgehoben, ein Klick setzt ihren Anker in die Datei ein. Stellen ohne Anker sind nicht wählbar (ein Klick dort bedient die Seite wie sonst, so kommst du z. B. zu einer Mappe). **Esc** bricht ab. Mit der Tastatur: Tab zu einer Stelle, Enter wählt sie.

### Prüfen, ausprobieren, speichern

- **Prüfen** prüft die Datei wie beim Installieren eines Pakets und nennt jeden Fehler mit **Zeile** und Ursache – unbekanntes Feld, unbekannter Anker, ein Feld oder Register, das es im Mappentyp nicht gibt, zu lange Texte, mehr als 8 Schritte. Ein Klick auf die Zeile setzt die Schreibmarke dorthin.
- **Ausprobieren** startet den Rundgang in einem neuen Fenster, nur für dich – auch ungespeichert. Für andere ändert sich nichts.
- **Speichern** geht nur ohne Fehler. Haben zwei Verwaltende denselben Rundgang gleichzeitig offen, überschreibt keiner den anderen: Wer zweitens speichert, bekommt einen Hinweis und sieht mit **Verwerfen** den neuen Stand.

Fällt später etwas weg, worauf ein eigener Rundgang zeigt (etwa ein Mappentyp), steht er rot markiert in der Liste und gilt nicht, bis du ihn reparierst.

## Weitergeben und sichern

- **Paket erstellen** nimmt gewählte eigene Rundgänge als `inhalt/rundgaenge.yaml` mit. Mappentypen, die ins Paket kommen, werden zu seinen eigenen; Mappentypen aus installierten Paketen werden zur Abhängigkeit.
- Eigene Rundgänge und was du ein- oder ausgeschaltet hast, stehen in der Datenbank und damit in jeder [Sicherung](sicherung.md); der [Vollexport](export.md) legt sie als `struktur/entdecken.json` ab.
