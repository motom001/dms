/**
 * Was ein Update einem vorhandenen Typ hinzufügt (Erkennung, Wiederfinden, vorbelegen, Format, Beschriftungen …).
 */
import { liesFeldErkennung, liesWiederfinden, wiederfindenVorgabe, type FeldErkennung } from '../../../../shared/src/erkennung';
import { istDatumsgrenze, istFeldformat } from '../../../../shared/src/feldformate';
import { type Abschnitt, type Feld, type Mappentyp, type Register } from '../../../../shared/src/model';
import { bereinigeAbschnitte } from '../../../../shared/src/darstellung';
import { ergaenzeBeschriftungen, type AbschnittTeile, type Beschriftungen } from '../../../../shared/src/beschriftung';
import { istObjekt, type PaketFeld, type PaketTyp } from './format';

/**
 * Berechnete Felder nach einem Update (#1034): je vorhandenem Feld des Typs, dessen Angabe sich ändert, die neue –
 * die Paket-Id (jetzt berechnet) oder null (berechnet das Paket nicht mehr; der letzte Wert bleibt, das Feld ist frei).
 * Felder, die ein anderes Paket berechnet, und Felder, die das Paket nicht (mehr) nennt, bleiben, wie sie sind.
 */
export function berechnetAenderung(
  t: Pick<PaketTyp, 'felder'>,
  aktuell: Pick<Mappentyp, 'felder'>,
  paketId: string,
): Map<string, string | null> {
  const r = new Map<string, string | null>();
  for (const g of aktuell.felder) {
    const f = t.felder.find((x) => x.key === g.key);
    if (!f) continue;
    if (f.berechnet === true && g.berechnetVon !== paketId && !g.berechnetVon) r.set(g.key, paketId);
    else if (f.berechnet !== true && g.berechnetVon === paketId) r.set(g.key, null);
  }
  return r;
}

/**
 * Übernahme beim Umbau (#1476): Felder des übernommenen Typs, die bisher ein anderes Paket berechnet und die das
 * aufnehmende Paket selbst als berechnet mitbringt (`berechnetVon` = seine Id in den Daten des Pakets) – sie gehören
 * danach ihm. Sonst bliebe die Angabe beim abgebenden Paket, und das neue Paket dürfte die Werte nicht schreiben.
 */
export function berechnetUebernommen(daten: { felder?: unknown }, alt: Pick<Mappentyp, 'felder'>, paketId: string): string[] {
  const neu = Array.isArray(daten.felder) ? (daten.felder as Array<Partial<Feld>>) : [];
  return alt.felder
    .filter((g) => g.berechnetVon && g.berechnetVon !== paketId && neu.some((f) => f.key === g.key && f.berechnetVon === paketId))
    .map((g) => g.key);
}

/** Felder, die das Paket für die Erkennung markiert und die im DMS (gleiche Kennung, gleiche Feldart) noch ohne Einstellung sind (#336). */
export function erkennungNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'felder'>,
): Array<{ key: string; label: string; erkennung: FeldErkennung }> {
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    const e = liesFeldErkennung(f.erkennung, f.typ);
    return g && e && !g.erkennung ? [{ key: g.key, label: g.label, erkennung: e }] : [];
  });
}

/**
 * „Zum Wiederfinden nutzen“ (#938) für ein neues Feld: die Angabe des Pakets – fehlt sie (Paket kennt den Haken noch
 * nicht), wie bisher bei Feldern „für die Erkennung“ mit Merkmalsart (wiederfindenVorgabe).
 */
export const wiederfindenAus = (f: PaketFeld): boolean =>
  'wiederfinden' in f ? liesWiederfinden(f.wiederfinden, f.typ) : wiederfindenVorgabe(f);

/** Felder, die das Paket ausdrücklich „zum Wiederfinden“ markiert und die im DMS (gleiche Kennung und Feldart) den Haken noch nicht haben (#938). */
export function wiederfindenNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>): Array<{ key: string; label: string }> {
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    return g && liesWiederfinden(f.wiederfinden, f.typ) && !g.wiederfinden ? [{ key: g.key, label: g.label }] : [];
  });
}

/**
 * Beim Auswählen übernehmen (#1037) bei einem Update: Paare des Pakets an vorhandenen Verweisfeldern (gleiche Kennung),
 * an denen der Administrator noch keine eingestellt hat – nur Paare, deren Zielfeld es danach gibt.
 */
