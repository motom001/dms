/** Vollexport (#1278 aus vollexport.ts): den Export schreiben – Mappen, Dokumente, Listen, Kalender, Manifest und LIESMICH.md. */
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { type ExportQuelle, type ExportOptionen, FORMATVERSION, EXPORT_TABELLEN } from './vollexport-quelle';
import { type Schreiber, json, namen, ohnePasswoerter, ics, falte, jsonl, csv, bytes, PFAD_MAX } from './vollexport-formate';
import { t } from '../sprache/sprache';
import type { Mappentyp } from '../../../shared/src/model';
import type { MappenAblauf } from '../../../shared/src/ablaufvorlagen';
import { sichererName } from './export';
import { kennungAlsDateiname } from '../../../shared/src/kennungen';
import { LOESCH_SPALTEN, alsZeile } from '../../../shared/src/loeschprotokoll';
import { PRUEFSUMMEN, pruefsummen } from './vollexport-pruefsummen';
import { type ExportLauf, type ExportPfade, ladeMappen, oeffneListen } from './vollexport-lauf';
import { schreibeTabellen, schreibeKontakte } from './vollexport-tabellen';
import { schreibeAblage, typOrdnerMax } from './vollexport-ablage';

type Benutzerdaten = Awaited<ReturnType<ExportQuelle['benutzer']>>;

/* ---------- Export ---------- */

export interface ExportErgebnis {
  ordner: string;
  name: string;
  dateien: number;
  bytes: number;
  mappen: number;
  dokumente: number;
  /** Pfad (relativ zum Export) je Mappe (Ordner) und je Dokument (Datei) – für Übersichten, die darauf verlinken (#396). */
  pfade: ExportPfade;
}

/** Struktur: Mappentypen, Ansichten, Nummernkreise, Pakete, Designs und was die Quelle sonst noch kennt; Benutzer zuletzt. */
async function schreibeStruktur(q: ExportQuelle, w: Schreiber, typen: Mappentyp[], b: Benutzerdaten) {
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
}

/** Daten je Mappentyp: Tabellen, Ablage und Kontakte. */
async function schreibeTypen(l: ExportLauf) {
  const ordnerTyp = namen();
  // Länge der Pfade (#1506): `uebersicht/<typ>.pdf` und `daten/<typ>.jsonl` sind die längsten Dateien je Typ; nach dem
  // Kürzen gleich lautende Namen bekommen „(2)“.
  const dateiNamen = namen({ zeichen: 130 });
  const dateinameMax = l.pfadRest - bytes('uebersicht/.jsonl');
  for (const mappentyp of l.typen) {
    const ms = l.jeTyp.get(mappentyp.id) ?? [];
    // Kennung `paket:schluessel` (#1084): im Dateinamen mit Punkt statt Doppelpunkt (Windows kennt keinen Doppelpunkt).
    const dateiname = dateiNamen(
      sichererName(mappentyp.schluessel ? kennungAlsDateiname(mappentyp.schluessel) : mappentyp.name, 130),
      dateinameMax,
    );
    await schreibeTabellen(l, mappentyp, ms, dateiname);
    await schreibeAblage(l, mappentyp, ms, ordnerTyp(mappentyp.name, typOrdnerMax(l.pfadRest)));
    await schreibeKontakte(l, mappentyp, ms, dateiname);
  }
}

/** Die Listen schließen und die übrigen Daten schreiben; liefert die geplanten Abläufe (für Kalender und Anzahlen). */
async function schreibeDaten(l: ExportLauf, b: Benutzerdaten) {
  const { q, w } = l;
  await w.schliesse(l.listen.verweise);
  await w.schliesse(l.listen.dokumente);
  await w.schliesse(l.listen.notizen);
  await w.schliesse(l.listen.aufgaben);
  const erinnerungen = await q.ablaeufe();
  await w.schreibe('daten/ablaeufe.jsonl', jsonl(erinnerungen));
  await w.schliesse(l.listen.historie);
  await w.schreibe(
    'daten/favoriten.csv',
    csv(
      ['benutzer_id', 'mappe_id'],
      (await q.favoriten()).map((f) => [f.benutzerId, f.mappeId]),
    ),
  );
  await w.schreibe(
    'daten/papierkorb.jsonl',
    jsonl((await q.papierkorb()).map((p) => ({ ...p, werte: ohnePasswoerter(l.typVon.get(p.typId), p.werte) }))),
  );
  await w.schreibe('daten/papierkorb-dokumente.jsonl', jsonl(q.papierkorbDokumente ? await q.papierkorbDokumente() : []));
  if (q.loeschprotokoll) await w.schreibe('daten/loeschprotokoll.csv', csv(LOESCH_SPALTEN, (await q.loeschprotokoll()).map(alsZeile)));
  await w.schreibe('daten/vertretungen.jsonl', jsonl(b.vertretungen));
  return erinnerungen;
}

