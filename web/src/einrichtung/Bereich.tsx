import type { ReactNode } from 'react';

/** Auf- und Zuklappen eines Bereichs im Mappentyp-Editor (#144). */
export interface Klappe { offen: boolean; umschalten(): void; fehler?: boolean }

/**
 * Ein einklappbarer Bereich: Kopf mit Titel und Kurzinfo, darunter der Inhalt.
 * Der Inhalt bleibt eingeklappt erhalten (nur verborgen), damit Eingaben und Ergebnisse nicht verloren gehen.
 */
export function Bereich({ id, titel, hilfe, kurz, beschreibung, klappe, children }: {
  id: string; titel: string; hilfe?: ReactNode; kurz?: ReactNode; beschreibung?: ReactNode; klappe: Klappe; children: ReactNode;
}) {
  const { offen, umschalten, fehler } = klappe;
  return (
    <section className={`blatt bereich${offen ? '' : ' zu'}${fehler ? ' mitfehler' : ''}`} id={id} aria-labelledby={`${id}-kopf`}>
      <div className="bereichkopf">
        <h2 className="h3">
          <button type="button" id={`${id}-kopf`} className="bereichknopf" aria-expanded={offen} aria-controls={`${id}-inhalt`} onClick={umschalten}>
            <span className="pfeil" aria-hidden="true">▸</span>{titel}
            {fehler && <span className="chip schlecht">Fehler</span>}
          </button>
          {hilfe}
        </h2>
        {!offen && kurz ? <p className="bereichkurz leise">{kurz}</p> : null}
      </div>
      <div id={`${id}-inhalt`} className="bereichinhalt" hidden={!offen}>
        {beschreibung && <p className="leise bereichtext">{beschreibung}</p>}
        {children}
      </div>
    </section>
  );
}

export const TYP_BEREICHE = [
  ['grunddaten', 'Grunddaten'], ['felder', 'Felder'], ['titel', 'Titel'], ['trefferlisten', 'Trefferlisten'],
  ['register', 'Register'], ['berechtigungen', 'Berechtigungen'], ['testlauf', 'Testlauf'],
] as const;
export type TypBereich = (typeof TYP_BEREICHE)[number][0];

const SPEICHER = 'dms.typeditor.offen';

/** Welche Bereiche eines Mappentyps auf diesem Gerät offen sind; null = noch nichts gemerkt. */
export function liesOffen(typId: string): TypBereich[] | null {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Record<string, unknown>;
    return Array.isArray(x[typId]) ? (x[typId] as TypBereich[]) : null;
  } catch { return null; }
}

export function merkeOffen(typId: string, offen: Iterable<TypBereich>) {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Record<string, unknown>;
    delete x[typId];
    x[typId] = [...offen];
    // Nicht endlos wachsen: die zuletzt bearbeiteten 200 Mappentypen.
    const keys = Object.keys(x);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete x[k];
    localStorage.setItem(SPEICHER, JSON.stringify(x));
  } catch { /* privates Fenster o. Ä. – dann eben nicht merken */ }
}
