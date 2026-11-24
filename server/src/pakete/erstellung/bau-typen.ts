/**
 * Mappentypen ins Paket (#1278, Schritt 6a; vorher Teil von `baue`): Auswahl, Kennungen, Felder, Register und
 * Anzeige-Bedingungen.
 */
import { standardliste, trefferlistenVon, type Feld, type Mappentyp, type Register } from '../../../../shared/src/model';
import { kreisImStandard } from '../../../../shared/src/nummernkreis';
import { type InstalliertesPaket } from '../../../../shared/src/pakete';
import { SCHLUESSEL, SCHLUESSEL_MAX } from '../../../../shared/src/kennungen';
import type { Bedingung } from '../../../../shared/src/sichten';
import type { Anzeigeregel } from '../../../../shared/src/anzeige';
import { t } from '../../sprache/sprache';
import { BASIS_ABLAGEORT_AB } from '../verwaltung/format';
import { wiederfindenVorgabe } from '../../../../shared/src/erkennung';
import { archivInsPaket } from '../../../../shared/src/archiv';
import { teileVorgabe } from '../../../../shared/src/vorgaben';
import { UMBAU_FELD } from '../../../../shared/src/umbau';
import { frei, mitId, ohneLeere, vorbelegenInsPaket } from './bau-hilfen';
import { abhaengig, ausPaket, type BauLauf, hinweis, ziel } from './bau-lauf';

/** 2. Auswahl: eigene Typen werden exportiert, Paket- und Systemtypen nicht. */
export function eigeneTypen(l: BauLauf): Mappentyp[] {
  const { e, d, typById, typPaket, probleme } = l;
  const eigene: Mappentyp[] = [];
  for (const tid of new Set(e.typen)) {
    const eintrag = typById.get(tid);
    if (!eintrag) {
      probleme.push(t('meldungen.paketerstellung.ein-gewaehlter-mappentyp-existiert'));
      continue;
    }
    const h = typPaket.get(eintrag.id);
    if (d.dmsTypen.get(eintrag.id) === 'ablageort')
      hinweis(l, t('meldungen.paketerstellung.ablageort-aus-basis', { name: eintrag.name, version: BASIS_ABLAGEORT_AB }));
    else if (d.dmsTypen.has(eintrag.id) || eintrag.system)
      hinweis(l, t('meldungen.paketerstellung.bringt-jede-installation-von', { name: eintrag.name }));
    else if (h) ausPaket(l, t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag);
    else eigene.push(eintrag);
  }
  return eigene;
}

/** Kennungen der eigenen Typen im Paket. */
export function vergibTypSchluessel(l: BauLauf, eigene: Mappentyp[]) {
  const { d, schluessel } = l;
  // Paket und Schlüssel stehen getrennt (#1084): die Kennung hat ihre volle Länge, unabhängig von der Paket-Id.
  const max = SCHLUESSEL_MAX;
  const belegtT = new Set<string>();
  // Gemerkte Kennungen zuerst, damit sie über Versionen gleich bleiben (sonst gäbe es beim Update neue Typen).
  for (const t of eigene) {
    const alt = d.entwurf?.schluessel[t.id];
    if (alt && SCHLUESSEL.test(alt) && alt.length <= max && !belegtT.has(alt)) {
      belegtT.add(alt);
      schluessel[t.id] = alt;
    }
  }
  for (const t of eigene) if (!schluessel[t.id]) schluessel[t.id] = frei(t.schluessel || t.name, max, belegtT);
}

/**
 * Anzeigen, wenn … (#1033) fürs Paket: „Verweis zeigt auf eine Mappe vom Typ …“ mit Typverweis statt Id. Eine
 * bestimmte Mappe (Id dieser Installation) kommt nicht mit – das geht erst mit festen Kennungen mitgelieferter Mappen
 * (#1038). Ohne Bedingung bleibt keine Regel.
 */
