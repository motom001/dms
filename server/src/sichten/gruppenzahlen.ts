import { ansichtAbschnitte } from '../../../shared/src/ansichtwahl';
import type { Klausel, Sicht } from '../../../shared/src/sichten';

/**
 * Zahl hinter einer Gruppe der Ansichtswahl (#1623): die verschiedenen Mappen in allen Ansichten der Gruppe, nicht die
 * Zahl der Ansichten und keine Summe (Ansichten überschneiden sich, „Post“ enthält „Eingegangen“).
 *
 * Die Klauseln einer Ansicht sind eine Oder-Liste und enthalten schon ihre Unteransichten. Eine Gruppe mit einer
 * obersten Ansicht hat also genau deren Zahl – keine Zählung mehr. Nur Gruppen aus mehreren obersten Ansichten
 * („Weitere Ansichten“) brauchen eine eigene Spalte: die Klauseln dieser Ansichten zusammen, gezählt im selben Lauf
 * wie die Ansichten. Gruppiert wird wie in der Auswahl, ohne die festen Einträge (Neue Post, Favoriten); was jemand
 * für sich ausblendet, kennt der Server nicht.
 */
export function gruppenZaehlung(sichten: Sicht[], klauseln: Klausel[][], ohne: string[]) {
  const stelle = new Map(sichten.map((s, i) => [s.id, i] as const));
  const wieAnsicht: Array<{ gruppe: string; sicht: string }> = [];
  const eigene: Array<{ gruppe: string; k: Klausel[] }> = [];
  for (const g of ansichtAbschnitte(sichten, { ohne }).gruppen) {
    const oben = g.eintraege.filter((e) => e.tiefe === 0).map((e) => e.sicht.id);
    if (oben.length === 1) wieAnsicht.push({ gruppe: g.schluessel, sicht: oben[0] });
    else eigene.push({ gruppe: g.schluessel, k: oben.flatMap((id) => klauseln[stelle.get(id)!]) });
  }
  return { wieAnsicht, eigene };
}
