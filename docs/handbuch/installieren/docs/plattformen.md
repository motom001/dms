# Geprüfte Plattformen

Diese Anleitungen nennen viele Geräte und Systeme. Hier steht ehrlich, **was davon das Projekt selbst prüft** und was andere gemeldet haben. Eine Zusage gibt es nur dort, wo wir selbst prüfen können.

## Die Stufen

| Stufe | Was das heißt | Zusage |
| --- | --- | --- |
| **Automatisch geprüft** | Die Rechner von GitHub prüfen jede Änderung, bevor sie in Ablago kommt – ohne echtes NAS, aber auf beiden Architekturen. | ja, für jede Version |
| **Vom Projekt getestet** | Das Gerät ist dauerhaft beim Projekt. Wir prüfen darauf vor größeren Versionen; die Messwerte stehen in [#576](https://github.com/motom001/dms/issues/576). | ja – bis zum angegebenen Datum |
| **Mehrfach gemeldet** | Mindestens zwei unabhängige Meldungen aus der Gemeinschaft, davon eine aus den letzten Versionen. | nein, ein Hinweis |
| **Einzelne Meldung** | „Läuft laut einer Rückmeldung.“ | nein, ein Hinweis |

Jede Zeile nennt die **Ablago-Version und das Datum** der letzten Prüfung bzw. Meldung. Liegt eine Meldung mehr als etwa 10 Versionen zurück, steht dort **älterer Stand** – neue Versionen können sich anders verhalten.

## Vom Projekt geprüft

| Gerät | Architektur | Stufe | Letzte Prüfung | Geprüft voraussichtlich bis | Grund |
| --- | --- | --- | --- | --- | --- |
| GitHub-Rechner (Ubuntu, x64) | amd64 | automatisch geprüft | laufend: jede Änderung und jede Version | – | – |
| GitHub-Rechner (Ubuntu, arm64) | arm64 | automatisch geprüft | laufend: jede Änderung und jede Version | – | – |
| UGREEN DXP4800 Plus | amd64 (Intel) | vom Projekt getestet | Ablago 0.143.0, 02.11.2026: Lasttest `alle` ([Messwerte](https://github.com/motom001/dms/issues/576#issuecomment-6588590651)); läuft dort im Alltag ([Beispiel](beispiel.md)) | 31.12.2028 | Gerät ist noch im Handel; laufendes Jahr plus 2 Jahre Herstellergarantie decken die Supportzeit ab |

**Was die GitHub-Rechner prüfen:**

- **x64:** alle automatischen Tests mit PostgreSQL 18, das Image `dms` und `dms-komplett`, die Vorlagen für Synology, UGREEN, QNAP, TrueNAS, Unraid und den Raspberry Pi (starten, Ablago antwortet, Einrichtungsassistent beginnt richtig). Dazu kommt ein wöchentlicher [Lasttest](https://help.ablago.app/admin/aktuell/verkraftet/); die Messwerte stehen in [#576](https://github.com/motom001/dms/issues/576).
- **arm64:** auf einem echten ARM-Rechner (nicht nachgebildet) die Images `dms` und `dms-komplett` bauen und probehalber starten, die Werkzeuge im Image.

Die Vorlagen laufen dabei auf einem gewöhnlichen Linux mit Docker, nicht auf dem NAS selbst. Ob die Oberfläche eines NAS (Container Manager, App Center …) mitspielt, zeigt erst ein echtes Gerät.

### Datenbank: PostgreSQL { #postgresql }

| Hauptversion | Stand | Wo |
| --- | --- | --- |
| **18** | **geprüft:** alle automatischen Tests, die Vorlagen, `dms-komplett` (seit Ablago 0.306) | Vorlagen, `dms-komplett`, App aus dem [TrueNAS-Katalog](truenas.md) |
| 17 | **nicht mehr geprüft** (seit Ablago 0.306; bis 0.305 alle Tests). Ablago startet und schreibt einen Hinweis ins Protokoll. Geprüft bleibt nur der Umzug: Sicherung auf 17 ziehen, auf 18 einspielen, Daten gleich. | ältere Installationen mit zwei Containern |
| 16 | nicht geprüft; Ablago startet mit Hinweis im Protokoll | eigene Datenbank |
| 15 und älter | Ablago startet nicht und nennt den Grund | – |

Wie du von 17 auf 18 umziehst, steht unter [Aktualisieren → PostgreSQL 18](https://help.ablago.app/admin/aktuell/aktualisieren/#postgresql-18). Sicherungen von Ablago lassen sich zwischen 17 und 18 in beide Richtungen einspielen.

**Der Raspberry Pi 5** soll als nächstes Gerät „vom Projekt getestet“ werden. Dafür sucht das Projekt noch ein Gerät, siehe [Was das Projekt braucht (#589)](https://github.com/motom001/dms/issues/589).

## Aus der Gemeinschaft gemeldet

| Gerät | Architektur | Stufe | Letzte Meldung | Hinweis |
| --- | --- | --- | --- | --- |
| *noch keine Meldung* | | | | |

Ein gebrauchter Mini-PC, Thin Client oder ein altes Notebook ist oft die günstigste Wahl – worauf du achten solltest, steht unter [Gebrauchte Hardware](gebrauchte-hardware.md).

Meldungen sind ein **Hinweis, keine Zusage**. Das Projekt prüft sie auf Plausibilität – passen die Werte zu ähnlichen Geräten, gibt es Widersprüche? –, nicht auf Wahrheit, und fragt bei Auffälligem nach. Entscheidungen stützen wir nie allein auf Meldungen; sie können aber Anlass sein, ein Gerät für „vom Projekt getestet“ zu suchen.

## Was „geprüft voraussichtlich bis“ heißt

Jedes Gerät, das das Projekt selbst testet, bekommt ein Datum, **bis wann** wir es voraussichtlich prüfen, und den **Grund** dafür – zum Beispiel ein Nachfolgemodell, das Ende der Updates beim Hersteller oder eine Architektur, für die es kein Image mehr gibt. Die Dauer legen wir für jedes Gerät einzeln fest.

Läuft ein Gerät aus, verschwindet es **nicht still**: Es wechselt sichtbar auf „nicht mehr vom Projekt getestet (seit Version …, Grund …)“ und bleibt mit seinen letzten Messwerten stehen. Das kündigen wir rechtzeitig vorher in den Versionshinweisen an.

| Gerät | Nicht mehr vom Projekt getestet seit | Grund | Letzte Messwerte |
| --- | --- | --- | --- |
| *bisher keines* | | | |

## Dein Gerät melden

Läuft Ablago bei dir auf einem Gerät, das hier fehlt? Wir nehmen Meldungen in fester Form auf, immer mit **Gerät, Ablago-Version und Datum**:

- **Mit Messwerten:** [Lasttest selbst durchführen](https://help.ablago.app/admin/aktuell/lasttest/) und das Ergebnis in [Messergebnisse Lasttest (#576)](https://github.com/motom001/dms/issues/576) melden.
- **Ohne Messung:** mit der Vorlage „Ich nutze Ablago“ – siehe [Wer nutzt Ablago? (#466)](https://github.com/motom001/dms/issues/466).

Alles dort ist öffentlich – bitte keine persönlichen Daten, Adressen, Rechnernamen oder IP-Adressen.

Ein Gerät für das Projekt übrig – geschenkt, geliehen oder für ein paar Tage? Was wir suchen und wofür, steht in [Was das Projekt braucht (#589)](https://github.com/motom001/dms/issues/589).
