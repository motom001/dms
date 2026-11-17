/**
 * Vollexport je Mappentyp (#1278, Schritt 6b-2; vorher Teil von `schreibeExport`): Tabelle als CSV, JSON Lines und
 * Excel, Übersicht als PDF und Kontakte als vCard.
 */
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { t } from '../sprache/sprache';
import { type Mappe, type Mappentyp, mehrereZiele, istLeer, formatiere, auswahlText } from '../../../shared/src/model';
import { wertfelder } from '../../../shared/src/tabelle';
import { aufbewahrenBis } from '../../../shared/src/archiv';
import { zeitzone } from '../../../shared/src/region';
import type { Zelle } from '../formate/xlsx';
import { arbeite } from '../arbeit';
import { exportSpalten, zeile, spaltenKopf } from './export';
import { BOM, csvZeile, zelle, ohnePasswoerter, Zeilen, ics, falte } from './vollexport-formate';
import type { ExportLauf } from './vollexport-lauf';

/** Kopf der CSV: alle Felder, Verweise als Id und Titel. */
function kopfVon(mappentyp: Mappentyp): string[] {
  return [
    'id',
    'titel',
    'angelegt',
    'angelegt_von',
    'geaendert',
    'geaendert_von',
    ...(mappentyp.archiv ? ['aufbewahren_bis'] : []),
    // Verweise mit mehreren Zieltypen (#1036): dazu der Mappentyp jeder Mappe (Kennung, sonst Name).
    // Tabellen (#1030) haben keinen Wert – keine Spalte.
    // Zusammengesetzt (#1050): der gespeicherte Schlüssel (Verweise als Id) und daneben der Text mit Titeln.
    ...wertfelder(mappentyp.felder).flatMap((f) =>
      f.typ === 'referenz'
        ? [f.key, `${f.key}_titel`, ...(mehrereZiele(f) ? [`${f.key}_typ`] : [])]
        : f.typ === 'betrag'
          ? [f.key, `${f.key}_waehrung`]
          : f.typ === 'zusammengesetzt'
            ? [f.key, `${f.key}_text`]
            : [f.key],
    ),
  ];
}

/** Eine Zeile der CSV zu einer Mappe. */
function csvZeileVon(l: ExportLauf, mappentyp: Mappentyp, m: Mappe): string[] {
  const { titel } = l;
  const typVonMappe = (id: string) => {
    const x = l.typVon.get(l.alleMappen.get(id)?.typId ?? '');
    return x ? (x.schluessel ?? x.name) : '';
  };
  return [
    m.id,
    m.titel ?? '',
    m.erstellt,
    m.erstelltVon ?? '',
    m.geaendert,
    m.geaendertVon ?? '',
    ...(mappentyp.archiv ? [aufbewahrenBis(mappentyp.archiv, m) ?? ''] : []),
    ...wertfelder(mappentyp.felder).flatMap((f) => {
      const v = m.werte[f.key];
      if (f.typ === 'passwort') return [istLeer(v) ? '' : '(gesetzt)'];
      if (f.typ === 'referenz') {
        const ids = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
        return [ids.join(' | '), ids.map(titel).join(' | '), ...(mehrereZiele(f) ? [ids.map(typVonMappe).join(' | ')] : [])];
      }
      if (f.typ === 'betrag') {
        const x = v && typeof v === 'object' ? (v as { betrag?: unknown; waehrung?: unknown }) : {};
        return [x.betrag == null ? '' : String(x.betrag), String(x.waehrung ?? '')];
      }
      if (f.typ === 'zusammengesetzt') return [zelle(v), formatiere(f, v, titel, { felder: mappentyp.felder, werte: m.werte })];
      return [zelle(v)];
    }),
  ];
}