/** „Zeigt auf“ nur Vorgaben installierter Pakete (#1038)? Dann deren Verweise `paket:schluessel` und die Pakete. */
const vorgabenIn = (l: BauLauf, b: Extract<Bedingung, { art: 'feld' }>): { verweise: string[]; pakete: InstalliertesPaket[] } | null => {
  const { d } = l;
  const ids = b.op === 'zeigtAuf' && b.wert?.art === 'fest' && Array.isArray(b.wert.wert) && !b.bis ? b.wert.wert.map(String) : [];
  const teile = ids.map((x) => teileVorgabe(d.vorgaben?.get(x)));
  const pakete = teile.map((v) => (v ? d.pakete.find((p) => p.id === v.paket) : undefined));
  if (!ids.length || pakete.some((p) => !p)) return null;
  return { verweise: [...new Set(teile.map((v) => `${v!.paket}:${v!.schluessel}`))], pakete: pakete as InstalliertesPaket[] };
};
const anzeigeFuersPaket = (l: BauLauf, r: Anzeigeregel | undefined, wo: string): Anzeigeregel | undefined => {
  if (!r) return undefined;
  const bedingungen = r.bedingungen.flatMap((b): Anzeigeregel['bedingungen'] => {
    if (b.art === 'verweistyp') {
      const z = ziel(l, b.typ, wo);
      return z ? [{ ...b, typ: z }] : [];
    }
    // Vorgaben (#1038): zeigt die Bedingung nur auf Vorgaben installierter Pakete, kommt sie mit deren Kennung – das
    // Paket hängt dann von ihnen ab. Andere Mappen dieser Installation kommen nicht mit.
    const vorgaben = b.art === 'feld' ? vorgabenIn(l, b.bedingung) : null;
    if (b.art === 'feld' && vorgaben) {
      for (const p of vorgaben.pakete) abhaengig(l, p);
      return [
        {
          ...(b.nicht ? { nicht: true } : {}),
          art: 'vorgabe',
          feld: b.bedingung.feld,
          vorgabe: vorgaben.verweise,
        } as unknown as Anzeigeregel['bedingungen'][number],
      ];
    }
    if (b.art === 'feld' && mitId(b.bedingung)) {
      hinweis(l, t('meldungen.paketerstellung.anzeige-mappe', { wo }));
      return [];
    }
    return [b];
  });
  return bedingungen.length ? { modus: r.modus, bedingungen } : undefined;
};

/**
 * Tabelle (#1030) fürs Paket: Typ als Verweis wie bei ziel; Pakete bringen je Typ nur die Standard-Trefferliste mit.
 * Fehlt der Typ im Paket, steht er unter „mit aufnehmen“ (wie bei Verweisen) – ohne ihn gibt es kein Paket.
 */
const tabelleInsPaket = (l: BauLauf, x: Record<string, unknown>, f: Feld, wo: string) => {
  const quelle = f.typ === 'tabelle' ? f.quelle : undefined;
  if (!quelle) return;
  const typ = ziel(l, quelle.typId, wo);
  const quelltyp = l.typById.get(quelle.typId);
  if (quelle.trefferliste && quelltyp && standardliste(quelltyp).key !== quelle.trefferliste)
    hinweis(l, t('meldungen.paketerstellung.tabelle-liste', { wo, name: quelltyp.name }));
  if (typ) x.quelle = ohneLeere({ typ, feld: quelle.feldKey, neu: quelle.neu });
};

