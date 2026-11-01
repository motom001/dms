/**
 * Daten für Leistungsmessungen (#367): Beispiel-Typen, Demo-Mappen mit festem Startwert und je Mappe
 * mit Dokumentenregister 1–3 Dokumente mit realistisch großem Volltext (5–50 KB). Die Dokumente
 * entstehen direkt per SQL (ohne Texterkennung) und teilen sich wenige kleine Dummy-PDFs, damit
 * auch 30.000 Dokumente in Minuten erzeugt sind. Gemeinsam genutzt von `leistung.test.ts` und dem
 * Mess-Skript `leistungsmessung.ts`.
 */
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { ladeBeispiele } from '../src/beispiele';
import type { Dateispeicher } from '../src/dateispeicher';
import { erzeugeDemo } from '../src/demo';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { pgRepo } from '../src/repo-pg';
import { Zufall } from '../src/zufall';

export const HAUSHALT = '00000000-0000-4000-8000-000000000001';
export const BENUTZER = '00000000-0000-4000-8000-0000000000bb';

export interface LeistungsOptionen {
  mappen: number;
  startwert: string;
  /** Dokumente je Mappe mit Dokumentenregister. */
  dokumente: { von: number; bis: number };
  /** Größe des Volltexts je Dokument in Bytes. */
  text: { von: number; bis: number };
  log?: (m: string) => void;
}

const WOERTER = ('Rechnung Vertrag Versicherung Kündigung Beitrag Zahlung Betrag Euro Kunde Nummer Datum Frist Laufzeit '
  + 'Stadtwerke Strom Gas Wasser Heizung Wartung Termin Auftrag Angebot Bestellung Lieferung Garantie Gewährleistung '
  + 'Steuer Finanzamt Bescheid Erklärung Konto Bank Überweisung Lastschrift Mandat Miete Nebenkosten Abrechnung '
  + 'Arzt Praxis Befund Krankenkasse Rezept Schule Zeugnis Anmeldung Auto Kennzeichen Werkstatt Inspektion '
  + 'und der die das mit für von im auf ist wird werden bitte freundlichen Grüßen Sehr geehrte Damen Herren').split(' ');

function text(z: Zufall, bytes: number): string {
  const teile: string[] = [];
  let n = 0;
  while (n < bytes) {
    const w = z.eins(WOERTER) + (z.chance(0.1) ? ` ${z.int(100000)}` : '') + (z.chance(0.08) ? '.\n' : ' ');
    teile.push(w); n += Buffer.byteLength(w);
  }
  return teile.join('');
}

/** Ein kleines, gültiges PDF je Nummer (Inhalt egal, nur lesbar). */
function dummyPdf(i: number): Buffer {
  return Buffer.from(`%PDF-1.4\n% Leistungsmessung ${i}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

/**
 * Legt in einer leeren, migrierten Datenbank Haushalt, Benutzer, Beispiele, Demo-Mappen und
 * Dokumente an. Liefert Kennzahlen. `dateien` bekommt die Dummy-PDFs (für den Export).
 */
export async function baueLeistungsdaten(sql: postgres.Sql, dateien: Dateispeicher, o: LeistungsOptionen) {
  const log = o.log ?? (() => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Leistung') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${BENUTZER}, ${HAUSHALT}, 'anna@example.org', 'Anna', 'admin') ON CONFLICT DO NOTHING`;
  const d = new Dienst(pgRepo(sql, HAUSHALT), dateien, { einstellungen: speicherEinstellungen() });
  await ladeBeispiele(d);
  let t0 = Date.now();
  const demo = await erzeugeDemo(d, { anzahl: o.mappen, startwert: o.startwert }, BENUTZER);
  log(`${demo.gesamt} Demo-Mappen in ${Date.now() - t0} ms`);

  // Dummy-PDFs (wenige, geteilt)
  const shas: Array<{ sha: string; groesse: number }> = [];
  for (let i = 0; i < 20; i++) {
    const b = dummyPdf(i);
    const sha = createHash('sha256').update(b).digest('hex');
    await dateien.schreibe(sha, b);
    shas.push({ sha, groesse: b.length });
  }

  // Mappen mit Dokumentenregister, in fester Reihenfolge (Titel, Typ), damit der Startwert greift.
  const typen = await sql`SELECT id, name, register FROM mappentypen WHERE haushalt_id = ${HAUSHALT}`;
  const regVon = new Map<string, string>();
  for (const t of typen) {
    const r = (t.register as Array<{ key: string; art: string }>).find((x) => x.art === 'dokumente');
    if (r) regVon.set(t.id as string, r.key);
  }
  const mappen = await sql`SELECT m.id, m.typ_id FROM mappen m JOIN mappentypen t ON t.id = m.typ_id
    WHERE m.haushalt_id = ${HAUSHALT} AND m.demo ORDER BY t.name, m.titel, m.werte::text`;
  const z = new Zufall(`${o.startwert}:dokumente`);
  t0 = Date.now();
  let paket: Array<[string, string, string, string, number, string, string]> = [];
  let anzahl = 0, bytes = 0;
  const schreibe = async () => {
    if (!paket.length) return;
    await sql`
      INSERT INTO dokumente (id, haushalt_id, mappe_id, register_key, name, mime, groesse, sha256, anzeigbar, erstellt_von, herkunft, volltext, ocr_stand, ocr_zeit)
      SELECT x.id::uuid, ${HAUSHALT}, x.mappe::uuid, x.reg, x.name, 'application/pdf', x.groesse, x.sha, true, ${BENUTZER}, 'hochgeladen', x.text, 'fertig', now()
      FROM unnest(${paket.map((p) => p[0])}::text[], ${paket.map((p) => p[1])}::text[], ${paket.map((p) => p[2])}::text[], ${paket.map((p) => p[3])}::text[],
        ${paket.map((p) => p[4])}::int[], ${paket.map((p) => p[5])}::text[], ${paket.map((p) => p[6])}::text[]) AS x(id, mappe, reg, name, groesse, sha, text)`;
    paket = [];
  };
  for (const m of mappen) {
    const reg = regVon.get(m.typ_id as string);
    if (!reg) continue;
    const n = z.von(o.dokumente.von, o.dokumente.bis);
    for (let i = 0; i < n; i++) {
      const datei = z.eins(shas);
      const t = text(z, z.von(o.text.von, o.text.bis));
      const h = createHash('md5').update(`${o.startwert}:${m.id}:${i}`).digest('hex');
      const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
      paket.push([id, m.id as string, reg, `Dokument ${anzahl + 1}.pdf`, datei.groesse, datei.sha, t]);
      anzahl++; bytes += t.length;
      if (paket.length >= 300) await schreibe();
    }
  }
  await schreibe();
  log(`${anzahl} Dokumente (${Math.round(bytes / 1024 ** 2)} MB Volltext) in ${Date.now() - t0} ms`);
  return { mappen: demo.gesamt, dokumente: anzahl, volltextBytes: bytes };
}
