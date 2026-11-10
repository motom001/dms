import { useSyncExternalStore } from 'react';
import type { DateiFehler, Einrichtungsplan, PlanDatenbank, Planprobleme, PlanPaket, PlanVerbindung, Sammelschritt } from '../../../shared/src/einrichtungsplan';
import type { AblaufErgebnis } from '../../../shared/src/pakete';
import type { PaketWahl } from '../werkbank/PaketAblauf';
import { t } from '../sprache';

/**
 * Was der Einrichtungsassistent sammelt (#804), bevor „Jetzt einrichten“ etwas anlegt. Der Stand liegt im Speicher
 * und – ohne Passwörter und ohne Einstellungen der Pakete – in sessionStorage, damit Neuladen nichts verliert. Ein
 * Abbruch vor „Jetzt einrichten“ hinterlässt so keine halbe Einrichtung: Angelegt ist bis dahin nichts.
 *
 * Regel (#803): Übernommen wird nur, was sichtbar im Formular steht. Leer gelassene optionale Felder bleiben leer,
 * es gibt keine versteckten Vorgaben.
 */

export type Ansicht = Sammelschritt | 'zusammenfassung';
export interface MailSammlung { aktiv: boolean; host: string; port: number; verbindung: PlanVerbindung; benutzer: string; absender: string; selbstsigniert: boolean; /** Im Formular ein Passwort eingegeben (der Wert selbst nur im Speicher). */ mitPasswort: boolean }

/** Ausführen bei „Jetzt einrichten“: in dieser Reihenfolge, jede Stufe einzeln wiederholbar. */
export const STUFEN = ['ablage', 'schluessel', 'adresse', 'region', 'nutzung', 'mail', 'beispiele', 'pakete'] as const;
export type Stufe = (typeof STUFEN)[number];
export interface StufeStand { zustand: 'wartet' | 'laeuft' | 'fertig' | 'ausgelassen' | 'fehler'; meldung?: string }
export interface Lauf {
  stufen: Record<Stufe, StufeStand>;
  laeuft: boolean;
  pakete?: AblaufErgebnis;
  /** Alles durch: Abschlussseite mit Notfallblatt. */
  fertig: boolean;
  /** Ohne gespeicherten Stand neu geöffnet (anderer Browser): nur noch Schlüssel und Notfallblatt. */
  unterbrochen?: boolean;
  /** Zwei-Faktor auf der Abschlussseite (#821): eingerichtet oder „Später“ gewählt. */
  zweifaktor?: 'eingerichtet' | 'spaeter';
}

export interface Sammlung {
  ablage: string;
  /** „Dein Konto“ (#821): die Person, die einrichtet – das Passwort nur in `geheim`. */
  konto: { name: string; email: string };
  /** Pakete: gesammelte Antworten; null = keine bzw. übersprungen. */
  pakete: PaketWahl | null;
  /** Aus einer Datei, noch nicht bestätigt (#806). */
  paketeVorgabe: PlanPaket[] | null;
  /** beruflich (#1032): bis #1045 nur aus einer Datei (#806), steht dann in der Zusammenfassung. */
  optional: { adresse: string; bundesland: string; beispiele: boolean; mail: MailSammlung | null; beruflich?: boolean };
  /** Schritte, die schon einmal mit „Weiter“ verlassen wurden. */
  besucht: Ansicht[];
  ansicht: Ansicht;
  /** Nach „Ändern“ oder dem Laden einer Datei: „Weiter“ springt zum nächsten Schritt, der nicht passt, sonst zur Zusammenfassung. */
  zurZusammenfassung: boolean;
  probleme: Planprobleme;
  /** Aus der Datei: Verweise statt Passwörtern (bleiben beim Speichern erhalten) und die Datenbank. */
  verweise: { konto?: string; mail?: string; datenbank?: string };
  datenbank: PlanDatenbank | null;
  /** Hinweise beim Laden, z. B. eine andere Datenbank in der Datei. */
  hinweise: string[];
  /** Datei geladen, aber erst nach der Datenbank geprüft (Einrichtungsmodus). */
  pruefungOffen: boolean;
}

export interface Assistentenstand {
  /** Sprache im ersten Schritt bestätigt (#729). */
  spracheGewaehlt?: boolean;
  /** Neu einrichten gewählt (sonst Wahl Neu/Sicherung). */
  neu: boolean;
  sammlung: Sammlung;
  lauf: Lauf | null;
  /** Ein Schritt, der während des Laufs geändert wird (nach einem Fehler). */
  aendern: Ansicht | null;
  dateiFehler: DateiFehler[];
}

/** Nur im Speicher – nie in sessionStorage. */
export const geheim: { konto: string; mail: string; paketEinstellungen: PaketWahl['eingabe']['einstellungen'] | undefined } = { konto: '', mail: '', paketEinstellungen: undefined };

export const leereSammlung = (): Sammlung => ({
  ablage: '', konto: { name: '', email: '' },
  pakete: null, paketeVorgabe: null,
  // Vorschlag, sichtbar im Feld: die Adresse, unter der Ablago gerade aufgerufen wird (#803).
  optional: { adresse: typeof location === 'undefined' ? '' : location.origin, bundesland: '', beispiele: false, mail: null },
  besucht: [], ansicht: 'ablage', zurZusammenfassung: false, probleme: {}, verweise: {}, datenbank: null, hinweise: [], pruefungOffen: false,
});
const leer = (): Assistentenstand => ({ neu: false, sammlung: leereSammlung(), lauf: null, aendern: null, dateiFehler: [] });

