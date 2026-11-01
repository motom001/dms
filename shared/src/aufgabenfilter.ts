/**
 * Filter für Werkbank → Aufgaben (#366): Empfänger, Art, Mappentyp, Fälligkeit, Titel und
 * „Erledigte zeigen“. Der Filter steht in der Adresse, damit sich ein Link teilen lässt.
 */
import { AUFGABENARTEN, type Aufgabe, type Aufgabenart } from './model';

/** Empfänger: eine Benutzer-Id, „admins“ (an Administratoren) oder „ohne-vertretung“ (abwesend, ohne Vertreter). */
export type Faelligkeit = 'ueberfaellig' | 'woche' | 'spaeter' | 'ohne';
export const FAELLIGKEITEN: Record<Faelligkeit, string> = { ueberfaellig: 'überfällig', woche: 'diese Woche', spaeter: 'später', ohne: 'ohne Datum' };

export interface AufgabenFilter {
  empfaenger?: string;
  art?: Aufgabenart;
  typ?: string;
  faellig?: Faelligkeit;
  text?: string;
  erledigt?: boolean;
}

const SCHLUESSEL = ['empfaenger', 'art', 'typ', 'faellig', 'text'] as const;

export function filterAusAdresse(suche: URLSearchParams): AufgabenFilter {
  const f: AufgabenFilter = {};
  const empfaenger = suche.get('empfaenger')?.trim();
  if (empfaenger) f.empfaenger = empfaenger;
  const art = suche.get('art');
  if (art && art in AUFGABENARTEN) f.art = art as Aufgabenart;
  const typ = suche.get('typ')?.trim();
  if (typ) f.typ = typ;
  const faellig = suche.get('faellig');
  if (faellig && faellig in FAELLIGKEITEN) f.faellig = faellig as Faelligkeit;
  const text = suche.get('text')?.trim();
  if (text) f.text = text.slice(0, 200);
  if (suche.has('erledigt')) f.erledigt = true;
  return f;
}

/** Als Suchteil der Adresse, z. B. „?art=frist&faellig=ueberfaellig“ (leer ohne Filter). */
export function filterInAdresse(f: AufgabenFilter): string {
  const p = new URLSearchParams();
  for (const k of SCHLUESSEL) { const v = f[k]; if (v) p.set(k, v); }
  if (f.erledigt) p.set('erledigt', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const filterAktiv = (f: AufgabenFilter) => SCHLUESSEL.some((k) => !!f[k]);

const tag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Fälligkeit nach dem Datum der Aufgabe (Frist, Erinnerung); die Woche endet am Sonntag. */
export function faelligkeit(datum: string | null | undefined, jetzt: Date): Faelligkeit {
  if (!datum) return 'ohne';
  const d = datum.slice(0, 10);
  const heute = tag(jetzt);
  if (d < heute) return 'ueberfaellig';
  const sonntag = new Date(jetzt);
  sonntag.setDate(jetzt.getDate() + ((7 - jetzt.getDay()) % 7));
  return d <= tag(sonntag) ? 'woche' : 'spaeter';
}

export interface FilterUmfeld {
  jetzt: Date;
  /** Wahr, wenn der Benutzer gerade abwesend ist und niemand ihn vertritt. */
  ohneVertretung: (benutzerId: string) => boolean;
}

export function filtereAufgaben(liste: Aufgabe[], f: AufgabenFilter, u: FilterUmfeld): Aufgabe[] {
  const text = f.text?.toLocaleLowerCase('de-DE');
  return liste.filter((a) => {
    if (f.empfaenger === 'admins') { if (a.empfaengerId !== null) return false; }
    else if (f.empfaenger === 'ohne-vertretung') { if (!a.empfaengerId || !u.ohneVertretung(a.empfaengerId)) return false; }
    else if (f.empfaenger && a.empfaengerId !== f.empfaenger) return false;
    if (f.art && a.art !== f.art) return false;
    if (f.typ && a.typId !== f.typ) return false;
    if (f.faellig && faelligkeit(a.datum, u.jetzt) !== f.faellig) return false;
    if (text && !`${a.mappeTitel ?? ''} ${a.text}`.toLocaleLowerCase('de-DE').includes(text)) return false;
    return true;
  });
}
