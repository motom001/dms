/**
 * `baue`: reine Funktion (testbar ohne DMS), die aus Eingabe und Stand das Paket samt Prüfung baut.
 */
import { stringify } from 'yaml';
import { istLeer, standardliste, trefferlistenVon, type Feld, type Mappentyp, type Register } from '../../../../shared/src/model';
import { kreisImStandard } from '../../../../shared/src/nummernkreis';
import {
  ALLE_TYPEN,
  BEISPIEL_ENDUNGEN,
  BEREICH,
  DMS_ALIAS,
  inMB,
  PAKET_ID,
  VERSION,
  WORTLISTEN_MAX,
  vergleicheVersion,
  type InstalliertesPaket,
} from '../../../../shared/src/pakete';
import { liesWortgruppe } from '../../../../shared/src/suche';
import { SCHLUESSEL, SCHLUESSEL_MAX, typKennung } from '../../../../shared/src/kennungen';
import {
  BESCHREIBUNG_LAENGE,
  GITHUB,
  istFreieLizenz,
  KEINE_LIZENZ,
  LIZENZEN,
  LIZENZNAME_LAENGE,
  LIZENZTEXT_MAX,
  lizenzVerweis,
  NAME_LAENGE,
  naechsteVersion,
  naechsteVersionen,
  type PaketErstellenEingabe,
  type VersionsLage,
} from '../../../../shared/src/paketerstellung';
import type { Bedingung, Sicht, WertAngabe } from '../../../../shared/src/sichten';
import type { Anzeigeregel } from '../../../../shared/src/anzeige';
import { t } from '../../sprache';
import { LIZENZTEXTE } from '../../lizenztexte';
import { ARCHIV_MAX } from '../verwaltung/zip-lesen';
import { BASIS_ABLAGEORT_AB, DMS_TYPEN, type FremderTyp } from '../verwaltung/format';
import { beispielDateiart } from '../verwaltung/beispiele';
import { wiederfindenVorgabe } from '../../../../shared/src/erkennung';
import { archivInsPaket } from '../../../../shared/src/archiv';
import { teileVorgabe } from '../../../../shared/src/vorgaben';
import { UMBAU_FELD } from '../../../../shared/src/umbau';
import { gebietsschema } from '../../../../shared/src/sprache';
import {
  aenderung,
  aenderungsText,
  type Bau,
  erkenneArt,
  type ErstellenDaten,
  frei,
  mitId,
  ohneLeere,
  untergrenze,
  vorbelegenInsPaket,
  zelle,
} from './bau-hilfen';
import { automatisierungenInsPaket, rundgaengeInsPaket, tippsInsPaket } from './ins-paket';
import { bekannteVersion, DMS_ANGABE, dmsOptionen, type MindestFunktion, mindestversion } from './mindestversion';

/**
 * Baut das Paket: prüft die Auswahl und die Angaben, löst Verweise auf und erzeugt die Dateien.
 * Gibt immer ein Ergebnis zurück; `probleme` bzw. nötige `fehlend` verhindern den Export.
 */