export function vorbelegenNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'felder'>,
): Array<{ key: string; label: string; vorbelegen: NonNullable<Feld['vorbelegen']> }> {
  const danach = new Set([...vorhanden.felder.map((f) => f.key), ...t.felder.map((f) => f.key)]);
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === 'referenz');
    const paare = (f.vorbelegen ?? []).filter((p) => danach.has(p.nach));
    return f.typ === 'referenz' && g && !g.vorbelegen?.length && paare.length ? [{ key: g.key, label: g.label, vorbelegen: paare }] : [];
  });
}

/**
 * Angaben am Typ (#937), die das Paket vorgibt und die der Administrator noch nicht eingestellt hat – ebenso „In der
 * allgemeinen Suche zeigen“ (#1220). „Ist Teil einer anderen Mappe“ (#1031) genauso: Ein Update schaltet es ein, wenn
 * das Feld da ist und der Typ eigenständig ist; aus schaltet es nur der Administrator.
 */
export function typAngabenNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'ausPost' | 'erkennbarAn' | 'teilVon' | 'felder' | 'inSuche'>,
): { ausPost?: boolean; erkennbarAn?: string; teilVon?: string; inSuche?: boolean } {
  return {
    ...(typeof t.ausPost === 'boolean' && (vorhanden.ausPost ?? null) === null ? { ausPost: t.ausPost } : {}),
    ...(typeof t.inSuche === 'boolean' && (vorhanden.inSuche ?? null) === null ? { inSuche: t.inSuche } : {}),
    ...(t.erkennbarAn && !vorhanden.erkennbarAn ? { erkennbarAn: t.erkennbarAn } : {}),
    ...(t.gehoertZu && !vorhanden.teilVon && vorhanden.felder.some((f) => f.key === t.gehoertZu && f.typ === 'referenz')
      ? { teilVon: t.gehoertZu }
      : {}),
  };
}

/**
 * Formate und Datumsgrenzen (#535), die das Paket an Feldern vorgibt und die im DMS (gleiche Kennung, gleiche Feldart)
 * noch fehlen – nur, wo der Administrator weder Format noch Grenzen eingestellt hat. Gespeicherte Werte bleiben gültig.
 */
export function formatNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'felder'>,
): Array<{ key: string; label: string; vorgaben: Partial<Feld> }> {
  return t.felder.flatMap((f): Array<{ key: string; label: string; vorgaben: Partial<Feld> }> => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    if (!g) return [];
    if (f.typ === 'text' && istFeldformat(f.format) && !g.format) {
      // Das Land-Feld gibt es schon – oder das Update bringt es mit (z. B. Haus 1.1.0).
      const land =
        f.format === 'plz' &&
        f.landFeld &&
        (vorhanden.felder.some((x) => x.key === f.landFeld) || t.felder.some((x) => x.key === f.landFeld))
          ? { landFeld: f.landFeld }
          : {};
      return [{ key: g.key, label: g.label, vorgaben: { format: f.format, ...land } }];
    }
    if (f.typ === 'datum' && (istDatumsgrenze(f.min) || istDatumsgrenze(f.max)) && g.min == null && g.max == null) {
      return [
        {
          key: g.key,
          label: g.label,
          vorgaben: { ...(istDatumsgrenze(f.min) ? { min: f.min } : {}), ...(istDatumsgrenze(f.max) ? { max: f.max } : {}) },
        },
      ];
    }
    // Negative Beträge (#1035): Ein Update darf sie erlauben (lockert nur), nie wieder verbieten.
    if (f.typ === 'betrag' && f.negativ === true && !g.negativ) return [{ key: g.key, label: g.label, vorgaben: { negativ: true } }];
    return [];
  });
}

/**
 * Beschriftungen eines Paket-Updates (#728) für einen vorhandenen Typ: fehlende je Sprache, Teil und Option ergänzen –
 * am Typ, an vorhandenen Feldern und Registern. Was der Administrator schon beschriftet hat, bleibt. Optionen nur für
 * feste Werte, die es im Feld gibt; neue Felder bringen ihre Beschriftungen ohnehin mit.
 */
