/**
 * Optionale Ziele (#1036, #1122) beim Löschen eines Mappentyps (#1521): Verschwindet ein Typ, der an einem Verweisfeld
 * nur als optionales Ziel (`zielOptional`, „paket:schluessel“) stand – etwa weil sein Paket entfernt wird –, zeigen
 * Bedingungen „Anzeigen, wenn …“ an Feldern und Abschnitten danach auf die Kennung statt auf die Id. So gilt die
 * Bedingung als „wartet auf das Paket“ (trifft nie zu) statt als Fehler, der jedes Speichern des Typs verhindert;
 * kommt das Paket wieder, nimmt Ablago das Ziel wie beim ersten Mal auf.
 */
import type { Anzeigebedingung, Anzeigeregel, Feld, Mappentyp } from '../../../shared/src/model';

/** Zeigt die Bedingung über ein Feld, das `kennung` als optionales Ziel hat, auf den Typ `id`? Dann auf die Kennung. */
function bedingungZurueck(b: Anzeigebedingung, felder: Feld[], id: string, kennung: string): Anzeigebedingung {
  const optional = (feld: string) => !!felder.find((f) => f.key === feld)?.zielOptional?.includes(kennung);
  if (b.art === 'verweistyp') return b.typ === id && optional(b.feld) ? { ...b, typ: kennung } : b;
  if (b.art !== 'feld' || b.bedingung.op !== 'zeigtAufTyp' || !optional(b.bedingung.feld)) return b;
  const w = b.bedingung.wert;
  if (w?.art !== 'fest' || !Array.isArray(w.wert) || !w.wert.includes(id)) return b;
  const wert = [...new Set(w.wert.map((x) => (x === id ? kennung : x)))];
  return { ...b, bedingung: { ...b.bedingung, wert: { ...w, wert } } };
}

function regelZurueck(r: Anzeigeregel | undefined, felder: Feld[], id: string, kennung: string): Anzeigeregel | undefined {
  if (!r) return r;
  const bedingungen = r.bedingungen.map((b) => bedingungZurueck(b, felder, id, kennung));
  return bedingungen.some((b, i) => b !== r.bedingungen[i]) ? { ...r, bedingungen } : r;
}

/** Felder und Register eines Typs mit Bedingungen auf die Kennung statt auf `id`; unverändert, wo nichts passt (oder ohne Kennung). */
export function optionalesZielWieder(
  typ: Pick<Mappentyp, 'felder' | 'register'>,
  id: string,
  kennung: string | undefined,
): Pick<Mappentyp, 'felder' | 'register'> {
  if (!kennung) return { felder: typ.felder, register: typ.register };
  const felder = typ.felder.map((f) => {
    const anzeigen = regelZurueck(f.anzeigen, typ.felder, id, kennung);
    return anzeigen === f.anzeigen ? f : { ...f, anzeigen };
  });
  const register = typ.register.map((r) => {
    if (!r.abschnitte?.length) return r;
    const abschnitte = r.abschnitte.map((a) => {
      const x = regelZurueck(a.anzeigen, typ.felder, id, kennung);
      return x === a.anzeigen ? a : { ...a, anzeigen: x };
    });
    return abschnitte.every((a, i) => a === r.abschnitte![i]) ? r : { ...r, abschnitte };
  });
  return { felder, register };
}
