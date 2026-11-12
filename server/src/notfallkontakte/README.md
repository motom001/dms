# Notfallkontakte (#812)

**Zweck:** Vertrauenspersonen, die wissen sollen, dass es die Ablage gibt – ohne Konto, ohne Rechte, ohne Link. Sie
stehen auf dem Notfallblatt unter „Wen fragen?“ und bekommen eine kurze Info-Mail. Werkbank → Verschlüsselung →
Notfallkontakte und der Schritt „Optionales“ im Einrichtungsassistenten. Schicht 3 (nicht in `SCHICHTEN` genannt).

- `notfallkontakte.dienst.ts` – `NotfallkontakteDienst`: `liste`, `stand` (Werkbank), `anlegen`, `aendern`, `loeschen`,
  `erneutSenden`, `zustellen` (Zeitplan: wartende Info-Mails, sobald der Versand eingerichtet ist), `fuerBlatt`,
  `blattErstellt`/`blattVeraltet` („Notfallblatt neu ausdrucken“); `notfallMail` baut Betreff und Text.
- `notfallkontakte.routen.ts` – `/api/werkbank/notfallkontakte` (Bereich `verschluesselung`, nie in einer Vertretung).
- `index.ts` – die einzige Tür. Prüfung der Eingaben, Grenzen und gekürzte Adresse: `shared/src/notfallkontakte.ts`.

**Abhängigkeiten**

- Kern (Repo: Tabelle `notfallkontakte`, Migration 107; Einstellung `notfallkontakte_blatt`), über den Anschluss der
  Kurzzustand; Mailer, Name der Ablage und Personen verbindet `ablago.ts` mit `verbinde`.
- Notfallblatt (`http/routen-kontext.ts`), Vollexport, persönlicher Export und Auskunft lesen die Kontakte über das Repo.

**Regeln (Durchsicht Sicherheit, 12.11.2026)**

- Höchstens 10 Kontakte (atomar im Repo, PostgreSQL mit Sperre je Haushalt) und 20 Mails je Ablage und Tag (vorab und
  atomar im Kurzzustand gezählt, über alle Prozesse; darüber 429). „Erneut senden“ einmal je Kontakt und Tag.
- Mails nur beim Anlegen, bei neuer Adresse (an die neue) und beim Löschen (nur nach einer verschickten Info-Mail).
  Löschen geht auch über der Grenze – dann ohne Mitteilung.
- Mail nur Text: kein Link, kein Anhang, keine Adresse von Ablago. Platzhalter nur eintragende Person, Ablage, Kontakt –
  die Notiz nie. Namen bereinigt (`mailName`), Link-Artiges (`://`, `www.`, `@`) beim Speichern abgelehnt.
- Reply-To nur mit Haken, und einschalten darf ihn nur, wer den Kontakt eingetragen hat.
- Protokoll nur mit gekürzter Adresse (`l***@example.org`); der Mailer protokolliert über `anImProtokoll` ebenso.
