/** Hilfen für Tests (keine eigenen Tests). */
import type { Dienst } from '../src/dienst';

/** Ein einfaches PDF mit Textebene (Helvetica), Text je Zeile. */
/** Einseitiges PDF mit Textebene; drehung (z. B. 90) setzt /Rotate der Seite (#395). */
export function pdfMitText(zeilen: string[], groesse = 24, drehung = 0): Buffer {
  const inhalt = `BT /F1 ${groesse} Tf 72 720 Td ${zeilen.map((z, i) => `${i ? `0 -${groesse * 1.4} Td ` : ''}(${z.replace(/[()\\]/g, '\\$&')}) Tj`).join(' ')} ET`;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]${drehung ? ` /Rotate ${drehung}` : ''} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(inhalt, 'latin1')} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let text = '%PDF-1.4\n';
  const versatz: number[] = [];
  objekte.forEach((o, i) => { versatz.push(Buffer.byteLength(text, 'latin1')); text += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(text, 'latin1');
  text += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}`;
  text += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text, 'latin1');
}

/**
 * Verwaltungsmodus (#819) für Tests, die Handler direkt aufrufen: Die gespeicherte Person hat nur ihr Verwaltungsrecht;
 * wie im laufenden Modus wirkt sie mit `rolle: 'admin'`.
 */
export const imModus = <T extends { rolle?: string }>(b: T): T & { rolle: 'admin' } => ({ ...b, rolle: 'admin' as const });
/** Wie früher der Admin: Personen mit Verwaltungsrecht rufen Handler in diesen Tests im Verwaltungsmodus auf. */
export const wieImModus = <T extends { rolle?: string; verwaltung?: string[] }>(b: T): T => (b?.verwaltung?.length ? imModus(b) : b);

/**
 * Der Ablageort, wie ihn der Kern vor #883 in jeder Ablage anlegte (#168): Kennung `ablageort`, eigene Ansicht,
 * gemerkt in der Einstellung `ablageort`. Für Tests der Übernahme durch das Paket Basis und des Alias `dms:ablageort`.
 */
export async function frueherAblageort(d: Dienst, einstellungen?: { schreibe(k: string, w: unknown): Promise<void> }) {
  const id = crypto.randomUUID();
  const typ = await d.mappentypen.legeTypAn({
    id, name: 'Ablageort', schluessel: 'ablageort', beschreibung: 'Wo Originale liegen – verschachtelt, z. B. zu Hause › Arbeitszimmer Schrank › roter Ordner',
    titelVorlage: '{liegt_in} › {name}',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, maxLen: 120, hilfe: 'z. B. roter Ordner, Safe im Flur, beim Notar, vernichtet' },
      { key: 'liegt_in', label: 'Liegt in', typ: 'referenz', zielTyp: id, verweisart: 'zugehoerigkeit' },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'langtext', maxLen: 2000 },
    ],
    register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name', 'liegt_in', 'beschreibung'] },
      { key: 'enthaelt', name: 'Enthält', art: 'verknuepfungen', quellen: [{ typId: id, feldKey: 'liegt_in' }] },
      { key: 'liegt_hier', name: 'Liegt hier', art: 'verknuepfungen', quellen: [] },
      { key: 'fotos', name: 'Fotos', art: 'dokumente' },
    ],
    trefferliste: ['_titel', 'beschreibung'],
  });
  await einstellungen?.schreibe('ablageort', { id: typ.id });
  return typ;
}

/** Mappentyp Ablageort wie in Basis 1.6.0 (#883, dms-registry #138) – mit Ansicht „Ablageorte“ und englischen Beschriftungen. */
export const ABLAGEORT_YAML = [
  '- schluessel: ablageort', '  name: Ablageort', '  beschreibung: Wo Originale liegen', '  beschriftungen: { en: { name: "Storage location" } }', '  titelVorlage: "{liegt_in} › {name}"', '  felder:',
  '    - { key: name, label: Name, typ: text, pflicht: true, maxLen: 120, beschriftungen: { en: { label: "Name" } } }',
  '    - { key: liegt_in, label: Liegt in, typ: referenz, ziel: ablageort, verweisart: zugehoerigkeit, beschriftungen: { en: { label: "Located in" } } }',
  '    - { key: beschreibung, label: Beschreibung, typ: langtext, maxLen: 2000 }',
  '  register:',
  '    - { key: allgemein, name: Allgemein, art: felder, felder: [name, liegt_in, beschreibung] }',
  '    - { key: enthaelt, name: Enthält, art: verknuepfungen, quellen: [{ typ: ablageort, feld: liegt_in }] }',
  '    - { key: liegt_hier, name: Liegt hier, art: verknuepfungen }',
  '    - { key: fotos, name: Fotos, art: dokumente }',
  '  trefferliste: [_titel, beschreibung]', '',
].join('\n');
/** Das Test-Paket Basis (Ordner test/pakete/basis) als Version 1.6.0 mit Ablageort. */
export const basisMitAblageort = (basis: Record<string, string>): Record<string, string> => ({
  ...basis,
  'manifest.yaml': basis['manifest.yaml'].replace(/^version: .*$/m, 'version: 1.6.0'),
  'inhalt/mappentypen.yaml': `${basis['inhalt/mappentypen.yaml'].trimEnd()}\n\n${ABLAGEORT_YAML}`,
  'inhalt/sichten.yaml': `${basis['inhalt/sichten.yaml'].trimEnd()}\n\n- { schluessel: ablageorte, name: Ablageorte, typen: [ablageort] }\n`,
});

/**
 * „Post für dich“ (#1001) einschalten wie das Paket Benachrichtigungen: Motor am Ausgangskorb (Speicher-Repo), dieselben
 * Karten (`postFuerDichDaten`). Seit #1001 legt der Kern die Aufgabe nicht mehr selbst an. `verteile` stellt auch
 * gebündelte Ereignisse („Mappe geändert“, 5 s) gleich zu.
 */
export async function postFuerDich(d: Dienst, konten: { systemkonto(k: 'automatisierung'): Promise<import('../../shared/src/model').Benutzer> }) {
  const { Automatisierungen, speicherAutomatisierungRepo, postFuerDichDaten } = await import('../src/automatisierung');
  await import('../src/automatisierung-karten');
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k as 'automatisierung');
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  d.ereignisse.abonniere('automatisierungen', (e) => motor.ereignis(e));
  const postTyp = (await d.kern.system()).post.id;
  const a = await motor.lege({ ...postFuerDichDaten(postTyp, { name: 'Post für dich', beschreibung: '', text: 'Post für dich – bitte zuordnen' }), aktiv: true }, null);
  const verteile = async () => {
    const echt = Date.now;
    Date.now = () => echt() + 6000;
    try { await d.ereignisse.verteile(); } finally { Date.now = echt; }
  };
  return { motor, automatisierung: a, verteile };
}
