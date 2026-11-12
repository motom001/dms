/**
 * E-Mail-Postfach (#999): aus den Anhängen einer abgeholten E-Mail die Dokumente ihrer (einen) Post. Jeder Anhang wird
 * ein eigenes Dokument mit seinem Dateinamen, in der Reihenfolge der E-Mail (MIME-Struktur, wie der Leser in imap.ts
 * sie liefert) – ohne eigene Sortierung, ohne Namensregel (nur ein gleicher Name bekommt wie beim Hochladen „(2)“).
 * Kleine eingebettete Bilder (Logos, Signaturen, `eingebettet`) fallen weg. Ganz hinten wahlweise die E-Mail selbst als
 * .eml mit dem Kennzeichen „Original-E-Mail“: als letzte Anlage (#998) am letzten Anhang, ohne Anhänge als
 * Hauptdokument. Erkennung und KI lassen sie weg (`ohneErkennung`); geteilt wird hier nichts.
 */
import { type Dokument, MAX_DATEIGROESSE } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { GeleseneMail } from './postfach';
import { t } from './sprache';

/** Die Anhänge, die Dokumente werden: in der Reihenfolge der E-Mail, ohne eingebettete Bilder. */
export function anhaengeInReihenfolge(mail: Pick<GeleseneMail, 'anhaenge'>): Array<{ name: string; mime: string; inhalt: Buffer }> {
  return mail.anhaenge.filter((a) => !a.eingebettet).map(({ name, mime, inhalt }) => ({ name, mime, inhalt }));
}

/** Dateiname der Original-E-Mail: der Betreff (ohne Zeichen, die in Dateinamen nicht gehen) mit `.eml`. */
export function emlName(betreff: string): string {
  return `${(betreff || 'Mail').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 80).trim() || 'Mail'}.eml`;
}

/**
 * Anhänge (und mit `original` die E-Mail selbst) als Dokumente in die Post `postId`; Abgelehntes (zu groß, leer, Fehler)
 * und Doppeltes mit Grund in die Historie (`von` = Systemname). Liefert die Zahl der Dokumente.
 */
export async function legeAnhaengeAb(dienst: Dienst, x: { postId: string; mail: GeleseneMail; quelle: Buffer; original: boolean; von: string }, abgelehnt: string[] = []): Promise<number> {
  const { postId, mail, von } = x;
  const register = (await dienst.eingangskanaele.postTyp()).register.find((r) => r.art === 'dokumente')?.key;
  const dateien: Array<{ name: string; mime: string; inhalt: Buffer; original?: true }> = anhaengeInReihenfolge(mail);
  if (x.original) dateien.push({ name: emlName(mail.betreff), mime: 'message/rfc822', inhalt: x.quelle, original: true });
  let n = 0;
  let letzter: Dokument | null = null;
  let original: Dokument | null = null;
  const doppelt: string[] = [];
  for (const a of dateien) {
    if (a.inhalt.length > MAX_DATEIGROESSE) { abgelehnt.push(`${a.name}: größer als 100 MB`); continue; }
    if (!a.inhalt.length) { abgelehnt.push(`${a.name}: leer`); continue; }
    try {
      // Platz in der Eingangsreihenfolge: 1, 2, 3 … wie in der E-Mail; die Original-E-Mail zuletzt.
      const r = await dienst.dokumente.ladeHoch(postId, { register, name: a.name, typ: a.mime, eingang: { nr: n + 1, ...(a.original ? { originalEmail: true } : {}) } }, a.inhalt, null);
      n++;
      if (a.original) original = r.dokument; else letzter = r.dokument;
      // Doppelt (#333): Hinweis ohne Titel – wer die Post liest, sieht beim Zuordnen nur die Fundstellen, die er lesen darf.
      if (r.gleicherInhalt.some((g) => g.mappeId !== postId)) doppelt.push(a.name);
    } catch (e) { abgelehnt.push(`${a.name}: ${(e as Error).message}`); }
  }
  // Original-E-Mail: einmal je Post, hinter dem letzten Anhang – wandert beim Übernehmen mit ihm.
  if (original && letzter) await dienst.dokumentAnlagen.alsOriginalEmail(letzter, original);
  if (doppelt.length) await dienst.eingangskanaele.notiereSystem(postId, von, t('meldungen.postfach.doppelt-liegen-schon-in', { anzahl: doppelt.length, map: doppelt.map((d) => `„${d}“`).join(', ') }));
  if (abgelehnt.length) await dienst.eingangskanaele.notiereSystem(postId, von, t('meldungen.postfach.nicht-uebernommene-anhaenge', { abgelehnt: abgelehnt.join('; ') }));
  return n;
}
