/** Vollexport (#1278 aus vollexport.ts): den Export schreiben – Mappen, Dokumente, Listen, Kalender, Manifest und LIESMICH.md. */
import { join } from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { type ExportQuelle, type ExportOptionen, FORMATVERSION, EXPORT_TABELLEN } from './vollexport-quelle';
import { Schreiber, json, namen, BOM, csvZeile, zelle, ohnePasswoerter, Zeilen, ics, falte, jsonl, csv } from './vollexport-formate';
import { t } from '../sprache/sprache';
import { type Mappe, mehrereZiele, istLeer, formatiere, verweiseVon, auswahlText } from '../../../shared/src/model';
import { kernTyp } from '../../../shared/src/dateiumwandlung';
import { sichererName, exportSpalten, zeile, spaltenKopf } from './export';
import { kennungAlsDateiname } from '../../../shared/src/kennungen';
import { wertfelder } from '../../../shared/src/tabelle';
import { aufbewahrenBis } from '../../../shared/src/archiv';
import type { Zelle } from '../formate/xlsx';
import { arbeite } from '../arbeit';
import { zeitzone } from '../../../shared/src/region';
import { LOESCH_SPALTEN, alsZeile } from '../../../shared/src/loeschprotokoll';
import { PRUEFSUMMEN, pruefsummen } from './vollexport-pruefsummen';

/* ---------- Export ---------- */

/** Mappen je Zugriff beim Export (#367) und Dokumente je Zugriff auf die Volltexte. */
const EXPORT_PAKET = 200;
const VOLLTEXT_PAKET = 100;
function gruppiere<T>(liste: T[], schluessel: (x: T) => string): Map<string, T[]> {
  const r = new Map<string, T[]>();
  for (const x of liste) {
    const k = schluessel(x);
    const l = r.get(k);
    if (l) l.push(x);
    else r.set(k, [x]);
  }
  return r;
}

export interface ExportErgebnis {
  ordner: string;
  name: string;
  dateien: number;
  bytes: number;
  mappen: number;
  dokumente: number;
  /** Pfad (relativ zum Export) je Mappe (Ordner) und je Dokument (Datei) – für Übersichten, die darauf verlinken (#396). */
  pfade: { mappen: Map<string, string>; dokumente: Map<string, string> };
}

