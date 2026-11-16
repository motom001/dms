/**
 * Benutzte Funktionen und die Dateien des Pakets (#1278, Schritt 6a; vorher Teil von `baue`): Manifest, Inhalt,
 * README, CHANGELOG, LICENSE und die Erwartung für die Tests der Registry.
 */
import { stringify } from 'yaml';
import { vergleicheVersion } from '../../../../shared/src/pakete';
import { type PaketErstellenEingabe } from '../../../../shared/src/paketerstellung';
import { t } from '../../sprache/sprache';
import { LIZENZTEXTE } from '../lizenztexte';
import { aenderungsText, type Bau, type ErstellenDaten, zelle } from './bau-hilfen';
import { type PaketTypDaten } from './bau-typen';
import { type MindestFunktion } from './mindestversion';

type Felder = Array<Record<string, unknown>>;
type Datei = { name: string; daten: Buffer };

/** Was das Paket nutzt – daraus folgt die nötige Ablago-Version (#651). */
export function genutzteFunktionen(x: {
  dmsVerweise: boolean;
  beispielVerweise: boolean;
  dokumente: number;
  fremdeTypen: boolean;
  wortlisten: number;
  automatisierungen: number;
  paketTypen: PaketTypDaten[];
}): MindestFunktion[] {
  const { paketTypen } = x;
  const genutzt: MindestFunktion[] = [];
  if (x.dmsVerweise) genutzt.push('dmsVerweise');
  if (x.beispielVerweise) genutzt.push('beispielVerweise');
  if (x.dokumente) genutzt.push('beispielDokumente');
  if (x.fremdeTypen) genutzt.push('fremdeTypen');
  if (x.wortlisten) genutzt.push('wortlisten');
  if (x.automatisierungen) genutzt.push('automatisierungen');
  if (paketTypen.some((t) => (t.felder as Felder).some((f) => 'erkennung' in f))) genutzt.push('erkennung');
  if (
    paketTypen.some((t) =>
      (t.felder as Felder).some((f) => 'format' in f || 'landFeld' in f || (f.typ === 'datum' && ('min' in f || 'max' in f))),
    )
  )
    genutzt.push('feldformate');
  // Zeitraum, Prozent und negative Beträge (#1035): Ältere Ablago machten aus unbekannten Feldarten Text.
  if (paketTypen.some((t) => (t.felder as Felder).some((f) => f.typ === 'zeitraum' || f.typ === 'prozent' || f.negativ === true)))
    genutzt.push('feldarten');
  if (paketTypen.some((t) => (t.felder as Felder).some((f) => f.typ === 'tabelle'))) genutzt.push('tabelle');
  if (paketTypen.some((t) => (t.felder as Felder).some((f) => Array.isArray(f.vorbelegen) && f.vorbelegen.length)))
    genutzt.push('vorbelegen');
  if (paketTypen.some((t) => 'gehoertZu' in t)) genutzt.push('teile');
  if (paketTypen.some((t) => 'archiv' in t)) genutzt.push('archiv');
  // Eigene Organisation (#995): Merkmal, Schreibschutz oder die Anzeige-Bedingung „zeigt auf eine eigene Organisation“.
  if (
    paketTypen.some((t) => (t.felder as Felder).some((f) => f.merkmal || f.schreibschutz)) ||
    JSON.stringify(paketTypen).includes('"art":"eigeneOrganisation"')
  )
    genutzt.push('organisation');
  // Zusammengesetzt (#1050): Ältere Ablago lehnen die unbekannte Feldart ab.
  if (paketTypen.some((t) => (t.felder as Felder).some((f) => f.typ === 'zusammengesetzt'))) genutzt.push('zusammengesetzt');
  // Anzeige-Bedingung „zeigt auf die Vorgabe …“ (#1038): Ältere Ablago ließen sie weg (Feld immer zu sehen).
  if (JSON.stringify(paketTypen).includes('"art":"vorgabe"')) genutzt.push('vorgaben');
  return genutzt;
}

/** Was ins Paket kommt – fertig geprüft. */
export interface BauTeile {
  e: PaketErstellenEingabe;
  d: ErstellenDaten;
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  autor: { name: string; github: string };
  art: string;
  lizenz: string;
  dms: string;
  abh: Record<string, string>;
  inhalt: Bau['inhalt'];
  paketTypen: PaketTypDaten[];
  sortiert: Array<Record<string, unknown>>;
  beispiele: Array<{ typ: string }>;
  dokDateien: Datei[];
  wortlisten: Array<{ woerter: string[] }>;
  rundgaenge: unknown[];
  tipps: unknown[];
  automatisierungen: unknown[];
}