export function baue(e: PaketErstellenEingabe, d: ErstellenDaten): Bau {
  const probleme: string[] = [];
  const hinweise: string[] = [];
  const fehlend: Bau['fehlend'] = [];
  const abh: Record<string, string> = {};
  const typById = new Map(d.typen.map((t) => [t.id, t] as const));
  const sichtById = new Map(d.sichten.map((s) => [s.id, s] as const));
  const id = e.id.trim();

  // Herkunft: welche Typen und Ansichten gehören zu einem installierten Paket?
  const typPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  const sichtPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  for (const p of d.pakete) {
    for (const [s, tid] of Object.entries(p.typen)) typPaket.set(tid, { p, s });
    for (const [s, sid] of Object.entries(p.sichten)) sichtPaket.set(sid, { p, s });
  }
  const geaendert = (t: Mappentyp) => {
    const h = typPaket.get(t.id);
    return !!h && aenderung(t, h.p, (id) => typById.get(id)?.schluessel).geaendert;
  };
  const einmal = new Set<string>();
  const hinweis = (h: string) => {
    if (!einmal.has(h)) {
      einmal.add(h);
      hinweise.push(h);
    }
  };
  const abhaengig = (p: InstalliertesPaket) => {
    const b = `>=${p.version}`;
    if (!abh[p.id] || vergleicheVersion(p.version, untergrenze(abh[p.id]) ?? '0.0.0') > 0) abh[p.id] = b;
  };
  const ausPaket = (art: string, name: string, p: InstalliertesPaket, eintrag?: Mappentyp) => {
    abhaengig(p);
    hinweis(t('meldungen.paketerstellung.kommt-aus-dem-paket', { art, name, name2: p.name, id: p.id, version: p.version }));
    if (eintrag && geaendert(eintrag))
      hinweis(t('meldungen.paketerstellung.aenderungen-an-gehoeren-nicht', { name: eintrag.name, name2: p.name }));
  };

  // 1. Angaben
  if (!PAKET_ID.test(id)) probleme.push(t('meldungen.paketerstellung.id-nur-kleinbuchstaben-ziffern'));
  else if (id === 'dms') probleme.push(t('meldungen.paketerstellung.id-dms-ist-fuer'));
  else if (d.pakete.some((p) => p.id === id)) probleme.push(t('meldungen.paketerstellung.id-das-paket-ist', { id }));
  const name = e.name.trim();
  if (name.length < NAME_LAENGE.min || name.length > NAME_LAENGE.max)
    probleme.push(t('meldungen.paketerstellung.name-bis-zeichen', { min: NAME_LAENGE.min, max: NAME_LAENGE.max }));
  if (!VERSION.test(e.version.trim())) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  const beschreibung = e.beschreibung.trim().replace(/\s+/g, ' ');
  if (beschreibung.length < BESCHREIBUNG_LAENGE.min || beschreibung.length > BESCHREIBUNG_LAENGE.max)
    probleme.push(
      t('meldungen.paketerstellung.beschreibung-bis-zeichen-ein', { min: BESCHREIBUNG_LAENGE.min, max: BESCHREIBUNG_LAENGE.max }),
    );
  const autor = { name: e.autor.name.trim(), github: e.autor.github.trim().replace(/^@/, '') };
  if (!autor.name) probleme.push(t('meldungen.paketerstellung.autor-bitte-deinen-namen'));
  if (autor.github && !GITHUB.test(autor.github)) probleme.push(t('meldungen.paketerstellung.github-nur-buchstaben-ziffern'));
  if (!autor.github) hinweis(t('meldungen.paketerstellung.ohne-github-namen-laesst'));
  // Lizenz (#651): freie aus der Liste, eigene (Name + Text → LICENSE) oder keine.
  const art = e.lizenzArt ?? 'frei';
  let lizenz = '';
  if (art === 'frei') {
    if (!istFreieLizenz(e.lizenz)) probleme.push(t('meldungen.paketerstellung.lizenz-bitte-eine-freie', { LIZENZEN: LIZENZEN.join(', ') }));
    else lizenz = e.lizenz;
  } else if (art === 'eigen') {
    const n = (e.lizenzName ?? '').trim();
    if (n.length < LIZENZNAME_LAENGE.min || n.length > LIZENZNAME_LAENGE.max)
      probleme.push(t('meldungen.paketerstellung.lizenz-name-der-eigenen', { min: LIZENZNAME_LAENGE.min, max: LIZENZNAME_LAENGE.max }));
    if (!(e.lizenzText ?? '').trim()) probleme.push(t('meldungen.paketerstellung.lizenz-bitte-den-text'));
    else if ((e.lizenzText ?? '').length > LIZENZTEXT_MAX)
      probleme.push(
        t('meldungen.paketerstellung.lizenz-der-lizenztext-ist', { LIZENZTEXT_MAX: LIZENZTEXT_MAX.toLocaleString(gebietsschema()) }),
      );
    lizenz = lizenzVerweis(n);
  } else lizenz = KEINE_LIZENZ;
  if (art !== 'frei')
    hinweis(
      t('meldungen.paketerstellung.laesst-sich-das-paket', {
        wert: art === 'eigen' ? t('meldungen.paketerstellung.mit-einer-eigenen-lizenz') : t('meldungen.paketerstellung.ohne-lizenz'),
        LIZENZEN: LIZENZEN.join(', '),
      }),
    );
  // Version (#651): ausgewählt, immer höher als die zuletzt bekannte.
  const version = e.version.trim();
  const bekannt = bekannteVersion(e, d.entwurf);
  if (!VERSION.test(version)) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  else if (bekannt && vergleicheVersion(version, bekannt) <= 0)
    probleme.push(
      t('meldungen.paketerstellung.version-damit-der-empfaenger', {
        bekannt,
        wert:
          d.entwurf && d.entwurf.version === bekannt
            ? t('meldungen.paketerstellung.hast-du-schon-erstellt')
            : t('meldungen.paketerstellung.gibt-es-schon'),
        naechsteVersion: naechsteVersion(bekannt),
      }),
    );
  else if (!e.vonHand && bekannt && !Object.values(naechsteVersionen(bekannt)).includes(version))
    probleme.push(t('meldungen.paketerstellung.version-bitte-eine-der', { values: Object.values(naechsteVersionen(bekannt)).join(', ') }));
  else if (!e.vonHand && !bekannt && version !== '1.0.0' && version !== '0.1.0')
    probleme.push(t('meldungen.paketerstellung.version-ein-neues-paket'));
  const dms = e.dms.trim();

  // 2. Auswahl: eigene Typen werden exportiert, Paket- und Systemtypen nicht.
  const eigene: Mappentyp[] = [];
  for (const tid of new Set(e.typen)) {
    const eintrag = typById.get(tid);
    if (!eintrag) {
      probleme.push(t('meldungen.paketerstellung.ein-gewaehlter-mappentyp-existiert'));
      continue;
    }
    const h = typPaket.get(eintrag.id);
    if (d.dmsTypen.get(eintrag.id) === 'ablageort')
      hinweis(t('meldungen.paketerstellung.ablageort-aus-basis', { name: eintrag.name, version: BASIS_ABLAGEORT_AB }));
    else if (d.dmsTypen.has(eintrag.id) || eintrag.system)
      hinweis(t('meldungen.paketerstellung.bringt-jede-installation-von', { name: eintrag.name }));
    else if (h) ausPaket(t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag);
    else eigene.push(eintrag);
  }
  const schluessel: Record<string, string> = {};
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

  /** Verweis auf einen Typ: eigener → Kennung, Paket → paket:kennung, DMS → dms:…; sonst null. */
  let dmsVerweise = false;
  const ziel = (typId: string | undefined, wo: string): string | null => {
    if (!typId) {
      probleme.push(`${wo}: ohne Ziel.`);
      return null;
    }
    if (schluessel[typId]) return schluessel[typId];
    const k = d.dmsTypen.get(typId);
    // Früherer Ablageort des Kerns (#883): Das Paket verweist auf basis:ablageort und braucht Basis ab 1.6.0.
    if (k && DMS_ALIAS[k]) {
      const [p, s] = DMS_ALIAS[k].split(':');
      if (!abh[p] || vergleicheVersion(BASIS_ABLAGEORT_AB, untergrenze(abh[p]) ?? '0.0.0') > 0) abh[p] = `>=${BASIS_ABLAGEORT_AB}`;
      hinweis(t('meldungen.paketerstellung.ablageort-aus-basis', { name: typById.get(typId)?.name ?? k, version: BASIS_ABLAGEORT_AB }));
      return `${p}:${s}`;
    }
    if (k && DMS_TYPEN[k]) {
      dmsVerweise = true;
      return `dms:${k}`;
    }
    const eintrag = typById.get(typId);
    const h = typPaket.get(typId);
    if (h && eintrag) {
      ausPaket(t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag);
      return `${h.p.id}:${h.s}`;
    }
    if (!eintrag) {
      probleme.push(`${wo}: Den Ziel-Mappentyp gibt es nicht mehr.`);
      return null;
    }
    if (eintrag.system) {
      probleme.push(
        `${wo}: verweist auf „${eintrag.name}“. Darauf kann ein Paket nicht verweisen (erlaubt: ${Object.values(DMS_TYPEN).join(', ')}).`,
      );
      return null;
    }
    if (!fehlend.some((f) => f.id === eintrag.id))
      fehlend.push({ art: 'typ', id: eintrag.id, name: eintrag.name, grund: wo, noetig: true });
    return null;
  };

  /**
   * Anzeigen, wenn … (#1033) fürs Paket: „Verweis zeigt auf eine Mappe vom Typ …“ mit Typverweis statt Id. Eine
   * bestimmte Mappe (Id dieser Installation) kommt nicht mit – das geht erst mit festen Kennungen mitgelieferter Mappen
   * (#1038). Ohne Bedingung bleibt keine Regel.
   */
  /** „Zeigt auf“ nur Vorgaben installierter Pakete (#1038)? Dann deren Verweise `paket:schluessel` und die Pakete. */
  const vorgabenIn = (b: Extract<Bedingung, { art: 'feld' }>): { verweise: string[]; pakete: InstalliertesPaket[] } | null => {
    const ids = b.op === 'zeigtAuf' && b.wert?.art === 'fest' && Array.isArray(b.wert.wert) && !b.bis ? b.wert.wert.map(String) : [];
    const teile = ids.map((x) => teileVorgabe(d.vorgaben?.get(x)));
    const pakete = teile.map((v) => (v ? d.pakete.find((p) => p.id === v.paket) : undefined));
    if (!ids.length || pakete.some((p) => !p)) return null;
    return { verweise: [...new Set(teile.map((v) => `${v!.paket}:${v!.schluessel}`))], pakete: pakete as InstalliertesPaket[] };
  };
  const anzeigeFuersPaket = (r: Anzeigeregel | undefined, wo: string): Anzeigeregel | undefined => {
    if (!r) return undefined;
    const bedingungen = r.bedingungen.flatMap((b): Anzeigeregel['bedingungen'] => {
      if (b.art === 'verweistyp') {
        const z = ziel(b.typ, wo);
        return z ? [{ ...b, typ: z }] : [];
      }
      // Vorgaben (#1038): zeigt die Bedingung nur auf Vorgaben installierter Pakete, kommt sie mit deren Kennung – das
      // Paket hängt dann von ihnen ab. Andere Mappen dieser Installation kommen nicht mit.
      const vorgaben = b.art === 'feld' ? vorgabenIn(b.bedingung) : null;
      if (b.art === 'feld' && vorgaben) {
        for (const p of vorgaben.pakete) abhaengig(p);
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
        hinweis(t('meldungen.paketerstellung.anzeige-mappe', { wo }));
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
  const tabelleInsPaket = (x: Record<string, unknown>, f: Feld, wo: string) => {
    const quelle = f.typ === 'tabelle' ? f.quelle : undefined;
    if (!quelle) return;
    const typ = ziel(quelle.typId, wo);
    const quelltyp = typById.get(quelle.typId);
    if (quelle.trefferliste && quelltyp && standardliste(quelltyp).key !== quelle.trefferliste)
      hinweis(t('meldungen.paketerstellung.tabelle-liste', { wo, name: quelltyp.name }));
    if (typ) x.quelle = ohneLeere({ typ, feld: quelle.feldKey, neu: quelle.neu });
  };

  // 3. Mappentypen
  const paketTypen = eigene.map((mappentyp) => {
    const wo = (was: string) => `„${mappentyp.name}“ → ${was}`;
    // „Übernommen aus“ (#1041) gehört zum Umbau dieser Installation – es kommt nicht ins Paket (wie Rechte-Regeln).
    const eigeneFelder = mappentyp.felder.filter((f) => !f.system && f.key !== UMBAU_FELD);
    for (const f of eigeneFelder.filter((x) => x.berechnetVon))
      hinweis(t('meldungen.paketerstellung.berechnet-weg', { wo: wo(`Feld „${f.label}“`) }));
    const felder = eigeneFelder.map((f) => {
      // ausText (#534) gehört zu einem Update aus der Registry, nicht in ein selbst erstelltes Paket.
      // berechnetVon (#1034) gehört dem Paket mit Code, das den Typ mitbringt – ein selbst erstelltes Paket rechnet nichts.
      const { zielTypen, zielOptional, system: _s, auswahlFilter, frist, standard, ausText: _a, anzeigen, ...rest } = f as Feld;
      delete (rest as Partial<Feld>).berechnetVon;
      // Tabelle (#1030): die Quelle als Typverweis (tabelleInsPaket), nicht mit der Id dieser Installation.
      delete (rest as Partial<Feld>).quelle;
      const x: Record<string, unknown> = ohneLeere(rest as Record<string, unknown>);
      const az = anzeigeFuersPaket(anzeigen, wo(`Feld „${f.label}“`));
      if (az) x.anzeigen = az;
      if (f.typ === 'referenz') {
        // Mehrere Zieltypen (#1036): `ziel` einzeln oder als Liste. Optionale Ziele bleiben optional – auch die, die es hier
        // schon gibt; von ihnen soll das Paket nicht abhängen.
        const opt = new Set(zielOptional ?? []);
        const fest = (zielTypen ?? []).filter((id) => !opt.has(typById.get(id)?.schluessel ?? ''));
        const ziele = fest.map((id) => ziel(id, wo(`Feld „${f.label}“`))).filter((z): z is string => !!z);
        x.ziel = ziele.length > 1 ? ziele : ziele[0];
        if (opt.size) x.zielOptional = [...opt];
      } else delete x.verweisart;
      if (frist) x.frist = ohneLeere(frist as unknown as Record<string, unknown>);
      if (standard !== undefined && standard !== null && standard !== '') {
        if (kreisImStandard(standard))
          hinweis(
            `${wo(`Feld „${f.label}“`)}: Der Nummernkreis gehört nicht zum Paketformat. Das Feld kommt ohne Nummernkreis ins Paket; richte ihn beim Empfänger unter Werkbank → Nummernkreise ein und trage ihn am Feld ein.`,
          );
        else if (mitId(standard))
          hinweis(`${wo(`Feld „${f.label}“`)}: Der Standardwert zeigt auf eine Mappe dieser Installation und kommt nicht ins Paket.`);
        else x.standard = standard;
      }
      if (auswahlFilter?.length) {
        if (mitId(auswahlFilter))
          hinweis(`${wo(`Feld „${f.label}“`)}: Der Auswahlfilter nennt Mappen dieser Installation und kommt nicht ins Paket.`);
        else x.auswahlFilter = auswahlFilter;
      }
      tabelleInsPaket(x, f, wo(`Feld „${f.label}“`));
      vorbelegenInsPaket(x, f, mappentyp);
      if (x.ziel === undefined) delete x.ziel;
      // Zum Wiederfinden (#938): Ohne die Angabe leitet Ablago sie bei Feldern mit „Aus Dokument füllen“ ab – ein
      // ausdrückliches false hält fest, dass der Haken hier aus ist.
      if (f.erkennung && !f.wiederfinden && wiederfindenVorgabe(f)) x.wiederfinden = false;
      return x;
    });
    const register = mappentyp.register.map((r: Register) => {
      const quellen = r.quellen
        ?.map((q) => ({ typ: ziel(q.typId, wo(`Register „${r.name}“`)), feld: q.feldKey }))
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
                  anzeigen: anzeigeFuersPaket(a.anzeigen, wo(`Abschnitt „${a.titel || a.vor}“`)),
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
    const liste = standardliste(mappentyp);
    if (trefferlistenVon(mappentyp).length > 1)
      hinweis(t('meldungen.paketerstellung.nur-die-standard-trefferliste', { name: mappentyp.name, name2: liste.name }));
    // Archivmodus (#1051) gehört seit DMS_ARCHIV_PAKET_AB zum Paketformat – als Vorgabe für den neuen Typ beim Empfänger.
    const weg = [
      mappentyp.berechtigungen ? 'Berechtigungen' : '',
      mappentyp.erstellenErlaubt === false || mappentyp.loeschenErlaubt === false
        ? t('meldungen.paketerstellung.anlegen-loeschen-gesperrt')
        : '',
    ].filter(Boolean);
    if (weg.length) hinweis(t('meldungen.paketerstellung.gehoeren-nicht-zum-paketformat', { name: mappentyp.name, weg: weg.join(', ') }));
    const archiv = archivInsPaket(
      mappentyp.archiv,
      felder.map((f) => ({ key: String(f.key) })),
    );
    if (mappentyp.archiv?.stichtag && !archiv?.stichtag)
      hinweis(t('meldungen.paketerstellung.archiv-ohne-stichtag', { name: mappentyp.name }));
    // Das Schema verlangt beschreibung und felder auch leer.
    return {
      schluessel: schluessel[mappentyp.id],
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
      // Ist Teil einer anderen Mappe (#1031): wie im Entwurf Rechnungen die Kennung des Verweisfelds.
      ...(mappentyp.teilVon && felder.some((f) => f.key === mappentyp.teilVon) ? { gehoertZu: mappentyp.teilVon } : {}),
      // In der allgemeinen Suche zeigen (#1220): nur „nein“ – „ja“ ist die Vorgabe.
      ...(mappentyp.inSuche === false ? { inSuche: false } : {}),
      // Archivmodus (#1051): Schreibweise der Registry; beim Empfänger nur für den neu angelegten Typ.
      ...(archiv ? { archiv } : {}),
    };
  });

  // 4. Ansichten
  const eigeneSichten: Sicht[] = [];
  for (const sid of new Set(e.sichten)) {
    const s = sichtById.get(sid);
    if (!s) {
      probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-ansicht-existiert'));
      continue;
    }
    const h = sichtPaket.get(s.id);
    if (h) ausPaket(t('meldungen.paketerstellung.die-ansicht'), s.name, h.p);
    else eigeneSichten.push(s);
  }
  const belegtS = new Set<string>();
  for (const s of eigeneSichten) {
    const alt = d.entwurf?.schluessel[s.id];
    if (alt && SCHLUESSEL.test(alt) && !belegtS.has(alt) && !Object.values(schluessel).includes(alt)) {
      belegtS.add(alt);
      schluessel[s.id] = alt;
    }
  }
  for (const s of eigeneSichten) if (!schluessel[s.id]) schluessel[s.id] = frei(s.name, SCHLUESSEL_MAX, belegtS);
  const fest = (w: WertAngabe | undefined): unknown => (!w ? undefined : w.art === 'fest' ? w.wert : w);
  let fremdeTypen = false;
  const paketSichten = eigeneSichten.map((s) => {
    let eltern: string | undefined;
    if (s.elternId) {
      const ep = sichtById.get(s.elternId);
      if (ep && schluessel[ep.id] && eigeneSichten.includes(ep)) eltern = schluessel[ep.id];
      else if (ep && sichtPaket.has(ep.id))
        hinweis(t('meldungen.paketerstellung.ansicht-steht-unter-aus', { name: s.name, name2: ep.name }));
      else if (ep) {
        hinweis(t('meldungen.paketerstellung.ansicht-steht-unter-die', { name: s.name, name2: ep.name }));
        if (!fehlend.some((f) => f.id === ep.id))
          fehlend.push({
            art: 'sicht',
            id: ep.id,
            name: ep.name,
            grund: t('meldungen.paketerstellung.elternansicht-von', { name: s.name }),
            noetig: false,
          });
      }
    }
    // Eigene, nicht gewählte Typen (#656): nur ein Hinweis – der Typ bleibt über seine Kennung in der Ansicht.
    const fremd: FremderTyp[] = [];
    const typen = s.typen
      .map((tid) => {
        if (tid === ALLE_TYPEN) return ALLE_TYPEN; // „*“ (#725): alle Mappentypen
        const eintrag = typById.get(tid);
        if (eintrag && !schluessel[tid] && !d.dmsTypen.has(tid) && !eintrag.system && !typPaket.has(tid)) {
          const frueher = (d.entwuerfe ?? []).find((x) => x.id !== id && x.schluessel[tid]);
          fremd.push({
            kennung: frueher
              ? typKennung(frueher.id, frueher.schluessel[tid])
              : eintrag.schluessel || frei(eintrag.name, SCHLUESSEL_MAX, new Set()),
            name: eintrag.name,
          });
          hinweis(t('meldungen.paketerstellung.ansicht-zeigt-mappen-vom', { name: s.name, name2: eintrag.name }));
          if (!fehlend.some((f) => f.id === eintrag.id))
            fehlend.push({
              art: 'typ',
              id: eintrag.id,
              name: eintrag.name,
              grund: t('meldungen.paketerstellung.vorsicht-steckt-in-der', { name: s.name }),
              noetig: false,
            });
          return null;
        }
        return ziel(tid, `Ansicht „${s.name}“`);
      })
      .filter((t): t is string => !!t);
    if (fremd.length) fremdeTypen = true;
    const bedingungen = s.bedingungen.flatMap((b: Bedingung): Array<{ feld: string; operator: string; wert?: unknown }> => {
      // Merkmal der Ablage (#1032): kennt das Paketformat der Ansichten (noch) nicht.
      if (b.art === 'merkmal') {
        hinweis(t('meldungen.paketerstellung.ansicht-merkmal', { name: s.name }));
        return [];
      }
      if (b.art !== 'feld') {
        hinweis(t('meldungen.paketerstellung.ansicht-bedingungen-auf-anzahlen', { name: s.name }));
        return [];
      }
      // „zeigt auf Mappe vom Typ …“ (#1036): Mappentypen als Typverweis statt Id.
      if (b.op === 'zeigtAufTyp') {
        const ids = b.wert?.art === 'fest' && Array.isArray(b.wert.wert) ? b.wert.wert : [];
        const typen = ids.map((id) => ziel(id, `Ansicht „${s.name}“`)).filter((x): x is string => !!x);
        return typen.length ? [{ feld: b.feld, operator: b.op, wert: typen }] : [];
      }
      const w = (b.op === 'zwischen' || b.op === 'ausserhalb') && b.bis ? [fest(b.wert), fest(b.bis)] : fest(b.wert);
      if (mitId(w)) {
        hinweis(t('meldungen.paketerstellung.ansicht-eine-bedingung-nennt', { name: s.name }));
        return [];
      }
      return [w === undefined ? { feld: b.feld, operator: b.op } : { feld: b.feld, operator: b.op, wert: w }];
    });
    if (s.trefferliste && s.trefferliste !== 'standard') hinweis(t('meldungen.paketerstellung.ansicht-zeigt-im-paket', { name: s.name }));
    if (s.berechtigungen) hinweis(t('meldungen.paketerstellung.ansicht-berechtigungen-an-der', { name: s.name }));
    return ohneLeere({
      schluessel: schluessel[s.id],
      name: s.name,
      beschreibung: s.beschreibung || undefined,
      beschriftungen: s.beschriftungen,
      eltern,
      typen,
      fremde_typen: fremd,
      bedingungen,
      symbol: s.symbol || undefined,
    });
  });
  // Elternansichten zuerst (liest sich besser; das DMS sortiert ohnehin).
  const sortiert: typeof paketSichten = [];
  const offen = [...paketSichten];
  while (offen.length) {
    const i = offen.findIndex(
      (s) => !s.eltern || sortiert.some((x) => x.schluessel === s.eltern) || !offen.some((x) => x.schluessel === s.eltern),
    );
    sortiert.push(...offen.splice(i < 0 ? 0 : i, 1));
  }

  // 5. Beispiele: nur ausdrücklich gewählte Mappen der eigenen Typen, ohne Passwörter und ohne Ids.
  const exportiert = new Map(eigene.map((t) => [t.id, t] as const));
  const bsp = d.mappen.filter((m) => exportiert.has(m.typId) && !m.systemKennung);
  if (d.mappen.length > bsp.length) hinweis(t('meldungen.paketerstellung.beispiel-mappen-gehen-nur'));
  const bspKey = new Map(bsp.map((m, i) => [m.id, `beispiel_${i + 1}`] as const));
  let beispielVerweise = false;
  let ohneZiel = 0;
  const beispiele = bsp.map((m) => {
    const t = exportiert.get(m.typId)!;
    const werte: Record<string, unknown> = {};
    for (const f of t.felder) {
      const w = m.werte[f.key];
      if (f.system || f.typ === 'passwort' || istLeer(w)) continue;
      if (f.typ === 'referenz') {
        const l = (Array.isArray(w) ? w : [w]).filter((x): x is string => typeof x === 'string');
        const z = l.filter((x) => bspKey.has(x)).map((x) => ({ beispiel: bspKey.get(x)! }));
        ohneZiel += l.length - z.length;
        if (z.length) {
          beispielVerweise = true;
          werte[f.key] = f.mehrfach ? z : z[0];
        }
        continue;
      }
      if (f.typ === 'betrag' && w && typeof w === 'object' && 'betrag' in w) {
        const b = w as { betrag: unknown; waehrung?: string };
        werte[f.key] =
          (b.waehrung ?? 'EUR') === (f.waehrung || 'EUR') && typeof b.betrag === 'number'
            ? b.betrag
            : { betrag: b.betrag, waehrung: b.waehrung };
        continue;
      }
      if (mitId(w)) continue;
      werte[f.key] = w;
    }
    return { typ: schluessel[t.id], schluessel: bspKey.get(m.id)!, werte };
  });
  // Beispiel-Dokumente (#878): unter inhalt/beispiele/<beispiel>/; der Name in Ablago wird zum Titel.
  const dokDateien: Array<{ name: string; daten: Buffer }> = [];
  if (e.beispielDokumente) {
    for (const [i, m] of bsp.entries()) {
      const liste = d.dokumente?.get(m.id) ?? [];
      if (!liste.length) continue;
      const belegt = new Set<string>();
      const ordner = `beispiele/${beispiele[i].schluessel}`;
      (beispiele[i] as Record<string, unknown>).dokumente = liste.map((x) => {
        const endung = x.name.slice(x.name.lastIndexOf('.') + 1).toLowerCase();
        const art = beispielDateiart(`a.${endung}`, x.inhalt)
          ? endung
          : Object.entries(BEISPIEL_ENDUNGEN).find(([k]) => beispielDateiart(`a.${k}`, x.inhalt))![0];
        const stamm =
          x.name
            .slice(0, x.name.lastIndexOf('.') > 0 ? x.name.lastIndexOf('.') : undefined)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ß/g, 'ss')
            .replace(/[^A-Za-z0-9_-]+/g, '-')
            .replace(/^[-.]+|-+$/g, '')
            .slice(0, 80) || 'dokument';
        let datei = `${stamm}.${art}`;
        for (let n = 2; belegt.has(datei.toLowerCase()); n++) datei = `${stamm}-${n}.${art}`;
        belegt.add(datei.toLowerCase());
        dokDateien.push({ name: `inhalt/${ordner}/${datei}`, daten: x.inhalt });
        return { datei: `${ordner}/${datei}`, titel: x.name, datum: x.erstellt.slice(0, 10), register: x.registerKey };
      });
    }
    if (d.dokumenteZuGross)
      probleme.push(t('pakete.groesse.erstellenZuGross', { groesse: inMB(d.dokumenteZuGross), max: inMB(ARCHIV_MAX) }));
    if (dokDateien.length) hinweis(t('meldungen.paketerstellung.beispiel-dokumente-kommen-mit', { anzahl: dokDateien.length }));
    if (d.dokumenteAusgelassen) hinweis(t('meldungen.paketerstellung.beispiel-dokumente-ausgelassen', { anzahl: d.dokumenteAusgelassen }));
  }
  if (ohneZiel) hinweis(t('meldungen.paketerstellung.beispiel-mappen-verweise-zeigen', { anzahl: ohneZiel }));
  if (bsp.length)
    hinweis(
      e.beispielDokumente
        ? t('meldungen.paketerstellung.beispiel-mappen-aus-deiner-mit-dokumenten', { bsp: bsp.length })
        : t('meldungen.paketerstellung.beispiel-mappen-aus-deiner', { bsp: bsp.length }),
    );

  // 6. Wortlisten (#661): nur eigene Gruppen; aus Paketen nicht kopiert. Doppelte Wörter in einer Gruppe zusammengefasst.
  const wortlisten: Array<{ woerter: string[] }> = [];
  for (const wid of new Set(e.wortlisten ?? [])) {
    const g = (d.wortlisten ?? []).find((x) => x.id === wid);
    if (!g) {
      probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-wortliste-gibt'));
      continue;
    }
    if (g.quelle !== 'werkbank') {
      const p = d.pakete.find((x) => x.id === g.quelle);
      if (p && abh[p.id])
        hinweis(t('meldungen.paketerstellung.die-wortliste-kommt-ueber', { woerter: g.woerter.join(', '), name: p.name }));
      else hinweis(t('meldungen.paketerstellung.die-wortliste-gehoert-zum', { woerter: g.woerter.join(', '), wert: p?.name ?? g.quelle }));
      continue;
    }
    const w = liesWortgruppe(g.woerter).woerter;
    if (w.length >= 2) wortlisten.push({ woerter: w });
  }
  if (wortlisten.length > WORTLISTEN_MAX) probleme.push(t('meldungen.paketerstellung.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  if (wortlisten.length) hinweis(t('meldungen.paketerstellung.gruppen-gleichbedeutender-woerter', { anzahl: wortlisten.length }));

  // 7. Eigene Rundgänge (#941): Mappentypen werden zu Schlüsseln im Paket bzw. zu Abhängigkeiten.
  const rundgaenge = rundgaengeInsPaket(e.rundgaenge ?? [], d, { schluessel, typPaket, abhaengig, probleme });
  if (rundgaenge.length) hinweis(t('meldungen.paketerstellung.rundgaenge', { anzahl: rundgaenge.length }));
  // 8. Eigene Tipps (#942): Rundgänge nur, wenn sie als eigene mitkommen; Anpassungen fremder Tipps nicht (#654).
  const tipps = tippsInsPaket(e.tipps ?? [], e.rundgaenge ?? [], d, { schluessel, typPaket, abhaengig, probleme });
  if (tipps.length) hinweis(t('meldungen.paketerstellung.tipps', { anzahl: tipps.length }));
  // 9. Eigene Automatisierungen (#680): Typen wie bei Rundgängen; feste Personen und Rollen werden zum Ersteller der Mappe.
  const automatisierungen = automatisierungenInsPaket(e.automatisierungen ?? [], d, { schluessel, typPaket, abhaengig, probleme }, hinweis);
  if (automatisierungen.length) hinweis(t('meldungen.paketerstellung.automatisierungen', { anzahl: automatisierungen.length }));

  if (!paketTypen.length && !paketSichten.length && !wortlisten.length && !rundgaenge.length && !tipps.length && !automatisierungen.length)
    probleme.push(t('meldungen.paketerstellung.waehle-mindestens-einen-eigenen'));
  // Nötige Ablago-Version (#651): Mindestversion aus den benutzten Funktionen, Angabe aus der Auswahl.
  const genutzt: MindestFunktion[] = [];
  if (dmsVerweise) genutzt.push('dmsVerweise');
  if (beispielVerweise) genutzt.push('beispielVerweise');
  if (dokDateien.length) genutzt.push('beispielDokumente');
  if (fremdeTypen) genutzt.push('fremdeTypen');
  if (wortlisten.length) genutzt.push('wortlisten');
  if (automatisierungen.length) genutzt.push('automatisierungen');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => 'erkennung' in f))) genutzt.push('erkennung');
  if (
    paketTypen.some((t) =>
      (t.felder as Array<Record<string, unknown>>).some(
        (f) => 'format' in f || 'landFeld' in f || (f.typ === 'datum' && ('min' in f || 'max' in f)),
      ),
    )
  )
    genutzt.push('feldformate');
  // Zeitraum, Prozent und negative Beträge (#1035): Ältere Ablago machten aus unbekannten Feldarten Text.
  if (
    paketTypen.some((t) =>
      (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'zeitraum' || f.typ === 'prozent' || f.negativ === true),
    )
  )
    genutzt.push('feldarten');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'tabelle'))) genutzt.push('tabelle');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => Array.isArray(f.vorbelegen) && f.vorbelegen.length)))
    genutzt.push('vorbelegen');
  if (paketTypen.some((t) => 'gehoertZu' in t)) genutzt.push('teile');
  if (paketTypen.some((t) => 'archiv' in t)) genutzt.push('archiv');
  // Eigene Organisation (#995): Merkmal, Schreibschutz oder die Anzeige-Bedingung „zeigt auf eine eigene Organisation“.
  if (
    paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.merkmal || f.schreibschutz)) ||
    JSON.stringify(paketTypen).includes('"art":"eigeneOrganisation"')
  )
    genutzt.push('organisation');
  // Zusammengesetzt (#1050): Ältere Ablago lehnen die unbekannte Feldart ab.
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'zusammengesetzt')))
    genutzt.push('zusammengesetzt');
  // Anzeige-Bedingung „zeigt auf die Vorgabe …“ (#1038): Ältere Ablago ließen sie weg (Feld immer zu sehen).
  if (JSON.stringify(paketTypen).includes('"art":"vorgabe"')) genutzt.push('vorgaben');
  const mindest = mindestversion(genutzt);
  const optionen = dmsOptionen(mindest.version, d.dmsVersion);
  const unten = untergrenze(dms);
  if (!dms) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-auswaehlen'));
  else if (!BEREICH.test(dms) || !unten) probleme.push(t('meldungen.paketerstellung.ablago-version-z-b'));
  else if (vergleicheVersion(unten, mindest.version) < 0)
    probleme.push(
      t('meldungen.paketerstellung.ablago-version-das-paket', {
        wert: mindest.gruende.join(', ') || t('meldungen.paketerstellung.funktionen'),
        version: mindest.version,
      }),
    );
  else if (!e.vonHand && !DMS_ANGABE.test(dms)) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-eine'));
  else if (!e.vonHand && !optionen.includes(dms))
    probleme.push(t('meldungen.paketerstellung.ablago-version-gibt-es', { dms, version: mindest.version }));
  const felderJetzt: Record<string, string[]> = Object.fromEntries(
    eigene.map((t) => [t.id, t.felder.filter((f) => !f.system).map((f) => f.key)]),
  );
  const namen = new Map<string, string>([...d.typen.map((t) => [t.id, t.name] as const), ...d.sichten.map((s) => [s.id, s.name] as const)]);
  const ea = erkenneArt(e, d.entwurf, felderJetzt, namen);
  const versionLage: VersionsLage = {
    bekannt,
    art: ea.art,
    artGrund: ea.grund,
    mindest: mindest.version,
    gruende: mindest.gruende,
    dmsOptionen: optionen,
  };
  const fehlt = fehlend.filter((f) => f.noetig);
  if (fehlt.length)
    probleme.push(t('meldungen.paketerstellung.es-wird-auf-mappentypen', { map: fehlt.map((f) => `„${f.name}“`).join(', ') }));

  const inhalt: Bau['inhalt'] = {
    typen: paketTypen.map((t) => ({ schluessel: String(t.schluessel), name: String(t.name) })),
    sichten: sortiert.map((s) => ({
      schluessel: String(s.schluessel),
      name: String(s.name),
      eltern: (s.eltern as string | undefined) ?? null,
    })),
    beispiele: beispiele.length,
    ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}),
    ...(dokDateien.length ? { beispielDokumente: dokDateien.length } : {}),
    ...(rundgaenge.length ? { rundgaenge: rundgaenge.length } : {}),
    ...(tipps.length ? { tipps: tipps.length } : {}),
    ...(automatisierungen.length ? { automatisierungen: automatisierungen.length } : {}),
  };
  if (probleme.length)
    return {
      probleme,
      fehlend,
      hinweise,
      abhaengigkeiten: abh,
      inhalt,
      schluessel,
      dateien: [],
      version: versionLage,
      felder: felderJetzt,
      lizenz,
    };

  // 6. Dateien
  const y = (v: unknown) => Buffer.from(stringify(v, { version: '1.1', lineWidth: 0 }));
  const manifest = {
    schema: 1,
    id,
    name,
    version,
    beschreibung,
    autor,
    lizenz,
    dms,
    abhaengigkeiten: abh,
    inhalt: {
      mappentypen: 'inhalt/mappentypen.yaml',
      sichten: 'inhalt/sichten.yaml',
      ...(beispiele.length ? { beispiele: 'inhalt/beispiele.yaml' } : {}),
      ...(wortlisten.length ? { wortlisten: 'inhalt/wortlisten.yaml' } : {}),
      ...(rundgaenge.length ? { rundgaenge: 'inhalt/rundgaenge.yaml' } : {}),
      ...(tipps.length ? { tipps: 'inhalt/tipps.yaml' } : {}),
      ...(automatisierungen.length ? { automatisierungen: 'inhalt/automatisierungen.yaml' } : {}),
    },
  };
  const datum = d.jetzt.toISOString().slice(0, 10);
  const text = aenderungsText(e, d.entwurf);
  const verlauf = (
    d.entwurf
      ? [
          {
            version: d.entwurf.version,
            datum: d.entwurf.exportiert.slice(0, 10),
            text: d.entwurf.aenderungen || t('meldungen.paketerstellung.aus-ablago-exportiert'),
          },
          ...d.entwurf.verlauf,
        ]
      : []
  ).filter((v) => vergleicheVersion(v.version, version) < 0);
  const changelog = [
    '# Änderungen',
    '',
    `## ${version}`,
    '',
    ...text
      .split('\n')
      .map((z) => (z.trim().startsWith('-') ? z : `- ${z}`))
      .filter((z) => z.trim() !== '-'),
    ...verlauf.flatMap((v) => [
      '',
      `## ${v.version}`,
      '',
      ...v.text
        .split('\n')
        .map((z) => (z.trim().startsWith('-') ? z : `- ${z}`))
        .filter((z) => z.trim() !== '-'),
    ]),
    '',
  ].join('\n');
  const typName = new Map(paketTypen.map((t) => [String(t.schluessel), String(t.name)] as const));
  const readme = [
    `# ${name}`,
    '',
    beschreibung,
    '',
    '## Inhalt',
    '',
    ...(paketTypen.length
      ? [
          '| Mappentyp | Felder |',
          '| --- | --- |',
          ...paketTypen.map(
            (t) => `| ${zelle(String(t.name))} | ${zelle((t.felder as Array<{ label: string }>).map((f) => f.label).join(', ') || '–')} |`,
          ),
          '',
        ]
      : []),
    ...(sortiert.length
      ? [
          `**Ansichten:** ${sortiert.map((s) => (s.eltern ? `${sortiert.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name)).join(', ')}`,
          '',
        ]
      : []),
    ...(wortlisten.length
      ? [
          `**Wortlisten:** ${t('meldungen.paketerstellung.gruppen', { anzahl: wortlisten.length })} gleichbedeutender Wörter für die Suche`,
          '',
        ]
      : []),
    ...(beispiele.length
      ? [
          `**Beispiele:** ${beispiele.length} Beispiel-Mappen (${[...new Set(beispiele.map((b) => typName.get(b.typ)))].join(', ')})${dokDateien.length ? t('meldungen.paketerstellung.mit-beispiel-dokumenten', { anzahl: dokDateien.length }) : ''}, auf Wunsch bei der Installation.`,
          '',
        ]
      : []),
    '## Voraussetzungen',
    '',
    `- Ablago ${dms}`,
    ...(Object.keys(abh).length
      ? Object.entries(abh).map(([k, v]) => `- Paket \`${k}\` ${v}`)
      : [t('meldungen.paketerstellung.keine-weiteren-pakete')]),
    '',
    '## Rechte und Netzwerkzugriff',
    '',
    t('meldungen.paketerstellung.dieses-paket-enthaelt-keinen'),
    '',
    '## Lizenz',
    '',
    art === 'frei'
      ? t('meldungen.paketerstellung.der-volle-text-steht', { lizenz })
      : art === 'eigen'
        ? t('meldungen.paketerstellung.der-volle-text-steht-2', { wert: (e.lizenzName ?? '').trim() })
        : t('meldungen.paketerstellung.keine-lizenz-angegeben-alle'),
    '',
    '## Herkunft',
    '',
    t('meldungen.paketerstellung.erstellt-mit-paket-erstellen', { datum, wert: autor.name ? ` von ${autor.name}` : '' }),
    '',
  ].join('\n');
  const jahr = String(d.jetzt.getFullYear());
  const lizenzDatei =
    art === 'frei'
      ? (LIZENZTEXTE[lizenz] ?? '').replace('{jahr}', jahr).replace('{name}', autor.name)
      : art === 'eigen'
        ? `${(e.lizenzText ?? '').replace(/\r\n/g, '\n').trim()}\n`
        : t('meldungen.paketerstellung.copyright-c-fuer-dieses', { jahr, name: autor.name });
  const erwartung = {
    mappentypen: inhalt.typen.map((t) => t.schluessel),
    sichten: inhalt.sichten.map((s) => s.schluessel),
    beispiele: beispiele.length,
    ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}),
  };
  const dateien = [
    {
      name: 'manifest.yaml',
      daten: Buffer.from(
        `# Erstellt mit „Paket erstellen“ in Ablago. Format: https://github.com/motom001/dms-registry\n${stringify(manifest, { version: '1.1', lineWidth: 0 })}`,
      ),
    },
    { name: 'inhalt/mappentypen.yaml', daten: y(paketTypen) },
    { name: 'inhalt/sichten.yaml', daten: y(sortiert) },
    ...(beispiele.length ? [{ name: 'inhalt/beispiele.yaml', daten: y(beispiele) }] : []),
    ...dokDateien,
    ...(wortlisten.length ? [{ name: 'inhalt/wortlisten.yaml', daten: y(wortlisten) }] : []),
    ...(rundgaenge.length ? [{ name: 'inhalt/rundgaenge.yaml', daten: y(rundgaenge) }] : []),
    ...(tipps.length ? [{ name: 'inhalt/tipps.yaml', daten: y(tipps) }] : []),
    ...(automatisierungen.length ? [{ name: 'inhalt/automatisierungen.yaml', daten: y(automatisierungen) }] : []),
    { name: 'README.md', daten: Buffer.from(readme) },
    { name: 'CHANGELOG.md', daten: Buffer.from(changelog) },
    { name: 'LICENSE', daten: Buffer.from(lizenzDatei) },
    { name: 'tests/erwartung.yaml', daten: y(erwartung) },
  ];
  return {
    probleme,
    fehlend,
    hinweise,
    abhaengigkeiten: abh,
    inhalt,
    schluessel,
    dateien,
    version: versionLage,
    felder: felderJetzt,
    lizenz,
  };
}