export function beschriftungenNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'beschriftungen' | 'felder' | 'register'>,
): { typ: Pick<Mappentyp, 'beschriftungen' | 'felder' | 'register'>; anzahl: number } {
  let anzahl = 0;
  const texte = (b: unknown): number =>
    typeof b === 'string' ? 1 : b && typeof b === 'object' ? Object.values(b).reduce((n: number, x) => n + texte(x), 0) : 0;
  const misch = <T extends object>(
    alt: Beschriftungen<T> | undefined,
    neu: unknown,
    optionen?: string[],
  ): Beschriftungen<T> | undefined => {
    if (!istObjekt(neu)) return alt;
    // Nur gültige Sprachen und Texte; Optionen nur für vorhandene feste Werte.
    const sauber = Object.fromEntries(
      Object.entries(neu)
        .filter(([spr, x]) => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(spr) && istObjekt(x))
        .map(([spr, x]) => [
          spr,
          Object.fromEntries(
            Object.entries(x as Record<string, unknown>).flatMap(([k, v]): Array<[string, unknown]> => {
              if (k === 'optionen')
                return istObjekt(v) && optionen
                  ? [
                      [
                        k,
                        Object.fromEntries(Object.entries(v).filter(([w, y]) => optionen.includes(w) && typeof y === 'string' && y.trim())),
                      ],
                    ]
                  : [];
              return typeof v === 'string' && v.trim() && spr !== 'de' ? [[k, v.trim()]] : [];
            }),
          ),
        ]),
    );
    const erg = ergaenzeBeschriftungen<T>(alt, sauber as Beschriftungen<T>);
    anzahl += texte(erg) - texte(alt);
    return erg;
  };
  const beschriftungen = misch(vorhanden.beschriftungen, t.beschriftungen);
  const felder = vorhanden.felder.map((f) => {
    const pf = t.felder.find((x) => x.key === f.key) as (PaketFeld & { beschriftungen?: unknown }) | undefined;
    const b = misch(f.beschriftungen, pf?.beschriftungen, f.typ === 'auswahl' ? f.optionen : undefined);
    return b ? { ...f, beschriftungen: b } : f;
  });
  const register = vorhanden.register.map((r) => {
    const pr = t.register.find((x) => x.key === r.key);
    const b = misch(r.beschriftungen, pr?.beschriftungen);
    // Abschnitte (#890): Überschriften in weiteren Sprachen, solange die deutsche noch die des Pakets ist.
    const pa = Array.isArray(pr?.abschnitte) ? (pr.abschnitte as unknown[]).filter(istObjekt) : [];
    const abschnitte = r.abschnitte?.map((a) => {
      const q = pa.find((x) => x.vor === a.vor && typeof x.titel === 'string' && x.titel.trim() === a.titel);
      const ab = q ? misch<AbschnittTeile>(a.beschriftungen, q.beschriftungen) : a.beschriftungen;
      return ab ? { ...a, beschriftungen: ab } : a;
    });
    return { ...r, ...(b ? { beschriftungen: b } : {}), ...(abschnitte ? { abschnitte } : {}) };
  });
  return { typ: { ...(beschriftungen ? { beschriftungen } : {}), felder, register }, anzahl };
}

/**
 * Abschnitte (#890), die ein Update an vorhandenen Feldregistern ergänzt: nur, wo das Register noch keine hat (wie bei
 * Erkennung und Formaten, „Updates ändern nichts heimlich“). `felder` = die Felder des Registers nach dem Update.
 */
export function abschnitteNeu(
  t: PaketTyp,
  vorhanden: Pick<Mappentyp, 'register'>,
  felderNach: (r: Register) => string[] = (r) => r.felder ?? [],
): Array<{ key: string; name: string; abschnitte: Abschnitt[] }> {
  return vorhanden.register.flatMap((r) => {
    if (r.art !== 'felder' || r.abschnitte?.length) return [];
    const pr = t.register.find((x) => x.key === r.key && x.art === 'felder');
    const a = bereinigeAbschnitte(pr?.abschnitte, felderNach(r));
    return a?.length ? [{ key: r.key, name: r.name, abschnitte: a }] : [];
  });
}

/** Felder, die ein Update einem vorhandenen Feldregister hinzufügt (neu im Typ, laut Paket auf diesem Register). */
export function neueFelderAuf(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>, r: Pick<Register, 'key' | 'art'>): string[] {
  if (r.art !== 'felder') return [];
  return (t.register.find((x) => x.key === r.key)?.felder ?? []).filter(
    (k) => !vorhanden.felder.some((g) => g.key === k) && t.felder.some((f) => f.key === k),
  );
}