/** Was ins Paket kommt, ohne die Angaben fürs Manifest. */
type Teile = Pick<
  BauTeile,
  'paketTypen' | 'sortiert' | 'beispiele' | 'dokDateien' | 'wortlisten' | 'rundgaenge' | 'tipps' | 'automatisierungen'
>;

/** Inhalt für die Prüfung: Typen und Ansichten mit Kennung, dazu die Anzahlen. */
export function inhaltVon(x: Teile): Bau['inhalt'] {
  const { paketTypen, sortiert, beispiele, dokDateien, wortlisten, rundgaenge, tipps, automatisierungen } = x;
  return {
    typen: paketTypen.map((t) => ({ schluessel: String(t.schluessel), name: String(t.name) })),
    sichten: sortiert.map((s) => ({
      schluessel: String(s.schluessel),
      name: String(s.name),
      eltern: (s.eltern as string | undefined) ?? null,
    })),
    beispiele: beispiele.length,
    ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}),
    ...(dokDateien.length ? { beispielDokumente: dokDateien.length } : {}),
    ...(rundgaenge.length ? { rundgaenge: rundgaenge.length } : {}),
    ...(tipps.length ? { tipps: tipps.length } : {}),
    ...(automatisierungen.length ? { automatisierungen: automatisierungen.length } : {}),
  };
}

/** CHANGELOG.md: diese Version, dann die früheren aus dem Entwurf. */
function changelogVon(x: BauTeile): string {
  const { e, d, version } = x;
  const text = aenderungsText(e, d.entwurf);
  const verlauf = (
    d.entwurf
      ? [
          {
            version: d.entwurf.version,
            datum: d.entwurf.exportiert.slice(0, 10),
            text: d.entwurf.aenderungen || t('meldungen.paketerstellung.aus-ablago-exportiert'),
          },
          ...d.entwurf.verlauf,
        ]
      : []
  ).filter((v) => vergleicheVersion(v.version, version) < 0);
  return [
    '# Änderungen',
    '',
    `## ${version}`,
    '',
    ...text
      .split('\n')
      .map((z) => (z.trim().startsWith('-') ? z : `- ${z}`))
      .filter((z) => z.trim() !== '-'),
    ...verlauf.flatMap((v) => [
      '',
      `## ${v.version}`,
      '',
      ...v.text
        .split('\n')
        .map((z) => (z.trim().startsWith('-') ? z : `- ${z}`))
        .filter((z) => z.trim() !== '-'),
    ]),
    '',
  ].join('\n');
}

/** README.md: Inhalt, Voraussetzungen, Rechte, Lizenz und Herkunft. */
function readmeVon(x: BauTeile, datum: string): string {
  const { e, name, beschreibung, paketTypen, sortiert, wortlisten, beispiele, dokDateien, dms, abh, art, lizenz, autor } = x;
  const typName = new Map(paketTypen.map((t) => [String(t.schluessel), String(t.name)] as const));
  return [
    `# ${name}`,
    '',
    beschreibung,
    '',
    '## Inhalt',
    '',
    ...(paketTypen.length
      ? [
          '| Mappentyp | Felder |',
          '| --- | --- |',
          ...paketTypen.map(
            (t) => `| ${zelle(String(t.name))} | ${zelle((t.felder as Array<{ label: string }>).map((f) => f.label).join(', ') || '–')} |`,
          ),
          '',
        ]
      : []),
    ...(sortiert.length
      ? [
          `**Ansichten:** ${sortiert.map((s) => (s.eltern ? `${sortiert.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name)).join(', ')}`,
          '',
        ]
      : []),
    ...(wortlisten.length
      ? [
          `**Wortlisten:** ${t('meldungen.paketerstellung.gruppen', { anzahl: wortlisten.length })} gleichbedeutender Wörter für die Suche`,
          '',
        ]
      : []),
    ...(beispiele.length
      ? [
          `**Beispiele:** ${beispiele.length} Beispiel-Mappen (${[...new Set(beispiele.map((b) => typName.get(b.typ)))].join(', ')})${dokDateien.length ? t('meldungen.paketerstellung.mit-beispiel-dokumenten', { anzahl: dokDateien.length }) : ''}, auf Wunsch bei der Installation.`,
          '',
        ]
      : []),
    '## Voraussetzungen',
    '',
    `- Ablago ${dms}`,
    ...(Object.keys(abh).length
      ? Object.entries(abh).map(([k, v]) => `- Paket \`${k}\` ${v}`)
      : [t('meldungen.paketerstellung.keine-weiteren-pakete')]),
    '',
    '## Rechte und Netzwerkzugriff',
    '',
    t('meldungen.paketerstellung.dieses-paket-enthaelt-keinen'),
    '',
    '## Lizenz',
    '',
    art === 'frei'
      ? t('meldungen.paketerstellung.der-volle-text-steht', { lizenz })
      : art === 'eigen'
        ? t('meldungen.paketerstellung.der-volle-text-steht-2', { wert: (e.lizenzName ?? '').trim() })
        : t('meldungen.paketerstellung.keine-lizenz-angegeben-alle'),
    '',
    '## Herkunft',
    '',
    t('meldungen.paketerstellung.erstellt-mit-paket-erstellen', { datum, wert: autor.name ? ` von ${autor.name}` : '' }),
    '',
  ].join('\n');
}