const SPEICHER = 'dms:assistent';
function lies(): Assistentenstand {
  try {
    const x = JSON.parse(sessionStorage.getItem(SPEICHER) ?? 'null') as Assistentenstand | null;
    if (x && x.sammlung) {
      // Neu geladen, während eine Stufe lief: Sie gilt als unterbrochen und lässt sich erneut versuchen.
      const lauf = x.lauf ? { ...x.lauf, laeuft: false, stufen: Object.fromEntries(Object.entries(x.lauf.stufen).map(([k, v]) => [k, v.zustand === 'laeuft' ? { zustand: 'fehler', meldung: t('einrichtung.lauf.neugeladen') } : v])) as Lauf['stufen'] } : null;
      // Ein Stand aus 0.191/0.192 (#821): Schritt „Administrator“ heißt jetzt „Dein Konto“, den ersten Benutzer gibt es nicht mehr.
      const alt = x.sammlung as Sammlung & { administrator?: Sammlung['konto'] };
      const sammlung = { ...leereSammlung(), ...x.sammlung, konto: x.sammlung.konto ?? alt.administrator ?? { name: '', email: '' } };
      return { ...leer(), ...x, sammlung, lauf };
    }
  } catch { /* privates Fenster o. Ä. */ }
  return leer();
}
let zustand: Assistentenstand = lies();
const hoerer = new Set<() => void>();

function speichere() {
  try {
    // Einstellungen der Pakete können Geheimnisse enthalten (Art „geheim“) – sie bleiben nur im Speicher.
    const s = zustand.sammlung;
    const ohne: Assistentenstand = s.pakete ? { ...zustand, sammlung: { ...s, pakete: { ...s.pakete, eingabe: { ...s.pakete.eingabe, einstellungen: undefined } } } } : zustand;
    sessionStorage.setItem(SPEICHER, JSON.stringify(ohne));
  } catch { /* egal */ }
}

export function setzeStand(f: (s: Assistentenstand) => Assistentenstand) {
  zustand = f(zustand);
  speichere();
  for (const h of hoerer) h();
}
export const setzeSammlung = (f: (s: Sammlung) => Sammlung) => setzeStand((x) => ({ ...x, sammlung: f(x.sammlung) }));
export const holeStand = () => zustand;

/** Alles vergessen (nach „Einrichtung abschließen“ oder „Neu einrichten“ abgewählt). */
export function vergiss() {
  geheim.konto = ''; geheim.mail = ''; geheim.paketEinstellungen = undefined;
  try { sessionStorage.removeItem(SPEICHER); } catch { /* egal */ }
  zustand = leer();
  for (const h of hoerer) h();
}

export function useAssistent(): Assistentenstand {
  // Dritter Wert: derselbe Stand auch beim Zeichnen ohne Browser (Test ohne Konto, #881).
  const lies = () => zustand;
  return useSyncExternalStore((h) => { hoerer.add(h); return () => hoerer.delete(h); }, lies, lies);
}

/* ---------- Sammlung ⇄ Plan (#806) ---------- */

export function planAus(s: Sammlung, db: PlanDatenbank | null = s.datenbank): Einrichtungsplan {
  const m = s.optional.mail;
  return {
    datenbank: db ? { ...db, ...(s.verweise.datenbank ? { passwort: s.verweise.datenbank } : {}) } : null,
    ablage: s.ablage.replace(/\s+/g, ' ').trim(),
    konto: { name: s.konto.name.trim(), email: s.konto.email.trim(), ...(s.verweise.konto ? { passwort: s.verweise.konto } : {}) },
    pakete: s.pakete ? s.pakete.pakete.map((p) => ({ id: p.id, beispiele: p.beispiele, automatisierungen: p.automatisierungen }))
      : s.paketeVorgabe ?? (s.besucht.includes('pakete') ? [] : null),
    optional: {
      adresse: s.optional.adresse.trim() || null, bundesland: s.optional.bundesland || null, beispiele: s.optional.beispiele,
      ...(s.optional.beruflich ? { beruflich: true } : {}),
      mail: m ? { aktiv: m.aktiv, host: m.host.trim(), port: m.port, verbindung: m.verbindung, benutzer: m.benutzer.trim(), absender: m.absender.trim(), selbstsigniert: m.selbstsigniert, ...(s.verweise.mail ? { passwort: s.verweise.mail } : {}) } : null,
    },
  };
}

/** Eine geladene Datei als Sammlung: alles sichtbar vorbelegt, Passwörter fehlen (fragt der Assistent ab). */
export function sammlungAus(p: Einrichtungsplan, hinweise: string[]): Sammlung {
  const m = p.optional.mail;
  return {
    ...leereSammlung(),
    ablage: p.ablage,
    konto: { name: p.konto.name, email: p.konto.email },
    paketeVorgabe: p.pakete,
    optional: {
      adresse: p.optional.adresse ?? '', bundesland: p.optional.bundesland ?? '', beispiele: p.optional.beispiele,
      ...(p.optional.beruflich ? { beruflich: true } : {}),
      mail: m ? { aktiv: m.aktiv, host: m.host, port: m.port, verbindung: m.verbindung, benutzer: m.benutzer, absender: m.absender, selbstsigniert: m.selbstsigniert, mitPasswort: false } : null,
    },
    besucht: ['ablage', 'konto', ...(p.pakete ? ['pakete' as const] : []), 'optional'],
    zurZusammenfassung: true,
    verweise: { konto: p.konto.passwort, mail: m?.passwort, datenbank: p.datenbank?.passwort },
    datenbank: p.datenbank,
    hinweise,
  };
}
