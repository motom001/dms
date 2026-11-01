/**
 * Hintergrundaufträge (#364): Stand mit Phase und Einheit, damit die Oberfläche
 * zeigt, **was** gezählt wird („Mappen anlegen: 1.000 von 1.000 ✓ · Dokumente
 * erzeugen: 1.326 von 1.907“). `fertig`/`gesamt` bleiben als Summe über alle
 * Phasen für die API erhalten.
 */

/** Eine Phase, wie sie der Auftrag beim Start ankündigt. */
export interface PhasenPlan {
  key: string;
  /** Was in der Phase passiert, mit der gezählten Sache: „Mappen anlegen“. */
  name: string;
  /** Was gezählt wird (Mehrzahl): „Mappen“, „Dokumente“, „Dateien“. */
  einheit: string;
}

export interface AuftragPhase extends PhasenPlan {
  status: 'wartet' | 'laeuft' | 'fertig';
  fertig: number;
  /** 0, solange noch nicht bekannt ist, wie viele es werden. */
  gesamt: number;
}

export interface Auftrag {
  id: string;
  art: string;
  titel: string;
  status: 'laeuft' | 'fertig' | 'fehler';
  /** Summe über alle Phasen (kompatibel zur API vor #364). */
  fertig: number;
  gesamt: number;
  /** Schlüssel der laufenden Phase. */
  phase?: string;
  phasen: AuftragPhase[];
  gestartet: string;
  beendet?: string;
  ergebnis?: unknown;
  fehler?: string;
}

/** Rückmeldung der Arbeit: Stand einer Phase (ohne `phase`: die laufende bzw. erste). */
export type Fortschritt = (fertig: number, gesamt: number, phase?: string) => void;

/** Neuer Auftragsstand ohne Fortschritt. */
export function neuerStand(plan: PhasenPlan[]): Pick<Auftrag, 'fertig' | 'gesamt' | 'phase' | 'phasen'> {
  return {
    fertig: 0, gesamt: 0, phase: plan[0]?.key,
    phasen: plan.map((p, i) => ({ ...p, status: i === 0 ? 'laeuft' : 'wartet', fertig: 0, gesamt: 0 })),
  };
}

/**
 * Trägt einen Fortschritt ein (verändert `a`). Mit Phasen: die genannte Phase läuft,
 * alle davor sind fertig; `fertig`/`gesamt` sind die Summen. Ohne Phasen wie früher.
 */
export function meldeFortschritt(a: Pick<Auftrag, 'fertig' | 'gesamt' | 'phase' | 'phasen'>, fertig: number, gesamt: number, phase?: string): void {
  if (!a.phasen.length) { a.fertig = fertig; a.gesamt = gesamt; return; }
  let i = a.phasen.findIndex((p) => p.key === (phase ?? a.phase));
  if (i < 0) i = 0;
  a.phasen.forEach((p, j) => { if (j < i) p.status = 'fertig'; else if (j === i) p.status = 'laeuft'; });
  a.phasen[i].fertig = fertig;
  a.phasen[i].gesamt = gesamt;
  a.phase = a.phasen[i].key;
  a.fertig = a.phasen.reduce((s, p) => s + p.fertig, 0);
  a.gesamt = a.phasen.reduce((s, p) => s + Math.max(p.gesamt, p.fertig), 0);
}

/** Am Ende: alle Phasen fertig (nur bei Erfolg). */
export function schliessePhasen(a: Pick<Auftrag, 'phase' | 'phasen'>): void {
  for (const p of a.phasen) p.status = 'fertig';
  a.phase = undefined;
}

const zahl = (n: number) => n.toLocaleString('de-DE');

/** Ein Teil der Anzeige je Phase: „Dokumente erzeugen: 1.326 von 1.907“. */
export function phasenText(p: AuftragPhase): string {
  if (p.status === 'wartet') return `${p.name}: folgt`;
  if (!p.gesamt && p.status === 'laeuft') return `${p.name}: wird ermittelt …`;
  return `${p.name}: ${zahl(p.fertig)} von ${zahl(Math.max(p.gesamt, p.fertig))}${p.status === 'fertig' ? ' ✓' : ''}`;
}

/**
 * Fortschritt als Text. Mit Phasen: alle Phasen, getrennt durch „ · “. Ohne
 * Phasen (ältere Aufträge): „x von y“ mit der übergebenen Einheit.
 */
export function fortschrittText(a: { fertig: number; gesamt: number; phasen?: AuftragPhase[] }, einheit = ''): string {
  if (a.phasen?.length) return a.phasen.map(phasenText).join(' · ');
  return `${zahl(a.fertig)} von ${zahl(a.gesamt)}${einheit ? ` ${einheit}` : ''}`;
}
