/**
 * Die gemessenen Abläufe der Oberflächen-Messung (#1276) – die häufigsten Anwendungsfälle (W-Fälle), bedient wie eine
 * Person. Liste abgestimmt mit Thomas (15.11.2026): elf Abläufe; Ergänzungen, wenn beim Messen etwas auffällt (#1324: langes
 * Dokument in der Mappe).
 *
 * Je Ablauf:
 *   id, name     – Schlüssel im Ergebnis (bleibt stabil, sonst geht der Vergleich verloren) und Name im Bericht;
 *   verwaltung   – im Verwaltungsmodus (Werkbank);
 *   vorbereiten  – vor jeder Runde, nicht gemessen (z. B. die Seite öffnen, von der der Schritt ausgeht);
 *   schritt      – gemessen: vom ersten Klick bzw. Aufruf, bis das Ergebnis zu sehen ist;
 *   aufraeumen   – nach jeder Runde, nicht gemessen (z. B. angelegte Post wieder löschen).
 * `d` sind die Daten aus daten.mjs (Ids, Sitzung, api), `runde` zählt über alle Runden hoch.
 * Gewartet wird nur auf Elemente und Zustände, nie eine feste Zeit (wie in den Rauchtests).
 */
import { beispielPdfSeiten } from '../pdf.mjs';

const mappen = (s) => s.getByRole('region', { name: 'Mappen' });
const mappe = (s) => s.getByRole('region', { name: 'Mappe' });
const ZEILEN = '.mappenliste li, .trefferliste tbody tr';

