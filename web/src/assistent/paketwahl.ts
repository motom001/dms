import { beruflichBei, PAKET_ORGANISATION, PAKETE_JE_NUTZUNG, type Nutzung } from '../../../shared/src/einrichtungsplan';
import { empfehlungen, paketArt, type Katalog, type KatalogStufe } from '../../../shared/src/pakete';

/**
 * Ablago wählt die Pakete (#1566): nach „Wofür nutzt du Ablago?“ (#1045), der Empfehlung im Katalog (`empfohlen`,
 * #1048) und der Antwort auf „Welche Pakete darf Ablago nutzen?“. Was die Antwort nicht erlaubt, bleibt mit Grund in
 * Worten draußen – nie kommt ein Paket über die Grenze in die Auswahl. Nur bei der Einrichtung und nur aus dem
 * offiziellen, signierten Katalog; später kommt kein Paket von selbst dazu.
 */

/** Ein Paket, das Ablago nicht vorschlägt, mit dem Grund in einem Satz. */
export interface NichtDabei {
  id: string;
  grund: string;
}

export function vorschlag(
  k: Katalog,
  stufen: readonly KatalogStufe[],
  o: { nutzung: Nutzung | null; organisation: boolean; dms: string; installiert: Array<{ id: string }> },
): { ids: string[]; nicht: NichtDabei[] } {
  const beruflich = !!o.nutzung && beruflichBei(o.nutzung);
  const kandidaten = [
    ...(o.organisation ? [PAKET_ORGANISATION] : []),
    ...(o.nutzung ? PAKETE_JE_NUTZUNG[o.nutzung] : []),
    ...empfehlungen(k, { beruflich, dms: o.dms, installiert: o.installiert }).map((p) => p.id),
  ];
  const ids: string[] = [];
  const nicht: NichtDabei[] = [];
  for (const id of new Set(kandidaten)) {
    const p = k.pakete.find((x) => x.id === id);
    if (!p || paketArt(p, o.dms) !== 'paket' || o.installiert.some((x) => x.id === id)) continue;
    const st = stufen.find((x) => x.id === id);
    // Ohne Einordnung (älterer Server, Paket fehlt in der Antwort) schlägt Ablago nichts vor – lieber zu wenig als zu viel.
    if (st?.erlaubt) ids.push(id);
    else nicht.push({ id, grund: st?.grund ?? '' });
  }
  return { ids, nicht: nicht.filter((n) => n.grund) };
}

/** Für „Selbst auswählen“: Pakete, die die Antwort nicht erlaubt, mit dem Grund (ausgegraut in der Auswahl). */
export function gesperrteAus(stufen: readonly KatalogStufe[]): Record<string, string> {
  return Object.fromEntries(stufen.filter((x) => !x.erlaubt).map((x) => [x.id, x.grund ?? '']));
}

/** Der erste Satz einer Beschreibung – je Paket ein Satz in Ablagos Auswahl. */
export function ersterSatz(text: string): string {
  const t = text.trim();
  const ende = t.search(/[.!?](\s|$)/);
  return ende < 0 ? t : t.slice(0, ende + 1);
}

/** Host einer Adresse für „Schickt Daten an …“; Ungültiges bleibt, wie es ist. */
export function zielName(adresse: string): string {
  try {
    return new URL(adresse).host || adresse;
  } catch {
    return adresse;
  }
}
