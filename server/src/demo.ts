import { randomUUID } from 'node:crypto';
import { istOk, pruefeMappe, titelAus, verweiseVon, type Feld, type Mappentyp, type Wert, type Werte } from '../../shared/src/model';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { NeueMappe } from './repo';

/**
 * Erzeugt Demo-Mappen für die vorhandenen Mappentypen. Die Werte passen zu
 * Datentyp und Eigenschaften der Felder; Referenzen zeigen auf vorhandene
 * Mappen. Alles wird als Demo gekennzeichnet und lässt sich wieder entfernen.
 */
export const MAX_DEMO = 5000;

const zufall = (n: number) => Math.floor(Math.random() * n);
const eins = <T>(a: readonly T[]): T => a[zufall(a.length)];
const zwischen = (min: number, max: number) => min + Math.random() * (max - min);

const NACHNAMEN = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler'];
const VORNAMEN = ['Anna', 'Lena', 'Marie', 'Sophie', 'Lea', 'Thomas', 'Michael', 'Andreas', 'Stefan', 'Jan', 'Lukas', 'Paul', 'Sabine', 'Petra', 'Katrin', 'Frank', 'Jörg', 'Uwe', 'Heike', 'Claudia'];
const ORTE = ['Dresden', 'Leipzig', 'Chemnitz', 'Pirna', 'Meißen', 'Radebeul', 'Freital', 'Bautzen', 'Görlitz', 'Zwickau', 'Riesa', 'Kamenz'];
const BRANCHEN = ['Heizungsbau', 'Elektrotechnik', 'Sanitär', 'Dachdeckerei', 'Autohaus', 'Versicherungsmakler', 'Steuerberatung', 'Stadtwerke', 'Gartenbau', 'Malerbetrieb', 'Zahnarztpraxis', 'Tischlerei', 'Energieversorgung', 'Telekommunikation', 'Hausverwaltung'];
const FORMEN = ['GmbH', 'GmbH & Co. KG', 'AG', 'e. K.', 'OHG', ''];
const DINGE = ['Strom', 'Gas', 'Wasser', 'Internet', 'Mobilfunk', 'Kfz-Versicherung', 'Hausrat', 'Haftpflicht', 'Wartung Heizung', 'Fitnessstudio', 'Zeitung', 'Streaming', 'Wohngebäude', 'Rechtsschutz', 'Photovoltaik'];
const ZWECKE = ['Abschlag', 'Jahresabrechnung', 'Rechnung', 'Monatsbeitrag', 'Nachzahlung', 'Gutschrift', 'Reparatur', 'Wartung', 'Beitrag'];
const STRASSEN = ['Hauptstraße', 'Bahnhofstraße', 'Gartenweg', 'Lindenallee', 'Schulstraße', 'Bergstraße', 'Am Markt', 'Waldweg'];
const SAETZE = ['Unterlagen vollständig.', 'Rückfrage beim Kundenservice offen.', 'Laut Telefonat verlängert.', 'Kündigung vorgemerkt.', 'Bitte bei Gelegenheit prüfen.', 'Original liegt im Ordner.', 'Wurde per Lastschrift beglichen.'];

