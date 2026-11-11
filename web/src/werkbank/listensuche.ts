/**
 * Worin die Listen der Werkbank suchen (#978): je Eintrag die Fundquellen für den Baustein Suche (`useListenSuche`).
 * Bereichsnamen kommen aus der Sprachdatei; die Fundstelle zeigt sie so, wie man sie im Editor wiederfindet
 * („Feld „Kündigen bis“ · Hilfetext“, „Register „Zahlungen““).
 */
import type { NummernkreisAnsicht } from '../api';
import { feldHilfe, feldLabel, listenName, registerName, typBeschreibung, typName } from '../../../shared/src/beschriftung';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import type { Fundquelle } from '../../../shared/src/listensuche';
import { trefferlistenVon, type Mappentyp } from '../../../shared/src/model';
import { regelwerkVon } from '../../../shared/src/rechte';
import { typenDerSicht, zeigtAlleTypen, type Sicht } from '../../../shared/src/sichten';
import { uebergeordneterTyp } from '../../../shared/src/teile';
import { t } from '../sprache';

type Pakete = readonly Pick<InstalliertesPaket, 'id' | 'name' | 'typen' | 'sichten'>[];

/** Paket, aus dem ein Mappentyp stammt: das installierte Paket, das ihn mitgebracht hat, sonst der Teil vor „:“ der Kennung (#1084). */
export function paketVonTyp(typ: Pick<Mappentyp, 'id' | 'paket'>, pakete: Pakete): string | null {
  return pakete.find((p) => Object.values(p.typen).includes(typ.id))?.id ?? typ.paket ?? null;
}
/** Paket, aus dem eine Ansicht stammt. */
export function paketVonSicht(s: Pick<Sicht, 'id'>, pakete: Pakete): string | null {
  return pakete.find((p) => Object.values(p.sichten).includes(s.id))?.id ?? null;
}
/**
 * Nummernkreise gehören nicht zum Paketformat: Sie zählen zum Paket des Mappentyps, dessen Feld sie nutzt (das erste
 * mit Paket); ohne solches Feld sind sie eigene.
 */
export function paketVonKreis(k: Pick<NummernkreisAnsicht, 'verwendet'>, typen: readonly Mappentyp[], pakete: Pakete): string | null {
  for (const v of k.verwendet) {
    const typ = typen.find((x) => x.id === v.typId);
    const p = typ ? paketVonTyp(typ, pakete) : null;
    if (p) return p;
  }
  return null;
}
/** Name eines Pakets zum Anzeigen (unbekannte Id: die Id selbst). */
export const paketName = (id: string, pakete: Pakete) => pakete.find((p) => p.id === id)?.name ?? id;
/** Pakete für den Filter: die Ids, die in der Liste vorkommen, mit Namen, nach Namen sortiert. */
export const paketWahl = (ids: readonly string[], pakete: Pakete) =>
  ids.map((id) => ({ id, name: paketName(id, pakete) })).sort((a, b) => a.name.localeCompare(b.name));

const q = (wo: string, text: string | null | undefined): Fundquelle[] => (text ? [{ wo, text }] : []);

/**
 * Mappentyp (#978): Name, Beschreibung, Felder (Bezeichnung, Hilfetext), Trefferlisten, Register, Berechtigungen
 * (Name der Regel, Benutzer in Bedingungen), Paket, übergeordneter Typ (#1031) und das Systemkennzeichen.
 */
