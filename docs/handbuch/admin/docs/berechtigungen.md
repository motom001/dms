# Berechtigungen

Mit Berechtigungen legst du je Mappentyp fest, **wer welche Mappen anlegen, lesen, bearbeiten, löschen und wessen Passwörter sehen** darf. Du pflegst sie am **Mappentyp** selbst, im Abschnitt **Berechtigungen** unter den Registern, und speicherst sie mit **Mappentyp speichern**. Prüfen lassen sie sich unter **Wartung und Fehlersuche → [Berechtigungen prüfen](#berechtigungen-prufen)**.

![Berechtigungen am Mappentyp Vertrag](bilder/werkbank-berechtigungen.png)

!!! info "Für Administratoren gelten die Regeln nicht"
    Ein Administrator sieht und darf in der Ablage immer alles. Deshalb steht dort für ihn oben ein roter Hinweis, und er bekommt keine API-Schlüssel: Für die tägliche Arbeit und für Programme legst du normale Benutzer an und gibst ihnen über Rollen und Regeln genau die Rechte, die sie brauchen.

## Die fünf Rechte

| Kürzel | Recht | Was es erlaubt |
|---|---|---|
| **C** | Anlegen | neue Mappen dieses Typs anlegen |
| **R** | Lesen | die Mappe in Listen, Suche, Zählern und Verweisen sehen und öffnen; Notizen schreiben, Aufgaben vergeben, per E-Mail versenden |
| **U** | Bearbeiten | Felder ändern, Dokumente hochladen und entfernen |
| **D** | Löschen | die Mappe in den Papierkorb legen |
| **P** | Passwörter sehen | den Klartext von Passwortfeldern anzeigen (das „Auge“) |

- **Ohne Lesen wirkt nichts außer Anlegen.** Wer eine Mappe nicht lesen darf, darf sie auch nicht bearbeiten, löschen oder ihre Passwörter sehen – egal was die Regeln sonst sagen.
- Die Haken **Neue Mappen erlauben** und **Löschen erlauben** am [Mappentyp](mappentypen.md) bleiben die **Obergrenze**: Ist ein Haken aus, hilft auch keine Regel – das gilt auch für Administratoren.
- **Systemfelder** von Benutzern (Rolle, weitere Rollen, Aktiv) ändern sich weiterhin nur in der Benutzerverwaltung und im eigenen Profil.
- Den **eigenen Papierkorb** sieht jeder Benutzer immer und kann daraus wiederherstellen – auch wenn er die Mappe danach nach den Regeln nicht mehr sehen darf. Er bekommt dann einen Hinweis.

## Grundeinstellung

Jeder Mappentyp hat eine Grundeinstellung, die gilt, solange keine Regel etwas anderes sagt:

- **Alle Rechte erteilt** – jeder darf alles; Regeln *schränken ein*. So verhält sich ein Mappentyp ohne Regeln, also auch jeder Typ nach dem Update auf diese Version.
- **Alle Rechte entzogen** – niemand darf etwas; Regeln *geben frei*. Das passt für vertrauliche Typen wie Gehaltsabrechnungen.

## Regeln

Eine Regel heißt: **Wenn** alle Bedingungen zutreffen, **dann** setze diese Rechte.

- Je Recht gibt es drei Stellungen: **✓** erteilen, **✗** entziehen, **–** unverändert lassen. Ein Klick auf den Knopf schaltet weiter.
- Die Regeln werden **von oben nach unten** geprüft. Jede zutreffende Regel setzt ihre ✓ und ✗ – eine spätere Regel kann also überschreiben, was eine frühere gesetzt hat.
- **Stopp**: Trifft die Regel zu, werden die folgenden Regeln nicht mehr geprüft. So setzt du Ausnahmen an den Anfang, z. B. „Buchhaltung darf alles“ mit Stopp.
- Die Reihenfolge änderst du durch **Ziehen am Griff** ⠿ oder mit **Alt+↑/↓**.
- Eine Regel braucht einen Namen, mindestens eine Bedingung und muss etwas bewirken (ein Recht oder Stopp).

### Bedingungen

| Bedingung | trifft zu, wenn … |
|---|---|
| **Benutzer hat Rolle** | der angemeldete Benutzer eine der gewählten Rollen hat (auch die Systemrollen *Administrator* und *Mitglied*) |
| **Benutzer ist** | der angemeldete Benutzer einer der gewählten Benutzer ist |
| **Feld der Mappe** | ein Feld der Mappe die Bedingung erfüllt – genau wie in [Sichten](sichten.md#bedingungen), z. B. „Verantwortlich zeigt auf aktueller Benutzer“, „Verantwortliche Rolle zeigt auf Rollen des aktuellen Benutzers“, „Privat ist ja“ oder „Angelegt von ist aktueller Benutzer“ |
| **Offene Aufgabe für den Benutzer** | die Mappe eine offene Aufgabe für den angemeldeten Benutzer hat |
| **Mappe ist die des Benutzers** | (nur beim Typ *Benutzer*) die Mappe die Benutzer-Mappe des angemeldeten Benutzers ist |

Jede Bedingung lässt sich mit **nicht** umkehren. Mehrere Bedingungen einer Regel müssen **alle** zutreffen; für „oder“ legst du zwei Regeln an.

!!! tip "Rechte, die vom Inhalt abhängen"
    Ändert jemand ein Feld, von dem seine Rechte abhängen (etwa „Verantwortlich“), fragt das DMS vor dem Speichern nach, wenn er sich damit selbst das Lesen oder Bearbeiten entziehen würde.

### Regel in andere Mappentypen kopieren

Mit **In andere Mappentypen kopieren …** an einer gespeicherten Regel übernimmst du sie in weitere Typen (bei ungespeicherten Änderungen erst speichern); sie landet dort am Ende. Bedingungen auf Felder, die es im Zieltyp nicht gibt, fallen weg – das DMS sagt, wie viele.

### Speichern

Die Regeln werden mit **Mappentyp speichern** gespeichert, zusammen mit Feldern, Registern und Trefferlisten. Eine Regel darf deshalb auch ein Feld nutzen, das du im selben Zug neu anlegst. Passt eine Regel nicht (z. B. auf ein Feld, das du gerade entfernst), speichert das DMS nichts und nennt die Regel.

Beim Speichern prüft das DMS außerdem, ob danach Mappen dieses Typs **niemand mehr lesen** könnte (außer Administratoren), und fragt in diesem Fall nach. Jede Änderung steht im [Protokoll](fehlersuche.md) mit der vollständigen Regelliste.

## Berechtigungen prüfen

Unter **Wartung und Fehlersuche → Berechtigungen prüfen** testest du die **gespeicherten** Regeln. Am Abschnitt *Berechtigungen* eines Mappentyps öffnet **Regeln prüfen ↗** diese Seite in einem **neuen Fenster**, mit dem Mappentyp schon ausgewählt. So bearbeitest du die Regeln in einem Fenster und prüfst sie im anderen: ändern, *Mappentyp speichern*, im anderen Fenster noch einmal **Prüfen**.

Links listet die Seite alle Mappentypen mit Grundeinstellung und Anzahl der Regeln; ein Klick springt zu ihren Regeln.

### Testlauf

Welche Rechte hätte ein bestimmter Benutzer an einer bestimmten Mappe? Wähle Mappentyp, Benutzer und Mappe und klicke auf **Prüfen**. Die Tabelle zeigt Schritt für Schritt, welche Regel zutraf, was sie gesetzt hat und wie der Stand danach war.

![Testlauf: Ben an „Stromvertrag Haus“](bilder/werkbank-berechtigungen-testlauf.png)

### Was sieht ein Benutzer?

Zeigt je Mappentyp, wie viele Mappen ein Benutzer nach den gespeicherten Regeln lesen darf, mit einigen Beispielen.

## Was Benutzer davon merken

- Mappen ohne Leserecht fehlen in Listen, Suche, Zählern, Favoriten und Trefferlisten. Verweist eine sichtbare Mappe auf eine unsichtbare, steht dort „nicht sichtbare Mappe“ ohne Link.
- Hat jemand eine **Aufgabe** an einer Mappe, die er nicht lesen darf, steht sie trotzdem in seinem Eingang – ohne Titel. Er kann sie erledigen oder an jemanden weitergeben, der die Mappe sehen darf. Wer eine Aufgabe vergibt, bekommt einen Hinweis, wenn der Empfänger die Mappe nicht lesen darf.
- Ohne **Bearbeiten** zeigt die Mappe ihre Felder nur an; ohne **Löschen** fehlt „Mappe löschen“; ohne **Anlegen** fehlt „+ Neu“.
- Bei der Auswahl von Benutzern (Verantwortlich, Erwähnungen, Vertreter, Aufgaben-Empfänger) erscheinen nur Benutzer, deren Benutzer-Mappe man sehen darf.
- Im Profil zeigt **Meine Rechte** je Mappentyp, was man darf: ja, nein oder „je nach Mappe“ – die Regeln selbst bleiben verborgen.

## Beispiele

### Vertrauliche Mappen nur für Verantwortliche

Mappentyp *Gehalt*, Grundeinstellung **Alle Rechte entzogen**:

1. **Verantwortliche** – wenn *Verantwortlich zeigt auf aktueller Benutzer* → ✓ R U D P

### Eine Rolle darf alles, alle anderen nur lesen

Mappentyp *Rechnung*, Grundeinstellung **Alle Rechte erteilt**:

1. **Buchhaltung darf alles** – wenn *Benutzer hat Rolle Buchhaltung* → ✓ C R U D P, **Stopp**
2. **Alle anderen nur lesen** – wenn *Benutzer hat nicht Rolle Buchhaltung* → ✗ C U D P

### Praktikanten sehen keine Passwörter

An jedem Typ mit Passwortfeldern (einmal anlegen, dann **kopieren**):

1. **Keine Passwörter für Praktikanten** – wenn *Benutzer hat Rolle Praktikant* → ✗ P

### Beispiel: Ein Programm, das nur Rechnungen sieht

Ein Programm (etwa ein ERP-System) soll über die [Schnittstelle](api.md) Rechnungen anlegen und ihren Bearbeiter setzen – aber nichts anderes sehen.

1. Lege eine Rolle **ERP** und einen Benutzer **ERP-Schnittstelle** mit dieser Rolle an; erzeuge für ihn einen [API-Schlüssel](api.md#api-schlussel).
2. Mappentyp *Rechnung*: Regel **ERP legt Rechnungen an** – wenn *Benutzer hat Rolle ERP* → ✓ C R U.
3. Mappentyp *Benutzer*: Regel **ERP sieht nur die Buchhaltung** – wenn *Benutzer hat Rolle ERP* und *nicht: Rollen zeigt auf Buchhaltung* (das Feld der Benutzer-Mappe) → ✗ R. So kann das Programm als „Verantwortlich“ nur Mitglieder der Buchhaltung eintragen.
4. Alle übrigen Mappentypen: Regel **ERP sieht nichts** – wenn *Benutzer hat Rolle ERP* → ✗ C R U D P (einmal anlegen, dann in die anderen Typen kopieren).
5. Mit **Was sieht ein Benutzer?** kontrollierst du das Ergebnis.