/** Ein Feld eines eigenen Typs fürs Paket. */
function feldInsPaket(l: BauLauf, mappentyp: Mappentyp, f: Feld, wo: (was: string) => string): Record<string, unknown> {
  const { typById } = l;
  // ausText (#534) gehört zu einem Update aus der Registry, nicht in ein selbst erstelltes Paket.
  // berechnetVon (#1034) gehört dem Paket mit Code, das den Typ mitbringt – ein selbst erstelltes Paket rechnet nichts.
  const { zielTypen, zielOptional, system: _s, auswahlFilter, frist, standard, ausText: _a, anzeigen, ...rest } = f as Feld;
  delete (rest as Partial<Feld>).berechnetVon;
  // Tabelle (#1030): die Quelle als Typverweis (tabelleInsPaket), nicht mit der Id dieser Installation.
  delete (rest as Partial<Feld>).quelle;
  const x: Record<string, unknown> = ohneLeere(rest as Record<string, unknown>);
  const az = anzeigeFuersPaket(l, anzeigen, wo(`Feld „${f.label}“`));
  if (az) x.anzeigen = az;
  if (f.typ === 'referenz') {
    // Mehrere Zieltypen (#1036): `ziel` einzeln oder als Liste. Optionale Ziele bleiben optional – auch die, die es hier
    // schon gibt; von ihnen soll das Paket nicht abhängen.
    const opt = new Set(zielOptional ?? []);
    const fest = (zielTypen ?? []).filter((id) => !opt.has(typById.get(id)?.schluessel ?? ''));
    const ziele = fest.map((id) => ziel(l, id, wo(`Feld „${f.label}“`))).filter((z): z is string => !!z);
    x.ziel = ziele.length > 1 ? ziele : ziele[0];
    if (opt.size) x.zielOptional = [...opt];
  } else delete x.verweisart;
  if (frist) x.frist = ohneLeere(frist as unknown as Record<string, unknown>);
  if (standard !== undefined && standard !== null && standard !== '') {
    if (kreisImStandard(standard))
      hinweis(
        l,
        `${wo(`Feld „${f.label}“`)}: Der Nummernkreis gehört nicht zum Paketformat. Das Feld kommt ohne Nummernkreis ins Paket; richte ihn beim Empfänger unter Werkbank → Nummernkreise ein und trage ihn am Feld ein.`,
      );
    else if (mitId(standard))
      hinweis(l, `${wo(`Feld „${f.label}“`)}: Der Standardwert zeigt auf eine Mappe dieser Installation und kommt nicht ins Paket.`);
    else x.standard = standard;
  }
  if (auswahlFilter?.length) {
    if (mitId(auswahlFilter))
      hinweis(l, `${wo(`Feld „${f.label}“`)}: Der Auswahlfilter nennt Mappen dieser Installation und kommt nicht ins Paket.`);
    else x.auswahlFilter = auswahlFilter;
  }
  tabelleInsPaket(l, x, f, wo(`Feld „${f.label}“`));
  vorbelegenInsPaket(x, f, mappentyp);
  if (x.ziel === undefined) delete x.ziel;
  // Zum Wiederfinden (#938): Ohne die Angabe leitet Ablago sie bei Feldern mit „Aus Dokument füllen“ ab – ein
  // ausdrückliches false hält fest, dass der Haken hier aus ist.
  if (f.erkennung && !f.wiederfinden && wiederfindenVorgabe(f)) x.wiederfinden = false;
  return x;
}

/** Register eines eigenen Typs fürs Paket. */
function registerInsPaket(l: BauLauf, mappentyp: Mappentyp, felder: Array<Record<string, unknown>>, wo: (was: string) => string) {
  const register = mappentyp.register.map((r: Register) => {
    const quellen = r.quellen
      ?.map((q) => ({ typ: ziel(l, q.typId, wo(`Register „${r.name}“`)), feld: q.feldKey }))
      .filter((q): q is { typ: string; feld: string } => !!q.typ);
    // Abschnitte (#890) und Ausblenden (#655): wie eingestellt; ältere Ablago ignorieren beides.
    const abschnitte =
      r.art === 'felder'
        ? (r.abschnitte ?? [])
            .filter((a) => felder.some((f) => f.key === a.vor))
            .map((a) =>
              ohneLeere({
                vor: a.vor,
                titel: a.titel,
                eingeklappt: a.eingeklappt,
                beschriftungen: a.beschriftungen,
                anzeigen: anzeigeFuersPaket(l, a.anzeigen, wo(`Abschnitt „${a.titel || a.vor}“`)),
              }),
            )
        : [];
    return ohneLeere({
      key: r.key,
      name: r.name,
      art: r.art,
      felder: r.art === 'felder' ? (r.felder ?? []).filter((k) => felder.some((f) => f.key === k)) : undefined,
      quellen,
      versionierung: r.versionierung,
      versionenBehalten: r.versionenBehalten,
      zeigt: r.art === 'protokoll' ? r.zeigt : undefined,
      beschriftungen: r.beschriftungen,
      abschnitte: abschnitte.length ? abschnitte : undefined,
      ausgeblendet: r.ausgeblendet,
    });
  });
  // volltext: false ausdrücklich behalten (Standard ist ja); ohneLeere ließe es weg.
  mappentyp.register.forEach((r, i) => {
    if (r.volltext === false) (register[i] as Record<string, unknown>).volltext = false;
  });
  return register;
}

