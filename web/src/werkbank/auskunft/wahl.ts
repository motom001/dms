import { GRUND_MIN, type AuskunftAuswahl, type AuskunftMappe, type AuskunftVorschau } from '../../../../shared/src/auskunft';

/* ---------- Auswahl einer Auskunft: was angehakt ist ---------- */

export interface Wahl {
  mappen: Set<string>;
  dokumente: Set<string>;
  notizen: Set<string>;
  historie: Set<string>;
  gruende: Record<string, string>;
  erwaehnungen: Set<string>;
}
export const LEER: Wahl = {
  mappen: new Set(),
  dokumente: new Set(),
  notizen: new Set(),
  historie: new Set(),
  gruende: {},
  erwaehnungen: new Set(),
};

/** Vorgabe: alles an – außer Originalen, zu denen es eine geschwärzte Fassung gibt. */
export function vorgabe(inhalte: Record<string, AuskunftMappe>, ids: string[], w: Wahl = LEER): Wahl {
  const n: Wahl = {
    mappen: new Set(w.mappen),
    dokumente: new Set(w.dokumente),
    notizen: new Set(w.notizen),
    historie: new Set(w.historie),
    gruende: { ...w.gruende },
    erwaehnungen: new Set(w.erwaehnungen),
  };
  for (const id of ids) {
    const x = inhalte[id];
    if (!x) continue;
    n.mappen.add(id);
    n.historie.add(id);
    for (const d of x.dokumente) if (!d.geschwaerzteFassung) n.dokumente.add(d.id);
    for (const auskunftNotiz of x.notizen) n.notizen.add(auskunftNotiz.id);
  }
  return n;
}

/** Die Auswahl für den Server, dazu abgewählte Notizen ohne Grund und die Größe der Dokumente. */
export function auswahlVon(wahl: Wahl, inhalte: Record<string, AuskunftMappe>, vorschau: AuskunftVorschau | null) {
  const gewaehlt = [...wahl.mappen].filter((id) => inhalte[id]);
  const auswahl: AuskunftAuswahl = {
    mappen: gewaehlt,
    dokumente: gewaehlt.flatMap((id) => inhalte[id].dokumente.filter((x) => wahl.dokumente.has(x.id)).map((x) => x.id)),
    notizen: gewaehlt.flatMap((id) => inhalte[id].notizen.filter((x) => wahl.notizen.has(x.id)).map((x) => x.id)),
    historie: gewaehlt.filter((id) => wahl.historie.has(id)),
    ohneNotizen: gewaehlt.flatMap((id) =>
      inhalte[id].notizen.filter((x) => !wahl.notizen.has(x.id)).map((x) => ({ id: x.id, grund: wahl.gruende[x.id] ?? '' })),
    ),
    erwaehnungen: [...wahl.erwaehnungen].filter(
      (id) => !wahl.mappen.has(id) && vorschau?.baum.knoten.some((k) => k.id === id && k.nurBezug),
    ),
  };
  const ohneGrund = auswahl.ohneNotizen.filter((x) => x.grund.trim().length < GRUND_MIN).length;
  const bytes = gewaehlt
    .flatMap((id) => inhalte[id].dokumente)
    .filter((x) => wahl.dokumente.has(x.id))
    .reduce((s, x) => s + x.groesse, 0);
  return { auswahl, ohneGrund, bytes };
}

export function zufallsPasswort() {
  // 32 gut unterscheidbare Zeichen (ohne I, O, 0, 1): 5 Bit je Zeichen per Bitmaske – gleichverteilt, ohne Modulo-Bias; 16 Zeichen = 80 Bit.
  const z = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b]
    .map((x) => z[x & 31])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-');
}
