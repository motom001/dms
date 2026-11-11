/**
 * Namenskonflikte in der Vorschau (#1123): Ein neuer Mappentyp (oder eine Ansicht auf oberster Ebene) heißt wie ein
 * vorhandener. `vorschau.probleme` nennt jeden Konflikt mit seiner Herkunft – Paket, selbst angelegt, ein Paket davor im
 * selben Ablauf oder eine Abhängigkeit, die mitinstalliert wird –, bevor etwas angelegt wird. Konflikte des Pakets selbst
 * lassen sich in der Vorschau durch Umbenennen lösen (`namenskonflikte`); solche einer Abhängigkeit nicht.
 *
 * Ein Umbau (#1041), der einen vorhandenen Typ übernimmt, ist kein Konflikt mit diesem Typ (uebernahmePlan in pakete.ts).
 */
import { neuestePassende, type Benannt, type InstalliertesPaket, type Katalog } from '../../../shared/src/pakete';
import { t } from '../sprache';

/** Mappentypen einer Abhängigkeit, die mit dem Paket installiert würde (laut Katalog). */
export interface AbhaengigeTypen { id: string; name: string; typen: Benannt[] }

/**
 * Fehlende Abhängigkeiten samt deren fehlenden Abhängigkeiten, wie „fehlende Pakete mitinstallieren“ sie anlegen würde:
 * je die neueste passende Version aus dem Katalog. Was der Katalog nicht kennt, zählt nicht (das ist ein anderes Problem).
 */
export function abhaengigeTypen(abhaengigkeiten: Record<string, string>, katalog: Katalog | undefined, installiert: (id: string) => boolean): AbhaengigeTypen[] {
  const erg: AbhaengigeTypen[] = [];
  const offen = Object.entries(abhaengigkeiten);
  const gesehen = new Set<string>();
  while (offen.length) {
    const [id, bereich] = offen.shift()!;
    if (gesehen.has(id) || installiert(id)) continue;
    gesehen.add(id);
    const kp = katalog?.pakete.find((p) => p.id === id);
    const v = kp ? neuestePassende(kp, bereich) : undefined;
    if (!kp || !v) continue;
    erg.push({ id, name: kp.name, typen: v.inhalt?.mappentypen ?? [] });
    offen.push(...Object.entries(v.abhaengigkeiten ?? {}));
  }
  return erg;
}

type Installiert = Pick<InstalliertesPaket, 'name' | 'typen' | 'sichten'>;
const klein = (s: string) => s.trim().toLowerCase();

/** Wer einen Namen schon hat – als Satzteil für die Meldungen. */
export class Namensherkunft {
  constructor(private x: { typen: Array<{ id: string; name: string }>; sichten: Array<{ id: string; name: string; elternId?: string | null }>; installierte: Installiert[]; abhaengig: AbhaengigeTypen[] }) {}

  /** Mappentyp mit diesem Namen; `ohne`: Typen, die nicht zählen (vom Umbau übernommene). */
  typ(name: string, ohne: Set<string> = new Set()): string {
    const da = this.x.typen.find((y) => !ohne.has(y.id) && klein(y.name) === klein(name));
    if (da) {
      const p = this.x.installierte.find((i) => Object.values(i.typen).includes(da.id));
      return p ? t('meldungen.pakete.namen.typ-paket', { paket: p.name }) : t('meldungen.pakete.namen.typ-selbst');
    }
    const abh = this.x.abhaengig.find((a) => a.typen.some((y) => klein(y.name) === klein(name)));
    return abh ? t('meldungen.pakete.namen.typ-abhaengigkeit', { paket: abh.name }) : t('meldungen.pakete.namen.typ-ablauf');
  }

  /** Ansicht auf oberster Ebene mit diesem Namen. */
  sicht(name: string): string {
    const da = this.x.sichten.find((y) => !y.elternId && klein(y.name) === klein(name));
    if (!da) return t('meldungen.pakete.namen.sicht-ablauf');
    const p = this.x.installierte.find((i) => Object.values(i.sichten).includes(da.id));
    return p ? t('meldungen.pakete.namen.sicht-paket', { paket: p.name }) : t('meldungen.pakete.namen.sicht-selbst');
  }
}

/**
 * Konflikte der Abhängigkeiten, die mitinstalliert würden: mit vorhandenen Typen und untereinander. Lösen lässt sich das
 * nur, indem man die Abhängigkeit vorher einzeln installiert (dort mit Umbenennen).
 */
export function abhaengigkeitsKonflikte(abhaengig: AbhaengigeTypen[], belegt: Set<string>, herkunft: Namensherkunft): string[] {
  const probleme: string[] = [];
  const dazu = new Set<string>();
  for (const a of abhaengig) {
    for (const y of a.typen) {
      const n = klein(y.name);
      if (belegt.has(n)) probleme.push(t('meldungen.pakete.namen.abhaengigkeit', { paket: a.name, name: y.name, wer: herkunft.typ(y.name) }));
      else if (dazu.has(n)) probleme.push(t('meldungen.pakete.namen.abhaengigkeit', { paket: a.name, name: y.name, wer: t('meldungen.pakete.namen.typ-abhaengigkeit', { paket: abhaengig.find((b) => b !== a && b.typen.some((z) => klein(z.name) === n))?.name ?? a.name }) }));
      dazu.add(n);
    }
  }
  for (const n of dazu) belegt.add(n);
  return probleme;
}

/** Je Konflikt des Pakets selbst ein Satz (Typ bzw. Ansicht, wer den Namen hat, Vorschlag). */
export function eigeneKonflikte(x: {
  typen: Array<{ name: string; konflikt: string | null; vorschlag: string | null; vorhanden: boolean; geloescht?: boolean }>;
  sichten: Array<{ name: string; konflikt: string | null; vorschlag: string | null; vorhanden: boolean; ausgelassen?: string | null }>;
  herkunft: Namensherkunft; uebernommen: Set<string>;
}): string[] {
  return [
    ...x.typen.filter((y) => y.konflikt && !y.vorhanden && !y.geloescht).map((y) => t('meldungen.pakete.namen.typ', { name: y.name, wer: x.herkunft.typ(y.name, x.uebernommen), vorschlag: y.vorschlag ?? '' })),
    ...x.sichten.filter((y) => y.konflikt && !y.vorhanden && !y.ausgelassen).map((y) => t('meldungen.pakete.namen.sicht', { name: y.name, wer: x.herkunft.sicht(y.name), vorschlag: y.vorschlag ?? '' })),
  ];
}