/** Kalender: Fristen und Aufgaben mit Datum, Erinnerungen. */
async function schreibeKalender(l: ExportLauf, erinnerungen: MappenAblauf[], jetzt: Date) {
  const { titel } = l;
  const tag = (d: string) => d.slice(0, 10).replace(/-/g, '');
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ereignisse = [
    ...l.termine.map((a) => ({ id: a.id, datum: a.datum, titel: `${a.text}${titel(a.mappeId) ? ` – ${titel(a.mappeId)}` : ''}` })),
    ...erinnerungen.map((e) => ({
      id: e.id,
      datum: e.datum,
      titel: `${e.text || t('meldungen.vollexport.erinnerung')}${titel(e.mappeId) ? ` – ${titel(e.mappeId)}` : ''}`,
    })),
  ];
  await l.w.schreibe(
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
}

/** Passwörter (Bitwarden-CSV, nur mit Bestätigung) und technische Protokolle. */
async function schreibeZusaetze(l: ExportLauf) {
  const { opt, w } = l;
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
        l.passwoerter,
      ),
    );
  }
  if (opt.protokolle) await w.schreibe('protokolle/protokoll.jsonl', jsonl(l.q.protokoll()));
}

/** LIESMICH.md, dann das Manifest (zuletzt; es nennt alle anderen Dateien mit Größe und Prüfwert) und SHA256SUMS. */
async function schreibeManifest(l: ExportLauf, erinnerungen: MappenAblauf[], jetzt: Date) {
  const { q, w, opt } = l;
  const anzahlen = {
    mappentypen: l.typen.length,
    mappen: l.alleMappen.size,
    dokumente: l.dokumente,
    verweise: l.zahl.verweise,
    notizen: l.zahl.notizen,
    aufgaben: l.zahl.aufgaben,
    ablaeufe: erinnerungen.length,
    historie: l.zahl.historie,
  };
  await w.schreibe('LIESMICH.md', Buffer.from(opt.liesmich ?? liesmich(q, jetzt, anzahlen, opt), 'utf8'));
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
  await writeFile(join(w.ordner, 'manifest.json'), manifestInhalt);
  // SHA256SUMS (#1195): jede Datei samt manifest.json im Standardformat, für sha256sum -c und Co.
  await writeFile(
    join(w.ordner, PRUEFSUMMEN),
    pruefsummen([...w.dateien, { pfad: 'manifest.json', sha256: createHash('sha256').update(manifestInhalt).digest('hex') }]),
  );
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
  const { typen, typVon, alleMappen, jeTyp } = await ladeMappen(q);
  const titel = (id: string | null | undefined) => (id ? (alleMappen.get(id)?.titel ?? '') : '');
  let fertig = 0;
  const gesamt = alleMappen.size;
  let schritt = 0;
  const abschluss = () => fortschritt(++schritt, 3, 'abschluss');
  fortschritt(0, gesamt, 'mappen');

  const b = await q.benutzer();
  await schreibeStruktur(q, w, typen, b);
  const l: ExportLauf = {
    q,
    w,
    opt,
    typen,
    typVon,
    alleMappen,
    jeTyp,
    titel,
    quelle: { typen: typVon, titel },
    weiter: () => fortschritt(++fertig, gesamt, 'mappen'),
    listen: await oeffneListen(w),
    zahl: { verweise: 0, notizen: 0, aufgaben: 0, historie: 0 },
    dokumente: 0,
    termine: [],
    passwoerter: [],
    pfade: { mappen: new Map(), dokumente: new Map() },
    pfadRest: PFAD_MAX - bytes(`${opt.wurzel ?? name}/`),
  };
  await schreibeTypen(l);
  const erinnerungen = await schreibeDaten(l, b);
  abschluss();

  await schreibeKalender(l, erinnerungen, jetzt);
  await schreibeZusaetze(l);
  abschluss();

  await schreibeManifest(l, erinnerungen, jetzt);
  abschluss();
  return { ordner, name, dateien: w.dateien.length + 1, bytes: w.bytes, mappen: alleMappen.size, dokumente: l.dokumente, pfade: l.pfade };
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

${t('meldungen.vollexport.liesmich-windows')}
## Weiterverarbeiten

- **Excel/LibreOffice:** \`daten/<typ>.xlsx\` öffnen – oder \`.csv\` (Komma, UTF-8).
- **Python:** \`pandas.read_csv('daten/rechnung.csv')\` oder Zeile für Zeile \`json.loads\` aus \`.jsonl\`.
- **Anderes Ablago:** \`ablage/\` enthält alle Dateien in lesbaren Ordnern; Metadaten in \`mappe.json\`.
`;
}
