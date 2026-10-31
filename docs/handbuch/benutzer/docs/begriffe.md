# Begriffe

<!-- Erzeugt aus docs/glossar.yml mit docs/handbuch/werkzeuge/glossar.py – bitte dort ändern. -->

Hier steht, was die Wörter im DMS bedeuten. Oberfläche, Handbücher und Meldungen verwenden sie genau so.

Hinter jedem Begriff steht, wie gut ihn jemand versteht, der zum ersten Mal mit einem DMS arbeitet:

- **✓ Alltagswort**: versteht man sofort.
- **~ mit Erklärung**: Die Oberfläche erklärt es kurz, zum Beispiel mit **?**.
- **✗ Fachwort**: Dafür gibt es kein besseres Wort, oder es betrifft nur Fortgeschrittene.

Außerdem steht dort, wer dem Begriff begegnet: alle, nur Administratoren oder nur Fortgeschrittene (Expertenmodus, Technik).

## Grundbegriffe

<a id="ablage"></a>**Ablage** · ✓ Alltagswort · alle  
Der Arbeitsbereich für alle Benutzer – mit Ansichten, Listen und Mappen.  
Siehe auch: [Werkbank](#werkbank), [Ansicht](#ansicht).

<a id="ansicht"></a>**Ansicht** · ~ mit Erklärung · alle  
Eine gespeicherte Auswahl von Mappen – welche Mappentypen, mit welchen Bedingungen. Ansichten stehen im Baum links in der Ablage. Wie etwas aussieht, heißt dagegen „Darstellung“.  
Siehe auch: [Unteransicht](#unteransicht), [Bedingung](#bedingung), [Trefferliste](#trefferliste).

<a id="bedingung"></a>**Bedingung** · ~ mit Erklärung · Administratoren  
Ein Filter einer Ansicht auf Feldwerte, Anzahlen, Fristen oder Persönliches, z. B. ein Feld gleich „aktueller Benutzer“ oder „ist mein Favorit“.

<a id="darstellung"></a>**Darstellung** · ✓ Alltagswort · alle  
Der Bereich im Profil, in dem jeder einstellt, wie das DMS für ihn aussieht – das Design (für sein Konto), die Schriftgröße und die Breite der Bereiche (je Gerät).  
Siehe auch: [Design](#design), [Profil](#profil).

<a id="dokument"></a>**Dokument** · ✓ Alltagswort · alle  
Eine Datei, die im DMS in einem Dokumentenregister einer Mappe liegt. Hochgeladen wird eine Datei; im DMS ist sie ein Dokument. An einer E-Mail heißt sie Anhang.  
Siehe auch: [Version](#version).

<a id="eindeutig"></a>**Eindeutig** · ~ mit Erklärung · Administratoren  
Ein Feldwert, der in diesem Mappentyp nur einmal vorkommen darf, z. B. eine Rechnungsnummer.

<a id="favoriten"></a>**Favoriten** · ✓ Alltagswort · alle  
Mappen, die ein Benutzer mit dem Stern markiert hat. Die Ansicht „Favoriten“ zeigt sie.

<a id="feld"></a>**Feld** · ~ mit Erklärung · alle  
Eine Angabe in einer Mappe, z. B. die Vertragsnummer. Jedes Feld hat eine Feldart – Text, Langtext, Formatierter Text, Zahl, Betrag, Datum, Ja/Nein, Auswahlliste, Verweis oder Passwort.  
Siehe auch: [Feldart](#feldart), [Pflichtfeld](#pflichtfeld), [Standardwert](#standardwert).

<a id="feldart"></a>**Feldart** · ~ mit Erklärung · Administratoren  
Welche Art von Angabe ein Feld aufnimmt, z. B. Datum oder Betrag. Die Oberfläche schreibt „Feldart“.

<a id="filter-titel"></a>**Filter (Titel)** · ~ mit Erklärung · Administratoren  
Formatiert einen Platzhalter in der Titel-Vorlage, z. B. nur das Jahr eines Datums oder gekürzter Text. Steht hinter einem senkrechten Strich, z. B. {datum|jahr}.  
Siehe auch: [Titel](#titel).

<a id="kennung"></a>**Kennung** · ✗ Fachwort · Administratoren  
Der feste, technische Name eines Felds, Registers, Mappentyps oder Nummernkreises, z. B. vertragsnummer. Nach dem Speichern bleibt er gleich, damit gespeicherte Werte, Links und Pakete passen.

<a id="mappe"></a>**Mappe** · ✓ Alltagswort · alle  
Die Grundeinheit des DMS, wie eine Pappmappe im Regal. Sie fasst Angaben, Dokumente und Verweise zu einem Ding zusammen, z. B. zu einem Vertrag, einer Rechnung oder einem Vertragspartner.  
Siehe auch: [Mappentyp](#mappentyp), [Register](#register), [Dokument](#dokument).

<a id="mappentyp"></a>**Mappentyp** · ~ mit Erklärung · Administratoren  
Der Bauplan einer Mappe – welche Felder und Register sie hat, wie ihr Titel entsteht und wer was darf.  
Siehe auch: [Mappe](#mappe), [Feld](#feld), [Systemmappentyp](#systemmappentyp).

<a id="papierkorb"></a>**Papierkorb** · ✓ Alltagswort · alle  
Gelöschte Mappen. Sie lassen sich wiederherstellen, bis die eingestellte Zahl an Tagen abgelaufen ist.

<a id="pflichtfeld"></a>**Pflichtfeld** · ✓ Alltagswort · alle  
Ein Feld, das ausgefüllt sein muss, bevor die Mappe gespeichert werden kann.  
Siehe auch: [Eindeutig](#eindeutig).

<a id="profil"></a>**Profil** · ✓ Alltagswort · alle  
Die persönlichen Einstellungen des angemeldeten Benutzers, erreichbar über das Benutzermenü → „Mein Konto“.

<a id="register"></a>**Register** · ~ mit Erklärung · alle  
Ein Trennblatt in einer Mappe, z. B. Allgemein (mit Feldern), Dokumente, Verknüpfungen oder Historie. Notizen sind kein Register; sie öffnen sich über den Knopf „Notizen“ an der Mappe.

<a id="standardwert"></a>**Standardwert** · ~ mit Erklärung · Administratoren  
Die Vorbelegung eines Feldes beim Anlegen einer Mappe, auch mit Platzhaltern wie einem Nummernkreis.

<a id="systemmappentyp"></a>**Systemmappentyp** · ~ mit Erklärung · Administratoren  
Ein Mappentyp, den das DMS selbst mitbringt – Benutzer, Rolle und Post.  
Siehe auch: [Mappentyp](#mappentyp).

<a id="titel"></a>**Titel** · ✓ Alltagswort · alle  
Der Anzeigename einer Mappe. Er wird aus einer Vorlage mit Feldwerten gebildet.

<a id="trefferliste"></a>**Trefferliste** · ✗ Fachwort · Administratoren  
Legt fest, welche Spalten eine Liste zeigt. Ein Mappentyp hat eine oder mehrere Trefferlisten; eine davon ist der Standard. Eine Ansicht oder ein Verknüpfungsregister wählt eine davon, sonst gilt der Standard. Zeigt eine Ansicht mehrere Mappentypen, stehen nur Trefferlisten mit gleicher Kennung in allen zur Wahl, mit den gemeinsamen Spalten.

<a id="unteransicht"></a>**Unteransicht** · ~ mit Erklärung · Administratoren  
Eine Ansicht unterhalb einer anderen. Sie erbt deren Berechtigungen.

<a id="verknupfungen"></a>**Verknüpfungen** · ~ mit Erklärung · alle  
Das Register, das alle Mappen zeigt, die auf diese Mappe verweisen – die Gegenrichtung des Verweises.  
Siehe auch: [Verweis](#verweis).

<a id="version"></a>**Version** · ✓ Alltagswort · alle  
Ein Dokument kann mehrere Versionen haben. Beim Ersetzen entsteht eine neue Version, die älteren bleiben darunter und lassen sich zurückholen. Nur in Registern mit Versionierung. Nicht zu verwechseln mit der Version des DMS.  
Siehe auch: [Dokument](#dokument), [Archivmodus](#archivmodus), [Version des DMS](#version-des-dms).

<a id="verweis"></a>**Verweis** · ~ mit Erklärung · alle  
Ein Feld, das auf andere Mappen zeigt, z. B. von einer Rechnung auf den Vertrag.  
Siehe auch: [Verknüpfungen](#verknupfungen), [Verweisart](#verweisart).

<a id="verweisart"></a>**Verweisart** · ~ mit Erklärung · Administratoren  
Ob ein Verweis eine Zugehörigkeit ist („gehört zu“, z. B. eine Rechnung zum Vertrag) oder nur ein Bezug (z. B. der Aussteller). Die Mappe zeigt die Art am Verweis und in den Verknüpfungen.  
Siehe auch: [Verweis](#verweis).

<a id="werkbank"></a>**Werkbank** · ~ mit Erklärung · Administratoren  
Der Arbeitsbereich der Administratoren. Hier werden Mappentypen, Ansichten, Benutzer und Einstellungen gepflegt und das DMS betrieben.  
Siehe auch: [Ablage](#ablage), [Administrator](#administrator), [Werkbank anpassen](#werkbank-anpassen).

## Arbeiten in der Ablage

<a id="abwesenheit"></a>**Abwesenheit** · ✓ Alltagswort · alle  
Ein Zeitraum, in dem ein Benutzer nicht da ist – mit einem Vertreter, der seine Aufgaben übernimmt.

<a id="aktionen"></a>**Aktionen** · ✓ Alltagswort · alle  
Das Menü an einer Mappe – Aufgabe vergeben, Erinnern, Versenden, Exportieren und mehr.

<a id="anstehend"></a>**Anstehend** · ✓ Alltagswort · alle  
Die Ansicht mit meinen Fristen und Erinnerungen der nächsten Tage (Standard 30) – kommende und solche, die schon fällig sind und unter „Zu erledigen“ stehen.

<a id="aufgabe"></a>**Aufgabe** · ✓ Alltagswort · alle  
Etwas, das ein Mensch an einer Mappe tun soll. Arten sind Passt nicht, Erwähnung, Zugewiesen (von Hand vergeben), Post für dich, Frist, Erinnerung und Vertretung.  
Siehe auch: [Zu erledigen](#zu-erledigen), [Frist](#frist), [Erinnerung](#erinnerung), [Auftrag](#auftrag).

<a id="erinnerung"></a>**Erinnerung** · ✓ Alltagswort · alle  
Eine von Hand gesetzte Aufgabe für einen bestimmten Tag (Aktionen → Erinnern).

<a id="erweiterte-suche"></a>**Erweiterte Suche** · ✓ Alltagswort · alle  
Ein Suchformular über die Felder mehrerer Mappentypen und den Text in Dokumenten.

<a id="erwahnung"></a>**Erwähnung** · ✓ Alltagswort · alle  
Die Nennung eines Benutzers mit @ in formatiertem Text. Sie erzeugt für ihn eine Aufgabe.

<a id="export"></a>**Export** · ~ mit Erklärung · alle  
Ausgewählte Mappen einer Ansicht als Excel, CSV, ZIP oder PDF herunterladen.  
Siehe auch: [Vollexport](#vollexport), [Meine Daten exportieren](#meine-daten-exportieren), [Sicherung](#sicherung).

<a id="formatierter-text"></a>**Formatierter Text** · ~ mit Erklärung · alle  
Text mit Überschriften, Listen und Hervorhebungen (Markdown) – als Feldart und in Notizen.

<a id="frist"></a>**Frist** · ✓ Alltagswort · alle  
Eine Aufgabe, die aus einem Datumsfeld mit Vorlauf entsteht, z. B. „Kündigen bis …“.  
Siehe auch: [Erinnerung](#erinnerung), [Anstehend](#anstehend).

<a id="historie"></a>**Historie** · ✓ Alltagswort · alle  
Die Geschichte einer Mappe – Änderungen vorher und nachher, Dokumente, Papierkorb, Notizen, Aufgaben. Das technische Betriebsprotokoll heißt dagegen „Protokoll“.

<a id="kanal"></a>**Kanal** · ✗ Fachwort · alle  
Wie Post ins DMS kam oder hinausging. Das DMS setzt Hochgeladen, E-Mail, Ordner (Eingangsordner) und API selbst; Scan, Import und WebDAV lassen sich in der Liste von Hand wählen.

<a id="link"></a>**Link** · ✓ Alltagswort · alle  
Eine Adresse auf eine Ansicht oder Mappe, z. B. über „Link kopieren“ – auch lesbar über Mappentyp und Feldwerte. „Link“ steht nur für Adressen; Felder, die auf Mappen zeigen, heißen Verweis.

<a id="neue-post"></a>**Neue Post** · ✓ Alltagswort · alle  
Die Ansicht mit Post, die noch nicht zugeordnet oder erledigt ist. Wer Post zugewiesen bekommt, hat zusätzlich die Aufgabe „Post für dich“.

<a id="notiz"></a>**Notiz** · ✓ Alltagswort · alle  
Ein Kommentar an einer Mappe.

<a id="post"></a>**Post** · ✓ Alltagswort · alle  
Alles, was ins DMS kommt oder hinausgeht – Scan, Upload, E-Mail. Post ist ein Systemmappentyp mit Kanal, Richtung und Stand.  
Siehe auch: [Neue Post](#neue-post), [Zuordnen](#zuordnen), [Kanal](#kanal), [Richtung (Post)](#richtung-post), [Stand (Post)](#stand-post).

<a id="richtung-post"></a>**Richtung (Post)** · ✓ Alltagswort · alle  
Ob Post eingehend oder ausgehend ist. Mit „Per E-Mail versenden“ entsteht ausgehende Post.  
Siehe auch: [Post](#post).

<a id="stand-post"></a>**Stand (Post)** · ✓ Alltagswort · alle  
Wie weit Post bearbeitet ist – Neu (noch nicht bearbeitet), Zugeordnet (liegt bei einer passenden Mappe) oder Erledigt (nichts mehr zu tun).  
Siehe auch: [Post](#post), [Neue Post](#neue-post).

<a id="vertretung"></a>**Vertretung** · ✓ Alltagswort · alle  
Ein Benutzer übernimmt während einer Abwesenheit die Aufgaben eines anderen. Der Vertreter bekommt dazu eine Aufgabe der Art „Vertretung“.

<a id="volltext"></a>**Volltext** · ✗ Fachwort · alle  
Der durchsuchbare Text in den Dokumenten – aus der Textebene der Datei oder aus der Texterkennung.  
Siehe auch: [Texterkennung](#texterkennung), [Erweiterte Suche](#erweiterte-suche).

<a id="weitergeben"></a>**Weitergeben** · ✓ Alltagswort · alle  
Eine Aufgabe einem anderen Benutzer übertragen.

<a id="zu-erledigen"></a>**Zu erledigen** · ✓ Alltagswort · alle  
Die oberste Ansicht. Sie zeigt die Mappen, an denen ich etwas tun soll (meine offenen Aufgaben).  
Siehe auch: [Aufgabe](#aufgabe).

<a id="zuordnen"></a>**Zuordnen** · ✓ Alltagswort · alle  
Post einer vorhandenen oder neuen Mappe zuweisen. Die Dokumente wandern dabei in das Register der Mappe.

## Verwaltung (Werkbank)

<a id="administrator"></a>**Administrator** · ✓ Alltagswort · alle  
Ein Benutzer mit Zugang zur Werkbank. Für ihn gelten keine Einschränkungen durch Berechtigungen.

<a id="anmeldeschutz"></a>**Anmeldeschutz** · ~ mit Erklärung · Administratoren  
Sperre nach Fehlversuchen, gesperrte IP-Adressen, Vorgaben zur Zwei-Faktor-Anmeldung und die Anmeldung über einen Anbieter.

<a id="anmeldung-uber-einen-anbieter"></a>**Anmeldung über einen Anbieter** · ~ mit Erklärung · alle  
Anmelden mit einem fremden Konto, z. B. Microsoft 365 (OpenID Connect).

<a id="archivmodus"></a>**Archivmodus** · ~ mit Erklärung · Administratoren  
Eine Einstellung je Mappentyp für Aufbewahrungspflichten – mit Versionen und einer Löschsperre bis zum Fristende.

<a id="benutzer"></a>**Benutzer** · ✓ Alltagswort · alle  
Ein Konto, mit dem sich jemand anmeldet. Liegt als Systemmappe im DMS. Personen und Firmen, mit denen man zu tun hat (Kontakte), sind keine Benutzer, sondern gewöhnliche Mappen, z. B. vom Mappentyp „Organisation“ aus dem Paket Basis.

<a id="berechtigungen"></a>**Berechtigungen** · ✓ Alltagswort · Administratoren  
Wer was darf. Am Mappentyp – Anlegen, Lesen, Bearbeiten, Löschen, Passwörter sehen – mit einem Standard plus Regeln; an der Ansicht – Sehen, Anlegen, Exportieren – mit Vererbung an die Unteransichten. Für Administratoren gelten sie nicht.

<a id="darf-weg"></a>**Darf weg** · ✓ Alltagswort · Administratoren  
Die Liste der Mappen, deren Aufbewahrungsfrist abgelaufen ist.

<a id="design"></a>**Design** · ✓ Alltagswort · Administratoren  
Wie die Oberfläche aussieht – Logo, Schriftzug, Farben (hell, dunkel, hoher Kontrast oder nach Gerät) und eigenes CSS. Administratoren legen Designs unter Werkbank → Designs an und bestimmen den Standard; jeder Benutzer wählt seines im Profil unter „Darstellung“.  
Siehe auch: [Darstellung](#darstellung).

<a id="eingangsordner"></a>**Eingangsordner** · ~ mit Erklärung · Administratoren  
Ein Ordner, den das DMS beobachtet, z. B. für „Scan to Folder“. Jede Datei darin wird Post.

<a id="expertenmodus"></a>**Expertenmodus** · ✗ Fachwort · Fortgeschrittene  
Ein Schalter unter Werkbank → Pakete. Er blendet „Weitere Quellen“ und „Paket hochladen“ ein – für Paketentwickler und DMS ohne Internet. Gilt je Benutzer und ist zu Beginn aus.  
Siehe auch: [Paket](#paket), [Paketkatalog](#paketkatalog).

<a id="fehler-nachstellen"></a>**Fehler nachstellen** · ~ mit Erklärung · Administratoren  
Ein Administrator arbeitet vorübergehend unter dem Konto eines anderen Benutzers, um einen Fehler zu sehen. Zurück geht es mit „Zurück zum eigenen Konto“.

<a id="nummernkreis"></a>**Nummernkreis** · ✗ Fachwort · Administratoren  
Fortlaufende Nummern nach einem Muster wie {jjjj}-R{zaehler:4} (ergibt z. B. 2026-R0001), etwa für Rechnungsnummern.

<a id="paket"></a>**Paket** · ~ mit Erklärung · Administratoren  
Ein installierbares Bündel aus Mappentypen, Ansichten und Beispielen aus einem Paketkatalog, z. B. „Basis“. Ein Update ergänzt nur; es entfernt und ändert nichts.  
Siehe auch: [Paketkatalog](#paketkatalog), [Expertenmodus](#expertenmodus), [Paket-Läufer](#paket-laufer).

<a id="paket-laufer"></a>**Paket-Läufer** · ✗ Fachwort · Fortgeschrittene  
Der Teil des DMS, der den Code von Paketen ausführt. Geplant – bis dahin läuft Code in Paketen nicht; ihre Einstellungen lassen sich schon pflegen.  
Siehe auch: [Paket](#paket).

<a id="paketkatalog"></a>**Paketkatalog** · ~ mit Erklärung · Administratoren  
Die Liste der Pakete, die ein DMS installieren kann (eine Datei katalog.json im Netz). Das DMS fragt den offiziellen Katalog nur auf Knopfdruck ab („Katalog abrufen“). Weitere Kataloge trägt man im Expertenmodus unter „Weitere Quellen“ ein.  
Siehe auch: [Paket](#paket), [Expertenmodus](#expertenmodus).

<a id="postfach"></a>**Postfach** · ~ mit Erklärung · Administratoren  
Ein angebundenes E-Mail-Konto (IMAP), aus dem das DMS Post abholt.

<a id="regel"></a>**Regel** · ~ mit Erklärung · Administratoren  
Ein Wenn-dann-Baustein der Berechtigungen – Bedingung, dann Recht erteilen oder entziehen, auf Wunsch mit Stopp.

<a id="rolle"></a>**Rolle** · ~ mit Erklärung · Administratoren  
Eine Gruppe von Benutzern, z. B. „Eltern“. Grundlage für Berechtigungsregeln. Nicht zu verwechseln mit der Systemrolle.  
Siehe auch: [Systemrolle](#systemrolle).

<a id="systemrolle"></a>**Systemrolle** · ~ mit Erklärung · Administratoren  
Ob ein Benutzer Administrator oder Mitglied ist. Nur Administratoren kommen in die Werkbank.  
Siehe auch: [Rolle](#rolle), [Administrator](#administrator).

<a id="testlauf"></a>**Testlauf** · ~ mit Erklärung · Administratoren  
Prüft, welche Rechte ein bestimmter Benutzer am Ende hat.

<a id="texterkennung"></a>**Texterkennung** · ~ mit Erklärung · Administratoren  
Erkennt Text in Bildern und gescannten PDFs, damit er durchsuchbar wird.

<a id="tagliche-zusammenfassung"></a>**Tägliche Zusammenfassung** · ✓ Alltagswort · alle  
Eine E-Mail, die einmal am Tag die offenen Aufgaben eines Benutzers auflistet – nur, wenn er welche hat und nicht abwesend ist. Administratoren schalten sie unter Werkbank → Aufgaben ein; Uhrzeit und Wochentage wählt jeder im Profil.  
Siehe auch: [Aufgabe](#aufgabe), [Anstehend](#anstehend).

<a id="werkbank-anpassen"></a>**Werkbank anpassen** · ~ mit Erklärung · Administratoren  
Legt fest, welche Bereiche links in der Werkbank stehen – nach einer Vorlage („Haushalt“, „Organisation“ oder „Alles“) und mit Abweichungen. Ausblenden schaltet nichts ab. Neue Installationen starten mit „Haushalt“; Installationen von vor dieser Einstellung zeigen alles.  
Siehe auch: [Werkbank](#werkbank), [Übersicht](#ubersicht).

<a id="zwei-faktor-anmeldung"></a>**Zwei-Faktor-Anmeldung** · ~ mit Erklärung · alle  
Ein zusätzlicher Code aus einer App bei der Anmeldung.

<a id="ubersicht"></a>**Übersicht** · ✓ Alltagswort · Administratoren  
Die erste Seite der Werkbank – was in diesem DMS gerade zu tun ist, mit Hinweisen, Stand und Bestand.  
Siehe auch: [Werkbank](#werkbank).

## Betrieb und Sicherheit

<a id="api"></a>**API** · ✗ Fachwort · Fortgeschrittene  
Die Schnittstelle, über die Programme mit dem DMS arbeiten. Zugang mit einem persönlichen API-Schlüssel.

<a id="auftrag"></a>**Auftrag** · ✗ Fachwort · Administratoren  
Arbeit, die das DMS im Hintergrund erledigt und deren Fortschritt man sieht, z. B. Demo-Daten erzeugen, Vollexport, Nummern nachträglich vergeben. Es läuft immer nur ein Auftrag. Arbeit für Menschen heißt Aufgabe.

<a id="debug-modus"></a>**Debug-Modus** · ✗ Fachwort · Fortgeschrittene  
Ein ausführlicheres technisches Protokoll für die Fehlersuche.

<a id="demo-daten"></a>**Demo-Daten** · ✓ Alltagswort · Administratoren  
Erzeugte Beispielmappen zum Ausprobieren und für Lasttests.

<a id="einrichtungsassistent"></a>**Einrichtungsassistent** · ✓ Alltagswort · Administratoren  
Die Schritte beim ersten Start des DMS.  
Siehe auch: [Einrichtungscode](#einrichtungscode).

<a id="einrichtungscode"></a>**Einrichtungscode** · ~ mit Erklärung · Administratoren  
Der Code aus dem Protokoll des Containers, der die Einrichtung freischaltet.

<a id="fingerabdruck"></a>**Fingerabdruck** · ~ mit Erklärung · Administratoren  
Eine kurze Prüfkennung, an der man einen Schlüssel wiedererkennt.

<a id="gemeldete-fehler"></a>**Gemeldete Fehler** · ✓ Alltagswort · Administratoren  
Fehler, die Benutzer über „Fehler melden“ eingereicht haben (Werkbank → Gemeldete Fehler).

<a id="haushalt"></a>**Haushalt** · ✓ Alltagswort · Administratoren  
Der Haushalt (oder die Firma), für den das DMS eingerichtet ist. Eine Installation ist ein Haushalt. „Mandant“ steht nur im Code und, wo technisch nötig, im Administratorhandbuch. Geplant: Je nach Sprachprofil soll es „Haushalt“ oder „Organisation“ heißen.  
Noch offen: [Frage 23](#offen-23).

<a id="konsole"></a>**Konsole** · ✗ Fachwort · Fortgeschrittene  
Der Befehl „dms“ im Container für Notfall und Betrieb.

<a id="meine-daten-exportieren"></a>**Meine Daten exportieren** · ✓ Alltagswort · alle  
Ein Benutzer lädt im Profil seine eigenen Daten herunter.

<a id="notfallblatt"></a>**Notfallblatt** · ✓ Alltagswort · Administratoren  
Ein PDF mit dem Schlüssel und einer Anleitung zur Wiederherstellung.

<a id="probe-wiederherstellung"></a>**Probe-Wiederherstellung** · ~ mit Erklärung · Administratoren  
Prüft eine Sicherung, ohne die echten Daten anzutasten.

<a id="protokoll"></a>**Protokoll** · ~ mit Erklärung · Fortgeschrittene  
Das laufende Betriebsprotokoll des Servers mit Modulen und Stufen (Werkbank → Protokoll). Die Geschichte einer Mappe heißt dagegen Historie.  
Siehe auch: [Historie](#historie).

<a id="schlussel"></a>**Schlüssel** · ~ mit Erklärung · Administratoren  
Der geheime Schlüssel, mit dem Passwortfelder und Sicherungen verschlüsselt sind. Er liegt nie in der Datenbank. Der feste Name eines Felds heißt dagegen Kennung.  
Siehe auch: [Fingerabdruck](#fingerabdruck), [Notfallblatt](#notfallblatt).

<a id="sicherung"></a>**Sicherung** · ✓ Alltagswort · Administratoren  
Eine verschlüsselte Gesamtsicherung, die sich in ein DMS zurückspielen lässt. Kein Export – ohne DMS nicht lesbar.  
Siehe auch: [Wiederherstellen](#wiederherstellen), [Probe-Wiederherstellung](#probe-wiederherstellung), [Vollexport](#vollexport).

<a id="speicherplatz"></a>**Speicherplatz** · ✓ Alltagswort · Administratoren  
Wie voll die Datenordner sind, mit Schwellen für Warnungen.

<a id="version-des-dms"></a>**Version des DMS** · ✓ Alltagswort · alle  
Der Stand des Programms, z. B. 0.73. Ein Update bringt eine neue Version des DMS; an Dokumenten und ihren Versionen ändert das nichts. Was neu ist, steht unter „Neu in dieser Version“.  
Siehe auch: [Version](#version).

<a id="vollexport"></a>**Vollexport** · ~ mit Erklärung · Administratoren  
Alle Daten in offenen Formaten, lesbar auch ohne DMS – damit niemand am DMS hängen bleibt.

<a id="wartungsmodus"></a>**Wartungsmodus** · ~ mit Erklärung · Administratoren  
Eine vorübergehende Sperre für Benutzer mit Ankündigung, z. B. während einer Wiederherstellung.  
Noch offen: [Frage 10](#offen-10).

<a id="wartungsoperationen"></a>**Wartungsoperationen** · ✗ Fachwort · Administratoren  
Einmalige Pflegearbeiten, z. B. Nummern nachträglich vergeben.  
Noch offen: [Frage 10](#offen-10).

<a id="wiederherstellen"></a>**Wiederherstellen** · ✓ Alltagswort · Administratoren  
Eine Sicherung in ein DMS zurückspielen.

## Noch offen

Manche Wörter stehen für mehr als eine Sache oder klingen zu ähnlich. Das wollen wir nach und nach klären. Bis dahin gelten die Begriffe oben.

<a id="offen-10"></a>**10. „Wartung“ dreifach – Werkbank-Gruppe „Wartung und Fehlersuche“, Wartungsmodus, Wartungsoperationen**  
Vorschlag: Werkbank-Gruppe neu benennen („Betrieb“), „Wartungsoperationen“ → „Pflegearbeiten“.

<a id="offen-23"></a>**23. „Organisation“ für drei Dinge**  
Vorschlag: „Organisation“ ist eine Vorlage unter „Werkbank anpassen“, das geplante Wort für den Haushalt im Sprachprofil für Firmen und ein Mappentyp im Paket Basis. Klären, welches das Wort behält; bis dahin im Text immer sagen, welches gemeint ist.

## Entschieden

Diese Fragen sind geklärt. Die alten Wörter stehen unten unter „nicht verwenden“.

<a id="offen-1"></a>**1. „Aufgabe“ ist Oberbegriff und zugleich eine Art** (31.10.2026)  
Die Art heißt „Zugewiesen“; der Oberbegriff bleibt „Aufgabe“.

<a id="offen-2"></a>**2. „Eingang“ ist nicht eingehende Post** (31.10.2026)  
„Eingang“ heißt „Zu erledigen“; „Eingangsordner“ bleibt.

<a id="offen-3"></a>**3. „Protokoll“ für die Geschichte einer Mappe und für das Betriebsprotokoll** (31.10.2026)  
Mappe → „Historie“, Werkbank → „Protokoll“.

<a id="offen-4"></a>**4. „Schlüssel“ für Verschlüsselung, Kennung eines Feldes und API-Schlüssel** (31.10.2026)  
Feld, Register, Mappentyp und Nummernkreis → „Kennung“; Verschlüsselung und API-Schlüssel bleiben „Schlüssel“.

<a id="offen-5"></a>**5. „Sicht“ und „Ansicht“ liegen zu nah beieinander** (31.10.2026)  
„Sicht“ → „Ansicht“; im Profil „Darstellung auf diesem Gerät“; „Werkbank anpassen“; bei den Paketen „Expertenmodus“.

<a id="offen-6"></a>**6. „Vertretung“ auch beim Fehler nachstellen („Vertretung beenden“)** (31.10.2026)  
„Zurück zum eigenen Konto“.

<a id="offen-7"></a>**7. „Fehlermeldungen“ meint gemeldete Fehler** (31.10.2026)  
„Gemeldete Fehler“.

<a id="offen-8"></a>**8. Verweis, Referenz, Verknüpfung, Link, Direktlink** (31.10.2026)  
Feldart „Verweis“, Register „Verknüpfungen“; Adressen heißen nur „Link“.

<a id="offen-9"></a>**9. Export, Vollexport, persönlicher Export, Sicherung** (31.10.2026)  
Überall „Meine Daten exportieren“; die Sicherung steht im Handbuch klar als „kein Export“.

<a id="offen-11"></a>**11. „Trefferliste“ am Mappentyp und an der Ansicht** (31.10.2026)  
Kein neues Wort. Der Mappentyp legt seine Trefferlisten fest, eine davon ist der Standard; eine Ansicht wählt eine davon, sonst gilt der Standard (siehe „Trefferliste“).

<a id="offen-12"></a>**12. „Aufgabe“ und „Auftrag“ sind sehr nah** (31.10.2026)  
Beide Wörter bleiben. „Aufgabe“ ist Arbeit für Menschen, „Auftrag“ Arbeit, die das DMS im Hintergrund erledigt.

<a id="offen-13"></a>**13. Mandant, Haushalt, Organisation, Firma** (31.10.2026)  
„Haushalt“ in allem, was Benutzer sehen; „Mandant“ nur im Code und wo technisch nötig.

<a id="offen-14"></a>**14. Benutzer und Person** (31.10.2026)  
„Benutzer“ ist ein Konto zum Anmelden. Kontakte – Personen, Firmen, Behörden – sind gewöhnliche Mappen und keine Benutzer.

<a id="offen-15"></a>**15. Übersicht, Zusammenfassung, Anstehend** (31.10.2026)  
Drei Begriffe mit je eigener Bedeutung – „Übersicht“ (erste Seite der Werkbank), „Tägliche Zusammenfassung“ (E-Mail mit offenen Aufgaben), „Anstehend“ (Ansicht mit Fristen und Erinnerungen).

<a id="offen-16"></a>**16. Typ, Mappentyp, Feldart, Art** (31.10.2026)  
Konsequent „Mappentyp“ und „Feldart“.

<a id="offen-17"></a>**17. Dokument, Datei, Anhang** (31.10.2026)  
Datei = was hochgeladen oder heruntergeladen wird, Dokument = was im DMS in einer Mappe liegt, Anhang = an einer E-Mail.

<a id="offen-18"></a>**18. Version eines Dokuments und Version des DMS** (31.10.2026)  
Zwei Begriffe – „Version“ gehört zu einem Dokument, „Version des DMS“ ist der Stand des Programms. Erklärt auf der Seite „Versionen verstehen“.

<a id="offen-19"></a>**19. Design, Darstellung, Theme** (31.10.2026)  
„Design“ legen Administratoren in der Werkbank an (Logo, Farben, eigenes CSS); „Darstellung“ ist der Bereich im Profil, in dem jeder sein Design, die Schriftgröße und die Breiten wählt. „Theme“ nicht verwenden.

<a id="offen-20"></a>**20. „Neue Post“ als Ansicht und als Art einer Aufgabe** (31.10.2026)  
Die Aufgabenart heißt „Post für dich“; die Ansicht „Neue Post“ bleibt.

<a id="offen-22"></a>**22. „Rolle“ für Administrator/Mitglied und für Gruppen wie „Eltern“** (31.10.2026)  
„Systemrolle“ (Administrator, Mitglied) und „Rolle“ (Gruppen).

## Für alle, die Texte schreiben

Wer Oberfläche, Handbuch, Hilfetexte oder Release-Notizen schreibt, verwendet die Begriffe oben und nicht die Wörter in der Spalte „nicht verwenden“. Neue Begriffe kommen mit dem Release ins Glossar: [`docs/glossar.yml`](https://github.com/motom001/dms/blob/main/docs/glossar.yml).

| Begriff | nicht verwenden | im Code |
|---|---|---|
| Abwesenheit | – | `Abwesenheit` |
| Administrator | Admin (in der Oberfläche) | – |
| Anmeldung über einen Anbieter | SSO, OIDC (in der Oberfläche) | – |
| Ansicht | Sicht, Filter, View | `Sicht` |
| Anstehend | – | `Anstehend` |
| Archivmodus | – | `Archiv` |
| Aufgabe | Auftrag, Task, Todo | `Aufgabe, AUFGABENARTEN` |
| Auftrag | Job | `Auftrag` |
| Bedingung | – | `Bedingung` |
| Benutzer | User, Account | `Benutzer` |
| Berechtigungen | Permissions | `Rechte` |
| Darstellung | Theme, Ansicht (für das Aussehen) | – |
| Design | Theme | – |
| Dokument | – | `Dokument` |
| Erinnerung | – | `Erinnerung` |
| Erweiterte Suche | – | `Suchformular` |
| Expertenmodus | Erweiterte Ansicht | `pakete_erweitert` |
| Fehler nachstellen | Impersonation, Vertretung beenden | `Vertretung` |
| Feld | – | `Feld` |
| Feldart | Feldtyp, Datentyp, Art (allein) | `Feldtyp, FELDTYPEN, Feld.typ` |
| Gemeldete Fehler | Fehlermeldungen | – |
| Haushalt | Mandant (in der Oberfläche) | `mandant, haushalt_id` |
| Historie | Protokoll (an der Mappe), Verlauf | `Historieneintrag` |
| Kennung | Schlüssel (für Felder), Key | `key, schluessel` |
| Link | Direktlink, sprechender Link | `Direktlink` |
| Mappe | Akte, Ordner, Datensatz | `Mappe` |
| Mappentyp | Typ (allein), Vorlage, Klasse | `Mappentyp` |
| Meine Daten exportieren | Persönlicher Export | – |
| Notiz | – | `Notiz` |
| Nummernkreis | – | `Nummernkreis` |
| Paket | Plugin, Erweiterung, App, Modul | `InstalliertesPaket` |
| Paket-Läufer | – | `PaketLaeufer` |
| Paketkatalog | – | `Katalog, OFFIZIELLER_KATALOG` |
| Post | Posteingang, Inbox | – |
| Regel | – | `Regel` |
| Register | Tab, Reiter | `Register` |
| Rolle | Gruppe, Weitere Rollen | `rolle (Systemtyp), Benutzer.rollen` |
| Sicherung | Backup (in der Oberfläche) | – |
| Standardwert | Defaultwert | – |
| Systemmappentyp | – | `Systemtyp` |
| Systemrolle | Rolle (für Administrator/Mitglied) | `Rolle, Benutzer.rolle` |
| Texterkennung | OCR (in der Oberfläche) | `OcrStand` |
| Trefferliste | – | `Trefferliste` |
| Tägliche Zusammenfassung | Übersicht per E-Mail, Digest | – |
| Unteransicht | Untersicht | – |
| Version | Revision, Stand (für Dokumente) | `DokumentVersion` |
| Version des DMS | Release (in der Oberfläche) | – |
| Vertretung | – | `Abwesenheit.vertreterId, vertretung (Aufgabenart)` |
| Verweis | Referenz, Link, Relation | `referenz, Feld.zielTyp` |
| Verweisart | – | `Verweisart, VERWEISARTEN` |
| Werkbank anpassen | – | `WerkbankAnsicht, VORLAGEN` |
| Zu erledigen | Eingang, Inbox, Posteingang | `eingang` |
| Zwei-Faktor-Anmeldung | 2FA, MFA (in der Oberfläche) | – |

*Stand: 2026-10-31*
