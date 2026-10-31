import { api, type Fundstelle } from '../api';
import { Link } from '../ort';
import { pruefwert } from '../pruefwert';
import { titelOder } from '../seiten';

/**
 * Doppelte Dateien erkennen (#333): vor dem Hochladen den Prüfwert im Browser rechnen und fragen,
 * wo die Datei schon liegt. Der Server nennt nur Mappen, die der Benutzer lesen darf.
 */

/** Prüfwerte rechnen und auf einmal nachfragen; Ergebnis je Datei (nur Dateien mit Fundstellen). */
export async function fundstellenFuer<T extends { datei: File }>(liste: T[], ohneMappe?: string): Promise<Map<T, Fundstelle[]>> {
  const erg = new Map<T, Fundstelle[]>();
  const mitWert: Array<[T, string]> = [];
  for (const x of liste) {
    if (!x.datei.size || x.datei.size > 100 * 1024 * 1024) continue;
    try { mitWert.push([x, await pruefwert(x.datei)]); } catch { /* nicht lesbar: ohne Hinweis hochladen */ }
  }
  if (!mitWert.length) return erg;
  try {
    const { fundstellen } = await api.gleicheDateien([...new Set(mitWert.map(([, w]) => w))].slice(0, 100), ohneMappe);
    for (const [x, w] of mitWert) if (fundstellen[w]?.length) erg.set(x, fundstellen[w]);
  } catch { /* Prüfung ist eine Hilfe – ohne sie geht das Hochladen normal weiter */ }
  return erg;
}

const tag = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** „Diese Datei liegt schon in Stromvertrag Haus (Register Dokumente, hochgeladen am …).“ */
export function Fundstellen({ f, beiKlick }: { f: Fundstelle[]; beiKlick?: () => void }) {
  return (
    <span className="doppelt klein">
      Diese Datei liegt schon in{' '}
      {f.map((x, i) => (
        <span key={`${x.mappeId}-${i}`} onClick={beiKlick}>{i > 0 && (i === f.length - 1 ? ' und ' : ', ')}
          <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.titel)}</Link>
          {' '}<span className="leise">({x.typ ? `${x.typ}, ` : ''}Register {x.register}, „{x.name}“, hochgeladen am {tag(x.erstellt)})</span>
        </span>
      ))}.
    </span>
  );
}