const firma = () => [eins(NACHNAMEN), eins(BRANCHEN), eins(FORMEN)].filter(Boolean).join(' ');
const person = () => `${eins(VORNAMEN)} ${eins(NACHNAMEN)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tageVonHeute = (von: number, bis: number) => iso(new Date(Date.now() + Math.round(zwischen(von, bis)) * 86_400_000));

function textFuer(f: Feld, nr: number): string {
  const s = `${f.key} ${f.label}`.toLowerCase();
  if (/mail/.test(s)) return `${eins(VORNAMEN).toLowerCase()}.${eins(NACHNAMEN).toLowerCase().replace(/[^a-z]/g, '')}${nr}@example.org`;
  if (/telefon|handy|mobil|tel\b/.test(s)) return `0351 ${100000 + zufall(899999)}`;
  if (/iban/.test(s)) return `DE${String(10 + zufall(89))}${Array.from({ length: 18 }, () => zufall(10)).join('')}`;
  if (/stra(ss|ß)e|adresse|anschrift/.test(s)) return `${eins(STRASSEN)} ${1 + zufall(120)}, ${eins(ORTE)}`;
  if (/\bort\b|stadt/.test(s)) return eins(ORTE);
  if (/nummer|\bnr\b|kennung|konto|aktenzeichen|kennzeichen/.test(s)) return `${eins(['A', 'K', 'R', 'V', 'S'])}-${2020 + zufall(7)}-${String(10000 + zufall(89999))}`;
  if (/vorname/.test(s)) return eins(VORNAMEN);
  if (/person|inhaber|ansprech/.test(s)) return person();
  if (/name|firma|partner|aussteller|anbieter|unternehmen/.test(s)) return zufall(5) === 0 ? person() : firma();
  if (/zweck|betreff/.test(s)) return `${eins(ZWECKE)} ${eins(DINGE)} ${String(1 + zufall(12)).padStart(2, '0')}/${2023 + zufall(4)}`;
  if (/bezeichnung|titel|thema/.test(s)) return `${eins(DINGE)} ${eins(['Haus', 'Wohnung', 'Familie', 'Auto', 'Garten', ''])}`.trim();
  return `${eins(DINGE)} ${nr}`;
}

/** Wert für ein Feld oder undefined, wenn sich nichts Passendes erzeugen lässt. */
function wertFuer(f: Feld, nr: number, pools: Map<string, string[]>, vergeben: Set<string>): Wert | undefined {
  switch (f.typ) {
    case 'text':
    case 'langtext': {
      let s = f.typ === 'langtext' ? Array.from({ length: 1 + zufall(3) }, () => eins(SAETZE)).join(' ') : textFuer(f, nr);
      if (f.eindeutig) {
        let n = nr;
        while (vergeben.has(s.toLowerCase())) s = `${textFuer(f, n)} ${++n}`;
      }
      if (f.maxLen != null && s.length > f.maxLen) s = s.slice(-f.maxLen);
      if (f.minLen != null && s.length < f.minLen) s = s.padEnd(f.minLen, '·');
      if (f.muster) {
        try { if (!new RegExp(`^(?:${f.muster})$`).test(s)) return undefined; } catch { return undefined; }
      }
      return s;
    }
    case 'zahl': {
      const min = f.min ?? 1, max = f.max ?? Math.max(min + 1000, 1000);
      const stellen = Math.min(f.nachkomma ?? 0, 4);
      let x = Number(zwischen(min, max).toFixed(stellen));
      if (f.eindeutig) while (vergeben.has(String(x))) x = Number(zwischen(min, max).toFixed(stellen));
      return x;
    }
    case 'betrag': {
      const min = f.min ?? 5, max = f.max ?? Math.max(min + 100, 2500);
      return { betrag: Number(zwischen(min, max).toFixed(2)), waehrung: f.waehrung || 'EUR' };
    }
    case 'datum': {
      const s = `${f.key} ${f.label}`.toLowerCase();
      return /kuendig|kündig|ende|frist|ablauf|gueltig|gültig|bis\b|faellig|fällig/.test(s) ? tageVonHeute(10, 700) : tageVonHeute(-1100, 0);
    }
    case 'janein': return Math.random() < 0.5;
    case 'auswahl': {
      const o = f.optionen ?? [];
      if (!o.length) return undefined;
      if (!f.mehrfach) return eins(o);
      return [...new Set(Array.from({ length: 1 + zufall(Math.min(2, o.length)) }, () => eins(o)))];
    }
    case 'referenz': {
      const pool = pools.get(f.zielTyp ?? '') ?? [];
      if (!pool.length) return undefined;
      if (!f.mehrfach) return eins(pool);
      return [...new Set(Array.from({ length: 1 + zufall(3) }, () => eins(pool)))];
    }
  }
}

/** Reihenfolge: Typen, auf die verwiesen wird, zuerst. */
function reihenfolge(typen: Mappentyp[]): Mappentyp[] {
  const fertig: Mappentyp[] = [];
  const rest = [...typen];
  while (rest.length) {
    const i = rest.findIndex((t) => t.felder.every((f) => f.typ !== 'referenz' || f.zielTyp === t.id || !rest.some((r) => r.id === f.zielTyp)));
    fertig.push(...rest.splice(i < 0 ? 0 : i, 1)); // bei Kreisen: einfach weiter
  }
  return fertig;
}

export interface Fortschritt { (fertig: number, gesamt: number): void }

/**
 * Erzeugt die Demo-Mappen im Arbeitsspeicher, prüft sie mit denselben Regeln wie
 * beim Speichern und schreibt sie paketweise in die Datenbank. So dauern auch
 * 5000 Mappen nur Sekunden statt tausender Einzelanfragen.
 */
export async function erzeugeDemo(dienst: Dienst, anzahl: unknown, benutzerId: string | null, fortschritt: Fortschritt = () => {}) {
  const n = pruefeAnzahl(anzahl);
  // Benutzer und Rollen pflegt das System; Demo-Mappen dürfen aber auf sie verweisen.
  const typen = reihenfolge((await dienst.listeTypen()).filter((t) => !t.system));
  if (!typen.length) throw new Fachfehler(409, 'Es gibt noch keine Mappentypen. Lege zuerst welche an oder lade die Beispiele.');

  // Stammdaten (wenig Verweise) bekommen weniger Mappen als Belege (viele Verweise).
  const gewicht = (t: Mappentyp) => 1 + 2 * t.felder.filter((f) => f.typ === 'referenz' && f.zielTyp !== t.id).length;
  const summe = typen.reduce((a, t) => a + gewicht(t), 0);
  const ziel = new Map(typen.map((t) => [t.id, Math.max(1, Math.round((n * gewicht(t)) / summe))]));
  const gesamtZiel = [...ziel.values()].reduce((a, b) => a + b, 0);

  const vorhanden = await dienst.listeMappen();
  const pools = new Map<string, string[]>();
  const typVon = new Map<string, string>();
  const titel = new Map<string, string>();
  for (const m of vorhanden) {
    (pools.get(m.typId) ?? pools.set(m.typId, []).get(m.typId)!).push(m.id);
    typVon.set(m.id, m.typId);
    titel.set(m.id, m.titel ?? '');
  }

  const erzeugt: Record<string, number> = {};
  const uebersprungen: Array<{ typ: string; grund: string }> = [];
  let fertig = 0;
  let paket: NeueMappe[] = [];
  const schreibe = async () => { await dienst.legeMappenAn(paket); fertig += paket.length; paket = []; fortschritt(fertig, gesamtZiel); };
  const jetzt = new Date().toISOString();

  for (const t of typen) {
    const vergeben = new Map<string, Set<string>>(t.felder.filter((f) => f.eindeutig).map((f) => [f.key, new Set(
      vorhanden.filter((m) => m.typId === t.id && m.werte[f.key] != null).map((m) => String(m.werte[f.key]).trim().toLowerCase()))]));
    let ok = 0, fehlversuche = 0, letzterFehler = '';
    while (ok < ziel.get(t.id)! && fehlversuche < 25) {
      const werte: Werte = {};
      let unmoeglich = '';
      for (const f of t.felder) {
        if (!f.pflicht && Math.random() < 0.2) continue;
        const w = wertFuer(f, ok + 1, pools, vergeben.get(f.key) ?? new Set());
        if (w === undefined) { if (f.pflicht) unmoeglich = `Für das Pflichtfeld „${f.label}“ lässt sich kein passender Wert erzeugen${f.typ === 'referenz' ? ' (es gibt noch keine Mappen des Zieltyps)' : ''}.`; continue; }
        werte[f.key] = w;
      }
      if (unmoeglich) { letzterFehler = unmoeglich; break; }
      const p = pruefeMappe(t, werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => (vergeben.get(k)?.has(String(v).trim().toLowerCase()) ? 'eine andere Mappe' : undefined),
      });
      if (!istOk(p)) {
        fehlversuche++;
        const [k, msg] = Object.entries(p.felder)[0] ?? [];
        letzterFehler = k ? `${t.felder.find((f) => f.key === k)?.label ?? k}: ${msg?.[0]}` : p.allgemein[0] ?? 'ungültig';
        continue;
      }
      const id = randomUUID();
      const tt = titelAus(t, werte, (z) => titel.get(z) || 'Ohne Titel', { erstellt: jetzt, geaendert: jetzt });
      paket.push({ id, typId: t.id, werte, verweise: verweiseVon(t, werte), titel: tt, benutzerId, demo: true });
      ok++; fehlversuche = 0;
      (pools.get(t.id) ?? pools.set(t.id, []).get(t.id)!).push(id);
      typVon.set(id, t.id); titel.set(id, tt);
      for (const [k, set] of vergeben) if (werte[k] != null) set.add(String(werte[k]).trim().toLowerCase());
      if (paket.length >= 500) await schreibe();
    }
    erzeugt[t.name] = ok;
    if (ok < ziel.get(t.id)!) uebersprungen.push({ typ: t.name, grund: letzterFehler || 'unbekannt' });
  }
  await schreibe();
  return { erzeugt, uebersprungen, gesamt: fertig };
}

export function pruefeAnzahl(anzahl: unknown): number {
  const n = Math.floor(Number(anzahl));
  if (!Number.isFinite(n) || n < 1 || n > MAX_DEMO) throw new Fachfehler(422, `Bitte eine Anzahl zwischen 1 und ${MAX_DEMO} angeben.`);
  return n;
}