export function quellenTyp(typ: Mappentyp, o: { pakete: Pakete; typen: readonly Mappentyp[]; person(id: string): string }): Fundquelle[] {
  const p = paketVonTyp(typ, o.pakete);
  const eltern = uebergeordneterTyp(typ);
  const elternTyp = eltern ? o.typen.find((x) => x.id === eltern) : undefined;
  const typname = typName(typ);
  return [
    { wo: '', text: typ.name, titel: true },
    ...(typname !== typ.name ? q(t('werkbank.listensuche.name'), typname) : []),
    ...(typ.system ? q(t('werkbank.listensuche.system'), t('werkbank.werkbank.system')) : []),
    ...q(t('werkbank.listensuche.beschreibung'), typBeschreibung(typ)),
    ...typ.felder.flatMap((f) => [...q(t('werkbank.listensuche.feld'), feldLabel(f)), ...q(t('werkbank.listensuche.feld.hilfe', { name: feldLabel(f) }), feldHilfe(f))]),
    ...(typ.trefferlisten ?? []).flatMap((l) => q(t('werkbank.listensuche.trefferliste'), listenName(l))),
    ...typ.register.flatMap((r) => q(t('werkbank.listensuche.register'), registerName(r))),
    ...regelwerkVon(typ).regeln.flatMap((r) => [
      ...q(t('werkbank.listensuche.regel'), r.name),
      ...r.wenn.flatMap((b) => (b.art === 'benutzer' ? b.benutzer.flatMap((id) => q(t('werkbank.listensuche.regel.benutzer', { name: r.name }), o.person(id))) : [])),
    ]),
    ...(p ? q(t('werkbank.listensuche.paket'), paketName(p, o.pakete)) : []),
    ...(elternTyp ? q(t('werkbank.listensuche.gehoert-zu'), typName(elternTyp)) : []),
  ];
}

/** Ansicht (#978): Name, Beschreibung, Mappentypen, Spalten der Trefferliste und Filterbedingungen (Feld- und Registernamen), Paket. */
export function quellenSicht(s: Sicht, o: { pakete: Pakete; typen: readonly Mappentyp[] }): Fundquelle[] {
  const typen = typenDerSicht(s, o.typen.map((x) => x.id)).map((id) => o.typen.find((x) => x.id === id)).filter((x): x is Mappentyp => !!x);
  const feld = (key: string) => { for (const ty of typen) { const f = ty.felder.find((x) => x.key === key); if (f) return feldLabel(f); } return ''; };
  const register = (key: string) => { for (const ty of typen) { const r = ty.register.find((x) => x.key === key); if (r) return registerName(r); } return ''; };
  const liste = s.trefferliste ? typen.map((ty) => trefferlistenVon(ty).find((l) => l.key === s.trefferliste)).find(Boolean) : undefined;
  const p = paketVonSicht(s, o.pakete);
  return [
    { wo: '', text: s.name, titel: true },
    ...q(t('werkbank.listensuche.beschreibung'), s.beschreibung),
    ...(zeigtAlleTypen(s) ? [] : typen.flatMap((ty) => q(t('werkbank.listensuche.mappentyp'), typName(ty)))),
    ...(liste ? [...q(t('werkbank.listensuche.trefferliste'), listenName(liste)), ...liste.spalten.flatMap((k) => q(t('werkbank.listensuche.spalte'), feld(k)))] : []),
    ...s.bedingungen.flatMap((b) => (b.art === 'feld' || (b.art === 'frist' && b.feld) ? q(t('werkbank.listensuche.bedingung'), feld(b.feld!))
      : b.art === 'dokumente' || b.art === 'verknuepfungen' ? q(t('werkbank.listensuche.bedingung'), register(b.register)) : [])),
    ...(p ? q(t('werkbank.listensuche.paket'), paketName(p, o.pakete)) : []),
  ];
}

/** Nummernkreis (#978): Name, Kennung, Muster, Mappentyp und Feld, die ihn nutzen, Paket. */
export function quellenKreis(k: NummernkreisAnsicht, o: { pakete: Pakete; typen: readonly Mappentyp[] }): Fundquelle[] {
  const p = paketVonKreis(k, o.typen, o.pakete);
  return [
    { wo: '', text: k.name, titel: true },
    ...q(t('werkbank.listensuche.kennung'), k.schluessel),
    ...q(t('werkbank.listensuche.muster'), k.muster),
    ...k.verwendet.flatMap((v) => [...q(t('werkbank.listensuche.mappentyp'), v.typ), ...q(t('werkbank.listensuche.feld.in', { name: v.typ }), v.feld)]),
    ...(p ? q(t('werkbank.listensuche.paket'), paketName(p, o.pakete)) : []),
  ];
}