export async function schreibeExport(
  q: ExportQuelle,
  w: Schreiber,
  name: string,
  opt: ExportOptionen,
  fortschritt: (fertig: number, gesamt: number, phase?: string) => void,
  jetzt: Date,
): Promise<ExportErgebnis> {
  const ordner = w.ordner;
  const typen = await q.typen();
  const typVon = new Map(typen.map((t) => [t.id, t] as const));
  const alleMappen = new Map<string, Mappe>();
  const jeTyp = new Map<string, Mappe[]>();
  for (const t of typen) {
    const ms = await q.mappen(t.id);
    jeTyp.set(t.id, ms);
    for (const m of ms) alleMappen.set(m.id, m);
  }
  const titel = (id: string | null | undefined) => (id ? (alleMappen.get(id)?.titel ?? '') : '');
  const quelle = { typen: typVon, titel };
  let fertig = 0;
  const gesamt = alleMappen.size;
  const weiter = () => fortschritt(++fertig, gesamt, 'mappen');
  let schritt = 0;
  const abschluss = () => fortschritt(++schritt, 3, 'abschluss');
  fortschritt(0, gesamt, 'mappen');

  // Struktur
  const b = await q.benutzer();
  await w.schreibe('struktur/mappentypen.json', json(typen));
  await w.schreibe('struktur/sichten.json', json(await q.sichten()));
  await w.schreibe('struktur/nummernkreise.json', json(await q.nummernkreise()));
  await w.schreibe('struktur/pakete.json', json(await q.pakete()));
  await w.schreibe('struktur/designs.json', json(await q.designs()));
  if (q.synonyme) await w.schreibe('struktur/synonyme.json', json(await q.synonyme()));
  if (q.region) await w.schreibe('struktur/region.json', json(await q.region()));
  if (q.merkmale) await w.schreibe('struktur/merkmale.json', json(await q.merkmale()));
  if (q.organisation) await w.schreibe('struktur/organisation.json', json(await q.organisation()));
  if (q.automatisierungen) await w.schreibe('struktur/automatisierungen.json', json(await q.automatisierungen()));
  if (q.ablaufvorlagen) await w.schreibe('struktur/ablaufvorlagen.json', json(await q.ablaufvorlagen()));
  if (q.notfallkontakte) {
    const k = await q.notfallkontakte();
    if (k.length) await w.schreibe('struktur/notfallkontakte.json', json(k));
  }
  if (q.entdecken) {
    const e = await q.entdecken();
    if (e) await w.schreibe('struktur/entdecken.json', json(e));
  }
  if (q.fassungen) await w.schreibe('struktur/fassungen.json', json(await q.fassungen()));
  await w.schreibe('struktur/benutzer.json', json(b.benutzer));

  // Daten je Mappentyp
  const ordnerTyp = namen();
  // Listen über alle Mappen (#746): gleich beim Durchgang Zeile für Zeile schreiben, nicht erst sammeln.
  // Ins Manifest kommen sie unten in der bisherigen Reihenfolge.
  const verweise = await w.oeffne('daten/verweise.csv');
  await verweise.schreibe(BOM + csvZeile(['quelle_id', 'feld', 'feld_schluessel', 'ziel_id', 'ziel_titel']));
  const dokListe = await w.oeffne('daten/dokumente.csv');
  await dokListe.schreibe(
    BOM +
      csvZeile([
        'dokument_id',
        'mappe_id',
        'register',
        'dateiname',
        'typ',
        'groesse',
        'sha256',
        'erstellt',
        'erstellt_von',
        'version',
        'stand',
        'pfad',
        'fassung',
        'archivfassung',
        'anlage_zu',
        'anlage_nr',
        'eingang_nr',
        'original_email',
      ]),
  );
  const notizDatei = await w.oeffne('daten/notizen.jsonl');
  const aufgabeDatei = await w.oeffne('daten/aufgaben.jsonl');
  const historieDatei = await w.oeffne('daten/historie.jsonl');
  const zahl = { verweise: 0, notizen: 0, aufgaben: 0, historie: 0 };
  /** Für den Kalender: nur offene Aufgaben mit Datum. */
  const termine: Array<{ id: string; datum: string; text: string; mappeId: string }> = [];
  const passwoerter: string[][] = [];
  const pfade: ExportErgebnis['pfade'] = { mappen: new Map(), dokumente: new Map() };
  let dokumente = 0;
  /** Umgewandelte Fassung (#577) neben das Original: `<Datei>.fassung.pdf` (bzw. .png, .jpg); liefert ihren Pfad. */
  const fassung = async (d: { mime: string; sha256: string }, rel: string): Promise<string> => {
    if (!q.fassung || kernTyp(d.mime)) return '';
    const f = await q.fassung(d.sha256).catch(() => null);
    if (!f) return '';
    const frel = `${rel}.fassung.${f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : 'jpg'}`;
    await w.schreibe(frel, f.inhalt);
    return frel;
  };
  /** Archivfassung (#631) neben das Original: `<Datei>.pdfa.pdf`; ist das Original schon PDF/A: „original“. */
  const archiv = async (d: { sha256: string }, rel: string): Promise<string> => {
    if (!q.archivfassung) return '';
    const a = await q.archivfassung(d.sha256).catch(() => null);
    if (!a) return '';
    if ('imOriginal' in a) return 'original';
    if (!a.inhalt) return '';
    await w.schreibe(`${rel}.pdfa.pdf`, a.inhalt);
    return `${rel}.pdfa.pdf`;
  };
  for (const mappentyp of typen) {
    const ms = jeTyp.get(mappentyp.id) ?? [];
    // Kennung `paket:schluessel` (#1084): im Dateinamen mit Punkt statt Doppelpunkt (Windows kennt keinen Doppelpunkt).
    const dateiname = sichererName(mappentyp.schluessel ? kennungAlsDateiname(mappentyp.schluessel) : mappentyp.name, 130);
    // CSV und JSON Lines: alle Felder, Verweise als Id und Titel.
    const kopf = [
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
    const typVonMappe = (id: string) => {
      const x = typVon.get(alleMappen.get(id)?.typId ?? '');
      return x ? (x.schluessel ?? x.name) : '';
    };
    const csvZeileVon = (m: Mappe) => [
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
    // CSV und JSON Lines Zeile für Zeile als Strom (#746).
    const c = await w.oeffne(`daten/${dateiname}.csv`);
    await c.schreibe(BOM + csvZeile(kopf));
    for (const m of ms) await c.schreibe(csvZeile(csvZeileVon(m)));
    await w.schliesse(c);
    const j = await w.oeffne(`daten/${dateiname}.jsonl`);
    for (const m of ms) await j.schreibe(`${JSON.stringify({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })}\n`);
    await w.schliesse(j);
    // Excel wie beim normalen Export (#542) im Arbeiter: Zeilen mit Pausen aufbereiten und als Strom in eine Arbeitsdatei
    // schreiben, die der Arbeiter liest; sie liegt nur kurz im Export-Ordner, nur für den Dienstbenutzer lesbar (0600),
    // und wird danach gelöscht (bei einem Abbruch geht sie mit dem Ordner).
    const spalten = exportSpalten([mappentyp], 'alle');
    const arbeitsdatei = join(ordner, `.tabelle-${dateiname}.jsonl`);
    const tab = new Zeilen('', arbeitsdatei, 0o600);
    try {
      for (const m of ms)
        await tab.schreibe(
          `${JSON.stringify(zeile({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }, spalten, quelle).werte satisfies Zelle[])}\n`,
        );
      await tab.ende();
      await w.schreibe(
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
    if (ms.length)
      await w.schreibe(`uebersicht/${dateiname}.pdf`, () =>
        q.pdf(
          mappentyp.name,
          ms.map((m) => ({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })),
          mappentyp,
          true,
        ),
      );

    // Ablage: je Mappe ein Ordner. Dokumente, Volltexte, Versionen, Notizen, Aufgaben und Historie
    // je Paket von Mappen in einem Zugriff (#367) – nicht je Mappe oder Dokument.
    const tOrdner = ordnerTyp(mappentyp.name);
    const mOrdner = namen();
    for (let i = 0; i < ms.length; i += EXPORT_PAKET) {
      const paket = ms.slice(i, i + EXPORT_PAKET);
      const ids = paket.map((m) => m.id);
      const [dokJe, notizJe, aufgabeJe, historieJe] = await Promise.all([
        q.dokumente(ids).then((x) => gruppiere(x, (d) => d.mappeId)),
        q.notizen(ids).then((x) => gruppiere(x, (n) => n.mappeId)),
        q.aufgaben(ids).then((x) => gruppiere(x, (a) => a.mappeId)),
        q.historie(ids).then((x) => gruppiere(x, (h) => h.mappeId)),
      ]);
      const dokIds = [...dokJe.values()].flat().map((d) => d.id);
      const versionJe = gruppiere(await q.versionen(dokIds), (v) => v.dokumentId);
      // Volltexte in kleineren Paketen: sie können je Dokument groß sein.
      const texte = new Map<string, string>();
      for (let j = 0; j < dokIds.length; j += VOLLTEXT_PAKET)
        for (const [k, v] of await q.volltexte(dokIds.slice(j, j + VOLLTEXT_PAKET))) texte.set(k, v);
      for (const m of paket) {
        const pfad = `ablage/${tOrdner}/${mOrdner(`${m.titel || t('meldungen.vollexport.ohne-titel')} [${m.id.slice(0, 8)}]`)}`;
        pfade.mappen.set(m.id, pfad);
        await w.schreibe(
          `${pfad}/mappe.json`,
          json({
            ...m,
            werte: ohnePasswoerter(mappentyp, m.werte),
            typ: mappentyp.name,
            ...(mappentyp.archiv ? { aufbewahrenBis: aufbewahrenBis(mappentyp.archiv, m) } : {}),
          }),
        );
        await w.schreibe(`${pfad}/mappe.pdf`, () =>
          q.pdf(m.titel || mappentyp.name, [{ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }], mappentyp, false),
        );
        for (const v of verweiseVon(mappentyp, m.werte)) {
          await verweise.schreibe(
            csvZeile([m.id, mappentyp.felder.find((f) => f.key === v.feldKey)?.label ?? v.feldKey, v.feldKey, v.zielId, titel(v.zielId)]),
          );
          zahl.verweise++;
        }
        const dateiNamen = new Map<string, ReturnType<typeof namen>>();
        for (const d of dokJe.get(m.id) ?? []) {
          const reg = mappentyp.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey;
          const regName = sichererName(reg, 60);
          if (!dateiNamen.has(regName)) dateiNamen.set(regName, namen());
          const dn = dateiNamen.get(regName)!(d.name);
          const rel = `${pfad}/${regName}/${dn}`;
          await w.schreibe(rel, () => q.datei(d.sha256));
          pfade.dokumente.set(d.id, rel);
          const text = texte.get(d.id);
          if (text) await w.schreibe(`${rel}.txt`, Buffer.from(text, 'utf8'));
          // Anlagen (#998): Hauptdokument und Nummer am Ende der Zeile – ältere Leser übergehen die Spalten.
          const anlage = [
            d.anlageZu ?? '',
            d.anlageZu ? String(d.anlageNr ?? 1) : '',
            // E-Mail-Postfach (#999): Platz in der Eingangsreihenfolge der Post und Kennzeichen „Original-E-Mail“ (ja/leer).
            d.eingangNr ? String(d.eingangNr) : '',
            d.originalEmail ? 'ja' : '',
          ];
          await dokListe.schreibe(
            csvZeile([
              d.id,
              m.id,
              d.registerKey,
              d.name,
              d.mime,
              String(d.groesse),
              d.sha256,
              d.erstellt,
              d.erstelltVon ?? '',
              String(d.version ?? 1),
              'aktuell',
              rel,
              await fassung(d, rel),
              await archiv(d, rel),
              ...anlage,
            ]),
          );
          dokumente++;
          const vn = namen();
          for (const v of versionJe.get(d.id) ?? []) {
            const vrel = `${pfad}/${regName}/Versionen/${vn(`v${v.nummer} ${v.name}`)}`;
            await w.schreibe(vrel, () => q.datei(v.sha256));
            await dokListe.schreibe(
              csvZeile([
                d.id,
                m.id,
                d.registerKey,
                v.name,
                v.mime,
                String(v.groesse),
                v.sha256,
                v.erstellt,
                v.erstelltVon ?? '',
                String(v.nummer),
                'aelter',
                vrel,
                await fassung(v, vrel),
                await archiv(v, vrel),
                ...anlage,
              ]),
            );
          }
        }
        for (const n of notizJe.get(m.id) ?? []) {
          await notizDatei.schreibe(`${JSON.stringify(n)}\n`);
          zahl.notizen++;
        }
        for (const a of aufgabeJe.get(m.id) ?? []) {
          await aufgabeDatei.schreibe(`${JSON.stringify(a)}\n`);
          zahl.aufgaben++;
          if (a.datum && !a.erledigt) termine.push({ id: a.id, datum: a.datum, text: a.text, mappeId: a.mappeId });
        }
        for (const h of historieJe.get(m.id) ?? []) {
          await historieDatei.schreibe(`${JSON.stringify(h)}\n`);
          zahl.historie++;
        }
        if (opt.passwoerter)
          for (const f of mappentyp.felder.filter(
            (x) => x.typ === 'passwort' && typeof m.werte[x.key] === 'string' && m.werte[x.key] !== '',
          )) {
            const klar = q.passwort(m.werte[f.key]);
            if (klar === null) continue;
            const nutzer = mappentyp.felder.find(
              (x) => x.typ === 'text' && /benutzer|login|user|e-?mail|konto/i.test(`${x.key} ${x.label}`),
            );
            const url = mappentyp.felder.find((x) => x.typ === 'text' && /url|adresse|web|seite/i.test(`${x.key} ${x.label}`));
            passwoerter.push([
              mappentyp.name,
              '',
              'login',
              `${m.titel || t('meldungen.vollexport.ohne-titel')}${mappentyp.felder.filter((x) => x.typ === 'passwort').length > 1 ? ` – ${f.label}` : ''}`,
              '',
              '',
              '0',
              url ? auswahlText(m.werte[url.key]) : '',
              nutzer ? auswahlText(m.werte[nutzer.key]) : '',
              klar,
              '',
            ]);
          }
        weiter();
      }
    }

    // vCard (#254): nur mit bestätigter Zuordnung
    const k = opt.kontakte?.[mappentyp.id];
    if (k && ms.length) {
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
      await w.schreibe(`kontakte/${dateiname}.vcf`, Buffer.from(v, 'utf8'));
    }
  }

  await w.schliesse(verweise);
  await w.schliesse(dokListe);
  await w.schliesse(notizDatei);
  await w.schliesse(aufgabeDatei);
  const erinnerungen = await q.ablaeufe();
  await w.schreibe('daten/ablaeufe.jsonl', jsonl(erinnerungen));
  await w.schliesse(historieDatei);
  await w.schreibe(
    'daten/favoriten.csv',
    csv(
      ['benutzer_id', 'mappe_id'],
      (await q.favoriten()).map((f) => [f.benutzerId, f.mappeId]),
    ),
  );
  await w.schreibe(
    'daten/papierkorb.jsonl',
    jsonl((await q.papierkorb()).map((p) => ({ ...p, werte: ohnePasswoerter(typVon.get(p.typId), p.werte) }))),
  );
  await w.schreibe('daten/papierkorb-dokumente.jsonl', jsonl(q.papierkorbDokumente ? await q.papierkorbDokumente() : []));
  if (q.loeschprotokoll) await w.schreibe('daten/loeschprotokoll.csv', csv(LOESCH_SPALTEN, (await q.loeschprotokoll()).map(alsZeile)));
  await w.schreibe('daten/vertretungen.jsonl', jsonl(b.vertretungen));
  abschluss();

  // Kalender: Fristen und Aufgaben mit Datum, Erinnerungen
  const tag = (d: string) => d.slice(0, 10).replace(/-/g, '');
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ereignisse = [
    ...termine.map((a) => ({ id: a.id, datum: a.datum, titel: `${a.text}${titel(a.mappeId) ? ` – ${titel(a.mappeId)}` : ''}` })),
    ...erinnerungen.map((e) => ({
      id: e.id,
      datum: e.datum,
      titel: `${e.text || t('meldungen.vollexport.erinnerung')}${titel(e.mappeId) ? ` – ${titel(e.mappeId)}` : ''}`,
    })),
  ];
  await w.schreibe(
    'kalender/fristen.ics',
    Buffer.from(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//DMS//Vollexport//DE',
        'CALSCALE:GREGORIAN',
        ...ereignisse.flatMap((e) => [
          'BEGIN:VEVENT',
          `UID:${e.id}@dms`,
          `DTSTAMP:${stempel}`,
          `DTSTART;VALUE=DATE:${tag(e.datum)}`,
          `SUMMARY:${ics(e.titel)}`,
          'END:VEVENT',
        ]),
        'END:VCALENDAR',
      ]
        .map(falte)
        .join('\r\n') + '\r\n',
      'utf8',
    ),
  );

  if (opt.passwoerter) {
    await w.schreibe(
      'passwoerter.csv',
      csv(
        [
          'folder',
          'favorite',
          'type',
          'name',
          'notes',
          'fields',
          'reprompt',
          'login_uri',
          'login_username',
          'login_password',
          'login_totp',
        ],
        passwoerter,
      ),
    );
  }
  if (opt.protokolle) await w.schreibe('protokolle/protokoll.jsonl', jsonl(q.protokoll()));
  abschluss();

  const anzahlen = {
    mappentypen: typen.length,
    mappen: alleMappen.size,
    dokumente,
    verweise: zahl.verweise,
    notizen: zahl.notizen,
    aufgaben: zahl.aufgaben,
    ablaeufe: erinnerungen.length,
    historie: zahl.historie,
  };
  await w.schreibe('LIESMICH.md', Buffer.from(opt.liesmich ?? liesmich(q, jetzt, anzahlen, opt), 'utf8'));
  // Manifest zuletzt; es nennt alle anderen Dateien mit Größe und Prüfwert.
  const manifest = {
    format: 'dms-vollexport',
    formatversion: FORMATVERSION,
    erstellt: jetzt.toISOString(),
    dms: q.version,
    mandant: q.mandant,
    anzahlen,
    passwoerter: !!opt.passwoerter,
    protokolle: !!opt.protokolle,
    ...(opt.zweck ? { zweck: opt.zweck } : {}),
    tabellen: EXPORT_TABELLEN,
    dateien: w.dateien,
  };
  const manifestInhalt = json(manifest);
  await writeFile(join(ordner, 'manifest.json'), manifestInhalt);
  // SHA256SUMS (#1195): jede Datei samt manifest.json im Standardformat, für sha256sum -c und Co.
  await writeFile(
    join(ordner, PRUEFSUMMEN),
    pruefsummen([...w.dateien, { pfad: 'manifest.json', sha256: createHash('sha256').update(manifestInhalt).digest('hex') }]),
  );
  abschluss();
  return { ordner, name, dateien: w.dateien.length + 1, bytes: w.bytes, mappen: alleMappen.size, dokumente, pfade };
}

function liesmich(q: ExportQuelle, jetzt: Date, n: Record<string, number>, opt: ExportOptionen) {
  return `# Ablago – Vollexport

Erstellt am ${jetzt.toISOString()} mit Ablago ${q.version} (Formatversion ${FORMATVERSION}), Haushalt „${q.mandant}“.
${n.mappen} Mappen in ${n.mappentypen} Mappentypen, ${n.dokumente} Dokumente.

Alles hier lässt sich ohne Ablago lesen. **Der Export ist unverschlüsselt** – bewahre ihn sicher auf.${opt.passwoerter ? '\n\n**Achtung: passwoerter.csv enthält Passwörter im Klartext.** Importiere sie in einen Passwortmanager (Bitwarden-CSV) und lösche die Datei danach.' : ''}

## Aufbau

| Ordner/Datei | Inhalt |
| --- | --- |
| \`manifest.json\` | Formatversion, Anzahlen, Größe und SHA-256 jeder Datei, wo jede Tabelle steht |
| \`SHA256SUMS\` | SHA-256 jeder Datei (auch \`manifest.json\`) im Standardformat zum Prüfen, siehe unten |
| \`struktur/\` | Mappentypen (Felder, Register, Titelvorlagen, Berechtigungen, Archiv), Ansichten, Nummernkreise, Designs, Benutzer (ohne Passwörter), Notfallkontakte (\`notfallkontakte.json\`, falls vorhanden); \`fassungen.json\` = Fassungen der Werkbank (wer wann was geändert hat, samt Löschvermerken, ohne Geheimnisse) |
| \`daten/<typ>.csv\` | je Mappentyp eine Tabelle: eine Zeile je Mappe, eine Spalte je Feldschlüssel; Verweise als Id und \`_titel\`, bei mehreren Zieltypen dazu \`_typ\` |
| \`daten/<typ>.jsonl\` | dasselbe verlustfrei als JSON Lines (eine Mappe je Zeile) |
| \`daten/<typ>.xlsx\` | dasselbe für Excel/LibreOffice, mit Spaltenüberschriften |
| \`daten/verweise.csv\` | Mappe → Feld → Mappe |
| \`daten/dokumente.csv\` | alle Dokumente und ihre älteren Versionen mit Pfad im Export; \`anlage_zu\`/\`anlage_nr\` = Hauptdokument und Nummer einer Anlage (leer bei eigenen Dokumenten); \`eingang_nr\` = Platz in der Reihenfolge einer E-Mail, \`original_email\` = „ja“ bei der abgeholten E-Mail selbst |
| \`daten/*.jsonl\` | Notizen, Aufgaben (mit Fristen), geplante Abläufe (Erinnerungen, Wiedervorlagen), Historie, Papierkorb, Vertretungen; \`favoriten.csv\` |
| \`ablage/<Typ>/<Titel> [Id]/\` | je Mappe \`mappe.json\`, \`mappe.pdf\` und die Dokumente im Original je Register; \`.txt\` = erkannter Text; \`.fassung.pdf\` (bzw. \`.png\`, \`.jpg\`) = umgewandelte Fassung eines Pakets für Dateitypen wie TIFF; \`.pdfa.pdf\` = Archivfassung (PDF/A) eines Pakets, durchsuchbar, zum langfristigen Aufbewahren; \`Versionen/\` = ältere Versionen |
| \`uebersicht/<typ>.pdf\` | Übersicht je Mappentyp mit allen Mappen |
| \`kalender/fristen.ics\` | offene Fristen, Aufgaben mit Datum und geplante Abläufe (iCalendar) |
| \`kontakte/<typ>.vcf\` | Kontakte als vCard 4.0 (nur, wenn beim Export zugeordnet) |

## Formate

- Text: UTF-8. CSV nach RFC 4180 mit Komma und BOM (Excel erkennt so UTF-8).
- Datum: \`JJJJ-MM-TT\`, Zeitpunkte ISO 8601 in UTC. Zahlen mit Punkt. Beträge: Spalte \`<feld>\` und \`<feld>_waehrung\`.
- Zeiträume nach ISO 8601 (\`P3M\` = 3 Monate, \`P14D\`, \`P2W\`, \`P1Y\`), in JSON als \`{ "anzahl": 3, "einheit": "monate" }\`. Prozent als Zahl (\`19\` für 19 %).
- Ids: UUID. Mehrfachwerte in CSV mit \` | \` getrennt; in JSON als Liste.
- Zusammengesetzte Felder: in \`<feld>\` der gespeicherte Schlüssel (Verweise als Id, Datum als \`JJJJ-MM-TT\`), in \`<feld>_text\` der Text mit den Titeln.
- Passwortfelder stehen nie in den Daten (nur „gesetzt“).

## Vollständig?

Im Ordner des entpackten Exports (dort, wo diese Datei liegt) prüft ein Befehl jede Datei gegen \`SHA256SUMS\`:

- **Linux:** \`sha256sum -c --quiet SHA256SUMS\` – ohne Ausgabe ist alles in Ordnung.
- **macOS:** \`shasum -a 256 -c --quiet SHA256SUMS\` – ebenso.
- **Windows (PowerShell):** \`Get-Content SHA256SUMS | ForEach-Object { $h, $p = $_ -split '  ', 2; if ((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ne $h) { "abweichend: $p" } }\` – ohne Ausgabe ist alles in Ordnung.

Die ZIP-Datei selbst prüfst du vor dem Entpacken gegen die SHA-256, die Ablago in der Werkbank unter Vollexport anzeigt: \`sha256sum <datei>.zip\`, \`shasum -a 256 <datei>.zip\` bzw. \`Get-FileHash <datei>.zip -Algorithm SHA256\`.

Dasselbe mit Python, über \`manifest.json\`:

\`\`\`python
import hashlib, json, pathlib
basis = pathlib.Path(__file__).parent if '__file__' in dir() else pathlib.Path('.')
m = json.loads((basis / 'manifest.json').read_text('utf-8'))
fehler = [d['pfad'] for d in m['dateien'] if hashlib.sha256((basis / d['pfad']).read_bytes()).hexdigest() != d['sha256']]
print('alles in Ordnung' if not fehler else f'abweichend: {fehler}')
\`\`\`

## Weiterverarbeiten

- **Excel/LibreOffice:** \`daten/<typ>.xlsx\` öffnen – oder \`.csv\` (Komma, UTF-8).
- **Python:** \`pandas.read_csv('daten/rechnung.csv')\` oder Zeile für Zeile \`json.loads\` aus \`.jsonl\`.
- **Anderes Ablago:** \`ablage/\` enthält alle Dateien in lesbaren Ordnern; Metadaten in \`mappe.json\`.
`;
}