/** Die Dateien des Pakets (ohne Archiv). */
export function dateienVon(x: BauTeile): Datei[] {
  const { e, d, id, name, version, beschreibung, autor, lizenz, dms, abh, art, inhalt } = x;
  const { paketTypen, sortiert, beispiele, dokDateien, wortlisten, rundgaenge, tipps, automatisierungen } = x;
  const y = (v: unknown) => Buffer.from(stringify(v, { version: '1.1', lineWidth: 0 }));
  const manifest = {
    schema: 1,
    id,
    name,
    version,
    beschreibung,
    autor,
    lizenz,
    dms,
    abhaengigkeiten: abh,
    inhalt: {
      mappentypen: 'inhalt/mappentypen.yaml',
      sichten: 'inhalt/sichten.yaml',
      ...(beispiele.length ? { beispiele: 'inhalt/beispiele.yaml' } : {}),
      ...(wortlisten.length ? { wortlisten: 'inhalt/wortlisten.yaml' } : {}),
      ...(rundgaenge.length ? { rundgaenge: 'inhalt/rundgaenge.yaml' } : {}),
      ...(tipps.length ? { tipps: 'inhalt/tipps.yaml' } : {}),
      ...(automatisierungen.length ? { automatisierungen: 'inhalt/automatisierungen.yaml' } : {}),
    },
  };
  const datum = d.jetzt.toISOString().slice(0, 10);
  const changelog = changelogVon(x);
  const readme = readmeVon(x, datum);
  const jahr = String(d.jetzt.getFullYear());
  const lizenzDatei =
    art === 'frei'
      ? (LIZENZTEXTE[lizenz] ?? '').replace('{jahr}', jahr).replace('{name}', autor.name)
      : art === 'eigen'
        ? `${(e.lizenzText ?? '').replace(/\r\n/g, '\n').trim()}\n`
        : t('meldungen.paketerstellung.copyright-c-fuer-dieses', { jahr, name: autor.name });
  const erwartung = {
    mappentypen: inhalt.typen.map((t) => t.schluessel),
    sichten: inhalt.sichten.map((s) => s.schluessel),
    beispiele: beispiele.length,
    ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}),
  };
  return [
    {
      name: 'manifest.yaml',
      daten: Buffer.from(
        `# Erstellt mit „Paket erstellen“ in Ablago. Format: https://github.com/motom001/dms-registry\n${stringify(manifest, { version: '1.1', lineWidth: 0 })}`,
      ),
    },
    { name: 'inhalt/mappentypen.yaml', daten: y(paketTypen) },
    { name: 'inhalt/sichten.yaml', daten: y(sortiert) },
    ...(beispiele.length ? [{ name: 'inhalt/beispiele.yaml', daten: y(beispiele) }] : []),
    ...dokDateien,
    ...(wortlisten.length ? [{ name: 'inhalt/wortlisten.yaml', daten: y(wortlisten) }] : []),
    ...(rundgaenge.length ? [{ name: 'inhalt/rundgaenge.yaml', daten: y(rundgaenge) }] : []),
    ...(tipps.length ? [{ name: 'inhalt/tipps.yaml', daten: y(tipps) }] : []),
    ...(automatisierungen.length ? [{ name: 'inhalt/automatisierungen.yaml', daten: y(automatisierungen) }] : []),
    { name: 'README.md', daten: Buffer.from(readme) },
    { name: 'CHANGELOG.md', daten: Buffer.from(changelog) },
    { name: 'LICENSE', daten: Buffer.from(lizenzDatei) },
    { name: 'tests/erwartung.yaml', daten: y(erwartung) },
  ];
}