/**
 * Excel wie beim normalen Export (#542) im Arbeiter: Zeilen mit Pausen aufbereiten und als Strom in eine Arbeitsdatei
 * schreiben, die der Arbeiter liest; sie liegt nur kurz im Export-Ordner, nur für den Dienstbenutzer lesbar (0600),
 * und wird danach gelöscht (bei einem Abbruch geht sie mit dem Ordner).
 */
async function schreibeExcel(l: ExportLauf, mappentyp: Mappentyp, ms: Mappe[], dateiname: string) {
  const spalten = exportSpalten([mappentyp], 'alle');
  const arbeitsdatei = join(l.w.ordner, `.tabelle-${dateiname}.jsonl`);
  const tab = new Zeilen('', arbeitsdatei, 0o600);
  try {
    for (const m of ms)
      await tab.schreibe(
        `${JSON.stringify(zeile({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }, spalten, l.quelle).werte satisfies Zelle[])}\n`,
      );
    await tab.ende();
    await l.w.schreibe(
      `daten/${dateiname}.xlsx`,
      await arbeite('exportTabelleAusDatei', {
        titel: mappentyp.name,
        kopf: spalten.map((k) => spaltenKopf(k, [mappentyp])),
        datei: arbeitsdatei,
        zeitzone: zeitzone(),
      }),
    );
  } finally {
    tab.abbrechen();
    await rm(arbeitsdatei, { force: true });
  }
}

/** Tabelle eines Mappentyps als CSV, JSON Lines (Zeile für Zeile als Strom, #746) und Excel; dazu die Übersicht als PDF. */
export async function schreibeTabellen(l: ExportLauf, mappentyp: Mappentyp, ms: Mappe[], dateiname: string) {
  const { w, q } = l;
  const c = await w.oeffne(`daten/${dateiname}.csv`);
  await c.schreibe(BOM + csvZeile(kopfVon(mappentyp)));
  for (const m of ms) await c.schreibe(csvZeile(csvZeileVon(l, mappentyp, m)));
  await w.schliesse(c);
  const j = await w.oeffne(`daten/${dateiname}.jsonl`);
  for (const m of ms) await j.schreibe(`${JSON.stringify({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })}\n`);
  await w.schliesse(j);
  await schreibeExcel(l, mappentyp, ms, dateiname);
  if (ms.length)
    await w.schreibe(`uebersicht/${dateiname}.pdf`, () =>
      q.pdf(
        mappentyp.name,
        ms.map((m) => ({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })),
        mappentyp,
        true,
      ),
    );
}

/** vCard (#254): nur mit bestätigter Zuordnung. */
export async function schreibeKontakte(l: ExportLauf, mappentyp: Mappentyp, ms: Mappe[], dateiname: string) {
  const k = l.opt.kontakte?.[mappentyp.id];
  if (!k || !ms.length) return;
  const wert = (m: Mappe, key?: string) => (key ? auswahlText(m.werte[key]) : '');
  const v =
    ms
      .map((m) =>
        [
          'BEGIN:VCARD',
          'VERSION:4.0',
          `FN:${ics(wert(m, k.name) || m.titel || '')}`,
          ...(wert(m, k.firma) ? [`ORG:${ics(wert(m, k.firma))}`] : []),
          ...(wert(m, k.email) ? [`EMAIL:${ics(wert(m, k.email))}`] : []),
          ...(wert(m, k.telefon) ? [`TEL:${ics(wert(m, k.telefon))}`] : []),
          ...(wert(m, k.adresse) ? [`ADR:;;${ics(wert(m, k.adresse))};;;;`] : []),
          ...(wert(m, k.notiz) ? [`NOTE:${ics(wert(m, k.notiz))}`] : []),
          t('meldungen.vollexport.uid-urn-uuid', { id: m.id }),
          'END:VCARD',
        ]
          .map(falte)
          .join('\r\n'),
      )
      .join('\r\n') + '\r\n';
  await l.w.schreibe(`kontakte/${dateiname}.vcf`, Buffer.from(v, 'utf8'));
}