export const ABLAEUFE = [
  {
    id: 'startseite',
    name: 'Startseite öffnen',
    schritt: async (s, d) => {
      await s.goto(d.basis + '/ablage/start');
      await s.getByRole('heading', { name: /^Guten Tag/, level: 1 }).waitFor();
      await s.locator('[data-kachel]').first().waitFor();
      await s.getByRole('region', { name: 'Zuletzt geöffnet' }).waitFor();
    },
  },
  {
    id: 'suche',
    name: 'Suche mit Treffern',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + '/ablage/start');
      await s.getByRole('heading', { name: /^Guten Tag/, level: 1 }).waitFor();
    },
    schritt: async (s) => {
      const feld = s.getByRole('banner').getByRole('searchbox', { name: 'In deiner Ablage suchen' });
      await feld.click();
      await feld.pressSequentially('Rechnung');
      await feld.press('Enter');
      await s.waitForURL(/\/ablage\/suche\?volltext=Rechnung$/);
      await mappen(s).locator(ZEILEN).first().waitFor();
    },
  },
  {
    id: 'mappe-oeffnen',
    name: 'Mappe öffnen (60 Dokumente)',
    schritt: async (s, d) => {
      await s.goto(d.basis + `/ablage/${d.vertrag}/${d.vieleDokumente}`);
      await mappe(s).getByRole('heading', { name: d.vieleDokumenteTitel, level: 1 }).waitFor();
      await mappe(s)
        .getByRole('tab', { name: /^Vertragsunterlagen/ })
        .click();
      await s.locator('.dokzeile').filter({ hasText: 'Hausrat Bedingungen.pdf' }).first().waitFor();
      await s.locator('.dokzeile').filter({ hasText: 'Messbrief 01.pdf' }).first().waitFor();
    },
  },
  {
    id: 'post-ablegen',
    name: 'Neue Post: Datei ablegen',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/${d.neuePostSicht}`);
      await mappen(s)
        .getByRole('heading', { name: /^Neue Post/, level: 1 })
        .waitFor();
    },
    schritt: async (s, d, runde) => {
      const [wahl] = await Promise.all([s.waitForEvent('filechooser'), mappen(s).getByRole('button', { name: '+ Post' }).click()]);
      const seiten = Array.from({ length: 6 }, (_, i) => `Messbrief ${runde} Seite ${i + 1} Beispielweg 12 Dresden`);
      await wahl.setFiles({ name: `Messbrief ${runde}.pdf`, mimeType: 'application/pdf', buffer: beispielPdfSeiten(seiten) });
      await s.waitForURL(/\/uebernehmen$/);
      await s.getByRole('region', { name: 'Dokument' }).getByRole('img', { name: 'Seite 1 von 100', exact: true }).waitFor();
    },
    aufraeumen: async (s, d) => {
      const id = /\/([0-9a-f-]{36})\/uebernehmen$/.exec(new URL(s.url()).pathname)?.[1];
      if (id) await d.api('DELETE', `/api/mappen/${id}?grund=nicht_noetig`);
    },
  },
  {
    // Die Bremse aus #1255: Mit dem Stand vor PR #1257 stand der Tab nach der Wahl des Typs sekundenlang.
    id: 'post-zuordnen',
    name: 'Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/eingang/${d.langePost}`);
      await s.waitForURL(/\/uebernehmen$/);
      await s.getByRole('region', { name: 'Dokument' }).getByRole('img', { name: 'Seite 1 von 100', exact: true }).waitFor();
      await mappe(s).getByRole('combobox', { name: 'Mappentyp suchen …' }).waitFor();
    },
    schritt: async (s) => {
      await mappe(s).getByRole('combobox', { name: 'Mappentyp suchen …' }).click();
      await mappe(s)
        .getByRole('option', { name: /^Vertrag Laufender Vertrag/ })
        .click();
      const feld = mappe(s).getByRole('textbox', { name: 'Vertragsnummer' });
      await feld.click();
      await feld.pressSequentially('HR-2027-0815');
      await s.waitForFunction(() => document.querySelector('#feld-vertragsnummer')?.value === 'HR-2027-0815');
    },
  },
  {
    id: 'mappe-speichern',
    name: 'Mappe ändern und speichern (Tabelle 300 Zeilen)',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/${d.vertrag}/${d.tabelle}`);
      await mappe(s).getByRole('heading', { name: d.tabelleTitel, level: 1 }).waitFor();
      await mappe(s).getByRole('button', { name: 'Änderungen verwerfen', disabled: true }).waitFor();
    },
    schritt: async (s, d, runde) => {
      const feld = mappe(s).getByRole('textbox', { name: 'Vertragsnummer' });
      await feld.click();
      await feld.press('ControlOrMeta+A');
      await feld.pressSequentially(`SM-${runde}`);
      await mappe(s).getByRole('button', { name: 'Mappe speichern' }).click();
      await mappe(s).getByRole('button', { name: 'Änderungen verwerfen', disabled: true }).waitFor();
    },
  },
  {
    id: 'zu-erledigen',
    name: 'Zu erledigen: Liste, dann Monat',
    schritt: async (s, d) => {
      await s.goto(d.basis + '/ablage/eingang');
      await s.getByRole('radiogroup', { name: /Ansicht/ }).waitFor();
      await s.getByRole('radio', { name: 'Monat' }).click();
      await s.locator('.ka-raster[aria-busy="false"]').first().waitFor();
    },
  },
  {
    id: 'ansicht-blaettern',
    name: 'Ansicht mit vielen Mappen blättern (300 Zeilen)',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/${d.rechnung}`);
      await mappen(s).locator(ZEILEN).first().waitFor();
    },
    schritt: async (s) => {
      // Ans Ende rollen, bis 300 Zeilen da sind: Die Liste lädt beim Rollen nach.
      for (let n = await mappen(s).locator(ZEILEN).count(); n < 300;) {
        await mappen(s).locator(ZEILEN).last().scrollIntoViewIfNeeded();
        await s.waitForFunction(([sel, vorher]) => document.querySelectorAll(sel).length > vorher, [ZEILEN, n]);
        n = await mappen(s).locator(ZEILEN).count();
      }
    },
  },
  {
    id: 'vorschau',
    name: 'Dokument-Vorschau mehrseitig (60 Seiten)',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/${d.vertrag}/${d.vieleDokumente}`);
      await mappe(s)
        .getByRole('tab', { name: /^Vertragsunterlagen/ })
        .click();
      await s.locator('.dokzeile').filter({ hasText: 'Hausrat Bedingungen.pdf' }).first().waitFor();
    },
    schritt: async (s) => {
      const zeile = s.locator('.dokumentliste li', { hasText: 'Hausrat Bedingungen.pdf' });
      await zeile.getByRole('button', { name: /^Weitere Handlungen für/ }).click();
      await s.getByRole('menuitem', { name: 'Seiten …' }).click();
      await s.getByRole('region', { name: /^Seiten von/ }).waitFor();
      await s.waitForFunction(() => {
        const bilder = [...document.querySelectorAll('.pdfseiten img')];
        return bilder.length >= 60 && bilder.slice(0, 4).every((b) => b.complete && b.naturalWidth > 0);
      });
    },
  },
  {
    // Seitenbetrachter (#1324, #1339): ein langes Dokument als Seiten, Seite 80 per Eingabe und Enter – die Bilder
    // dazwischen lädt die Seite nicht.
    id: 'langes-dokument',
    name: 'Langes Dokument ansehen, auf Seite 80 springen (100 Seiten)',
    vorbereiten: async (s, d) => {
      await s.goto(d.basis + `/ablage/eingang/${d.langePost}?als=post`);
      await mappe(s)
        .getByRole('tab', { name: /^Dokumente/ })
        .click();
      await mappe(s).getByRole('button', { name: 'Hausrat Bedingungen 2027.pdf', exact: true }).waitFor();
    },
    schritt: async (s) => {
      await mappe(s).getByRole('button', { name: 'Hausrat Bedingungen 2027.pdf', exact: true }).click();
      const sprung = mappe(s).getByRole('textbox', { name: 'Seite (1 bis 100), mit Enter dorthin springen' });
      await sprung.fill('80');
      await sprung.press('Enter');
      await s.waitForFunction(() => {
        const b = document.querySelector('[data-seite="80"] img');
        return !!b && b.complete && b.naturalWidth > 0;
      });
    },
  },
  {
    id: 'werkbank-uebersicht',
    name: 'Werkbank-Übersicht',
    verwaltung: true,
    schritt: async (s, d) => {
      await s.goto(d.basis + '/werkbank');
      await s.locator('.uebersicht .uebersicht-hinweise').waitFor();
    },
  },
  {
    id: 'mappentyp-editor',
    name: 'Mappentyp-Editor öffnen (Vertrag)',
    verwaltung: true,
    schritt: async (s, d) => {
      await s.goto(d.basis + `/werkbank/typen/${d.vertrag}`);
      const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
      await bearbeitung.getByRole('heading', { name: 'Vertrag', level: 1 }).waitFor();
      await bearbeitung.getByRole('region', { name: 'Felder' }).waitFor();
    },
  },
];
