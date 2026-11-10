import { typName } from '../../../shared/src/beschriftung';
import type { Sicht } from '../../../shared/src/sichten';
import { useDaten } from '../daten';
import { AnsichtSymbol } from '../Symbol';

/**
 * Symbol eines Mappentyps (#1036): das der Ansicht, die genau diesen Typ zeigt – Mappentypen selbst haben keins. Ohne
 * solche Ansicht (oder ohne Symbol daran) keins.
 */
export function typSymbol(sichten: Sicht[], typId: string): string | null {
  return sichten.find((s) => s.typen.length === 1 && s.typen[0] === typId && s.symbol)?.symbol ?? null;
}

/**
 * Mappentyp an einem gewählten Verweis (#1036, Muster A1 „Wert mit Symbol des Mappentyps“): Symbol und Name, damit
 * „Golf“ (Fahrzeug) und „Golf“ (Vertrag) unterscheidbar sind. Nur für Mappen, die die Person sehen darf – bei nicht
 * sichtbaren kennt die Oberfläche den Typ nicht (der Server liefert ihn nicht mit).
 */
export function TypMarke({ typId }: { typId: string | undefined }) {
  const d = useDaten();
  const typ = d.typ(typId);
  if (!typ) return null;
  return <span className="typmarke"><AnsichtSymbol name={typSymbol(d.sichten, typ.id)} /><span>{typName(typ)}</span></span>;
}