/** 3. Ein eigener Mappentyp fürs Paket. */
export function typInsPaket(l: BauLauf, mappentyp: Mappentyp) {
  const wo = (was: string) => `„${mappentyp.name}“ → ${was}`;
  // „Übernommen aus“ (#1041) gehört zum Umbau dieser Installation – es kommt nicht ins Paket (wie Rechte-Regeln).
  const eigeneFelder = mappentyp.felder.filter((f) => !f.system && f.key !== UMBAU_FELD);
  for (const f of eigeneFelder.filter((x) => x.berechnetVon))
    hinweis(l, t('meldungen.paketerstellung.berechnet-weg', { wo: wo(`Feld „${f.label}“`) }));
  const felder = eigeneFelder.map((f) => feldInsPaket(l, mappentyp, f, wo));
  const register = registerInsPaket(l, mappentyp, felder, wo);
  const liste = standardliste(mappentyp);
  if (trefferlistenVon(mappentyp).length > 1)
    hinweis(l, t('meldungen.paketerstellung.nur-die-standard-trefferliste', { name: mappentyp.name, name2: liste.name }));
  // Archivmodus (#1051) gehört seit DMS_ARCHIV_PAKET_AB zum Paketformat – als Vorgabe für den neuen Typ beim Empfänger.
  const weg = [
    mappentyp.berechtigungen ? 'Berechtigungen' : '',
    mappentyp.erstellenErlaubt === false || mappentyp.loeschenErlaubt === false
      ? t('meldungen.paketerstellung.anlegen-loeschen-gesperrt')
      : '',
  ].filter(Boolean);
  if (weg.length) hinweis(l, t('meldungen.paketerstellung.gehoeren-nicht-zum-paketformat', { name: mappentyp.name, weg: weg.join(', ') }));
  const archiv = archivInsPaket(
    mappentyp.archiv,
    felder.map((f) => ({ key: String(f.key) })),
  );
  if (mappentyp.archiv?.stichtag && !archiv?.stichtag)
    hinweis(l, t('meldungen.paketerstellung.archiv-ohne-stichtag', { name: mappentyp.name }));
  // Das Schema verlangt beschreibung und felder auch leer.
  return {
    schluessel: l.schluessel[mappentyp.id],
    name: mappentyp.name,
    beschreibung: mappentyp.beschreibung ?? '',
    ...ohneLeere({ titelVorlage: mappentyp.titelVorlage || undefined }),
    felder,
    register,
    ...ohneLeere({ trefferliste: liste.spalten.length ? liste.spalten : undefined }),
    // Beschriftungen je Sprache (#728) – an Feldern stecken sie schon in den Feldangaben.
    ...ohneLeere({ beschriftungen: mappentyp.beschriftungen }),
    // Dokument übernehmen (#937): nur, was eingestellt ist; ältere Ablago ignorieren es.
    ...(typeof mappentyp.ausPost === 'boolean' ? { ausPost: mappentyp.ausPost } : {}),
    ...ohneLeere({ erkennbarAn: mappentyp.erkennbarAn || undefined }),
    // Mehrzahl (#1446): nur, wenn eingetragen (ohneLeere lässt '' weg); ältere Ablago ignorieren sie.
    ...ohneLeere({ mehrzahl: mappentyp.mehrzahl }),
    // Ist Teil einer anderen Mappe (#1031): wie im Entwurf Rechnungen die Kennung des Verweisfelds.
    ...(mappentyp.teilVon && felder.some((f) => f.key === mappentyp.teilVon) ? { gehoertZu: mappentyp.teilVon } : {}),
    // In der allgemeinen Suche zeigen (#1220): nur „nein“ – „ja“ ist die Vorgabe.
    ...(mappentyp.inSuche === false ? { inSuche: false } : {}),
    // Archivmodus (#1051): Schreibweise der Registry; beim Empfänger nur für den neu angelegten Typ.
    ...(archiv ? { archiv } : {}),
  };
}

/** Ein Mappentyp, wie er ins Paket kommt. */
export type PaketTypDaten = ReturnType<typeof typInsPaket>;
