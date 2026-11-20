/**
 * Stand beim Anlegen bzw. Ergänzen eines Pakets (#1278, Schritt 6a; vorher Teil von `legeIntern`): was die Schritte
 * gemeinsam brauchen und zum Zurückrollen sammeln, dazu die Auflösung von Typverweisen und die Eingabe je Mappentyp.
 * Alles hier ist ohne Datenbank – die Schritte selbst stehen in `anlegen-schritte.ts` und `anlegen.ts`.
 */
import { type Feld, type Mappentyp } from '../../../../shared/src/model';
import { type BeispielStand, DMS_ALIAS, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { typKennung } from '../../../../shared/src/kennungen';
import { type Bedingung, type Sicht } from '../../../../shared/src/sichten';
import { type TypBild, typBild } from '../../../../shared/src/typvergleich';
import { vorgabeVerweis } from '../../../../shared/src/vorgaben';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { anzeigeMitVorgaben, type VorgabenErgebnis, type VorgabenLage } from '../index';
import { type UmbauErgebnis, type UmbauLage } from '../index';
import { anzeigeTypIds, anzeigeWartet, quelleAnlegbar } from '../index';
import {
  BASIS_ABLAGEORT_AB,
  DMS_VERWEISE_AB,
  istObjekt,
  type Manifest,
  type PaketFeld,
  type PaketTyp,
  paketZiele,
  str,
  tabellenTyp,
} from './format';
import { anzahlTexte } from '../../../../shared/src/sprachpaket';
import { archivOhneName, modulInfo } from './hilfen';
import { type LegeAuftrag } from './plan';
import { wiederfindenAus } from './update-neu';

/** Was die Schritte beim Anlegen teilen. */
export interface AnlegeLauf {
  a: LegeAuftrag;
  m: Manifest;
  installierte: InstalliertesPaket[];
  /** Mappentypen vor dem Anlegen. */
  vorher: Map<string, Mappentyp>;
  /** Übernahme des früheren Ablageorts (#883). */
  ueb: { typen: Record<string, string>; sichten: Record<string, string>; name: string } | null;
  /** Umbau (#1041), in der Vorschau geplant. */
  lage: UmbauLage;
  /** Schlüssel im Paket → Id des Typs (vorhanden, übernommen oder neu). */
  ids: Map<string, string>;
  neueTypen: PaketTyp[];
  /** Schlüssel der hier angelegten Typen. */
  angelegt: Set<string>;
  beispielIds: Map<string, string>;
  dmsTypen: Map<string, Mappentyp>;
  vorgabenJetzt: VorgabenLage;
  fremdeVorgaben: Map<string, string | null>;
  vorgabenErg: VorgabenErgebnis;
  /** Stand der Typen beim Anlegen (#1122). */
  stand: Map<string, Mappentyp>;
  // Zurückrollen: angelegte Mappen, Sichten, Typen; geänderte Typen auf den alten Stand.
  mappen: string[];
  beispielStaende: BeispielStand[];
  neueSichten: string[];
  /** Ansichten (#1125): ersetzte (alter Stand zum Zurückrollen), geschriebene (Schlüssel, für den Stand), gewünschte. */
  ersetzteSichten: Sicht[];
  sichtGeschrieben: Set<string>;
  ersetzenGewuenscht: Set<string>;
  geaendert: Mappentyp[];
  /** Abschnitte aus dem Update (#890) je Typ: gehören zum Paketstand (#653), nicht zu den eigenen Änderungen. */
  abschnittRegister: Map<string, Set<string>>;
  kennungZurueck: Map<string, string>;
  typMap: Record<string, string>;
  sichtMap: Record<string, string>;
  umbauErg: UmbauErgebnis | null;
}

/** Vorgabe (#1038) → Id ihrer Mappe; eigene aus der Lage, fremde vorab gesucht. */
export const vorgabeId = (l: AnlegeLauf, vw: string): string | null => {
  const { m, fremdeVorgaben, vorgabenJetzt } = l;
  const v = vorgabeVerweis(vw, m.id);
  if (v.paket !== m.id) return fremdeVorgaben.get(vw) ?? null;
  const x = vorgabenJetzt.je.get(v.schluessel);
  return x && x.zustand !== 'geloescht' ? x.id : null;
};

/** Typverweis → Id; `nurAngelegt`: Typen dieses Pakets erst, wenn es sie gibt (sonst null). */
export const ziel = (l: AnlegeLauf, vw: string, nurAngelegt: boolean): string | null => {
  const { m, dmsTypen, installierte, vorher, ids, angelegt } = l;
  const [p, s] = vw.includes(':') ? vw.split(':') : [m.id, vw];
  if (p === 'dms') {
    const eintrag = dmsTypen.get(s);
    if (!eintrag && DMS_ALIAS[s])
      throw new Fachfehler(422, t('meldungen.pakete.alias-ohne-ziel', { vw, neu: DMS_ALIAS[s], version: BASIS_ABLAGEORT_AB }));
    if (!eintrag) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich', { vw, DMS_VERWEISE_AB }));
    return eintrag.id;
  }
  if (p !== m.id) {
    const fremd = installierte.find((x) => x.id === p)?.typen[s];
    if (!fremd || !vorher.has(fremd)) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich-2', { vw, p, s }));
    return fremd;
  }
  const id = ids.get(s);
  if (!id) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-zeigt-auf', { vw }));
  return !nurAngelegt || angelegt.has(s) || vorher.has(id) ? id : null;
};

// Optionale Ziele (#1036): ein Typ eines anderen Pakets, wenn es ihn schon gibt – sonst still nichts.
const optional = (l: AnlegeLauf, vw: string): string | null => {
  const [p, sl] = vw.split(':');
  const id = l.installierte.find((x) => x.id === p)?.typen[sl];
  return id && l.vorher.has(id) ? id : null;
};

// „zeigt auf Mappe vom Typ …“ in Ansichten (#1036): Typverweise → Ids; optionale (eines nicht installierten Pakets) fallen weg.
export const zieltypenIn = (l: AnlegeLauf, b: Bedingung): Bedingung => {
  if (b.art !== 'feld' || b.op !== 'zeigtAufTyp' || b.wert?.art !== 'fest' || !Array.isArray(b.wert.wert)) return b;
  const ids = b.wert.wert
    .map((vw) => {
      try {
        return ziel(l, str(vw), false);
      } catch {
        return str(vw).includes(':') ? optional(l, str(vw)) : null;
      }
    })
    .filter((x): x is string => !!x);
  return { ...b, wert: { art: 'fest', wert: ids } };
};

// Anzeigen, wenn … (#1033): „zeigt auf eine Mappe vom Typ …“ (verweistyp, zeigtAufTyp) nennt im Paket Typverweise –
// hier Ids; ein optionales Ziel, dessen Paket fehlt, bleibt als Kennung und trifft nie zu (#1122). „zeigt auf die
// Vorgabe …“ (#1038) nennt die feste Kennung – hier die Id der Mappe („zeigt auf“).
export const anzeige = (l: AnlegeLauf, roh: unknown, felder: PaketFeld[]) =>
  anzeigeTypIds(
    anzeigeMitVorgaben(roh, (vw) => vorgabeId(l, vw)),
    felder,
    (vw) => ziel(l, vw, false)!,
    (vw) => optional(l, vw),
  );

const eigen = (l: AnlegeLauf, vw: string) => !vw.includes(':') || vw.startsWith(`${l.m.id}:`);
// Erster Durchgang (#1122): Was auf einen Typ dieses Pakets zeigt, den es noch nicht gibt (außer auf sich selbst), wartet.
const typFehlt = (l: AnlegeLauf, t: PaketTyp, nurAngelegt: boolean) => (vw: string) =>
  nurAngelegt && eigen(l, vw) && vw.split(':').pop() !== t.schluessel && ziel(l, vw, true) === null;
// Quellen (#1122): erst, wenn das Feld des anderen Typs auf diesen zeigen darf – sonst fiele die Quelle beim Speichern still weg.
const quelleId = (l: AnlegeLauf, t: PaketTyp, q: { typ: string; feld: string }, nurAngelegt: boolean, felder: Feld[]) => {
  const typId = ziel(l, q.typ, nurAngelegt);
  return typId && (!nurAngelegt || quelleAnlegbar({ typId, feldKey: q.feld }, l.ids.get(t.schluessel)!, l.stand, felder)) ? typId : null;
};

type Wartet = (roh: unknown) => boolean;

/** Felder eines Typs fürs Anlegen: ohne die offenen; Typverweise als Ids. */
function felderEingabe(l: AnlegeLauf, t: PaketTyp, offen: Set<string>, wartet: Wartet) {
  return t.felder
    .filter((f) => !offen.has(f.key))
    .map(({ ziel: z, zielOptional: opt, berechnet, quelle: q, ...f }) => {
      const ziele = [
        ...paketZiele({ ziel: z }).map((x) => ziel(l, x, false)!),
        ...(opt ?? []).map((x) => optional(l, x)).filter((x): x is string => !!x),
      ];
      // Tabelle (#1030): Typverweis → Id; „standard“ ist die Standard-Trefferliste (Pakete bringen nur sie mit).
      const quelle =
        f.typ === 'tabelle' && q
          ? { typId: ziel(l, str(q.typ), false)!, feldKey: str(q.feld), ...(q.neu ? { neu: str(q.neu) } : {}) }
          : undefined;
      // Berechnet (#1034): gehört dem Paket, das den Typ mitbringt; null gibt ein Feld frei, das das Paket nicht mehr berechnet.
      // Beim Auswählen übernehmen (#1037): Zielfelder, die erst im zweiten Durchgang kommen, auch erst dann.
      const vorbelegen = f.vorbelegen?.filter((p) => !offen.has(p.nach));
      return {
        ...f,
        ...(vorbelegen ? { vorbelegen } : {}),
        wiederfinden: wiederfindenAus(f as PaketFeld),
        ...(f.typ === 'referenz' ? { zielTypen: [...new Set(ziele)] } : {}),
        ...(opt?.length ? { zielOptional: opt } : {}),
        ...(f.anzeigen ? { anzeigen: wartet(f.anzeigen) ? undefined : anzeige(l, f.anzeigen, t.felder) } : {}),
        ...(quelle ? { quelle } : {}),
        berechnetVon: berechnet === true ? l.m.id : null,
      };
    });
}

/** Register eines Typs fürs Anlegen: Quellen als Ids, Anzeige der Abschnitte erst, wenn sie nicht mehr wartet. */
function registerEingabe(l: AnlegeLauf, t: PaketTyp, nurAngelegt: boolean, felder: Feld[], wartet: Wartet) {
  return t.register.map((r) => ({
    ...r,
    ...(r.quellen
      ? {
          quellen: r.quellen.map((q) => ({ typId: quelleId(l, t, q, nurAngelegt, felder), feldKey: q.feld })).filter((q) => q.typId),
        }
      : {}),
    ...(Array.isArray(r.abschnitte)
      ? {
          abschnitte: (r.abschnitte as unknown[]).map((x) =>
            istObjekt(x) && x.anzeigen
              ? wartet(x.anzeigen)
                ? { ...x, anzeigen: undefined }
                : { ...x, anzeigen: anzeige(l, x.anzeigen, t.felder) }
              : x,
          ),
        }
      : {}),
  }));
}

/**
 * Eingabe für einen Mappentyp des Pakets (anlegen bzw. ändern). `nurAngelegt` im ersten Durchgang (#1122): Was auf
 * einen Typ zeigt, den es noch nicht gibt, kommt erst im zweiten – dann ist die Eingabe `unvollstaendig`.
 */
export function typEingabe(l: AnlegeLauf, t: PaketTyp, nurAngelegt: boolean) {
  const { m, ids, a } = l;
  const { plan } = a;
  // Tabellen (#1030) auf einen Typ, den es noch nicht gibt, kommen im zweiten Durchgang – wie Verweise.
  const offen = new Set(
    t.felder
      .filter((f) =>
        [...paketZiele(f), ...tabellenTyp(f)].some(
          (z) => !(eigen(l, z) && z.split(':').pop() === t.schluessel) && ziel(l, z, nurAngelegt) === null,
        ),
      )
      .map((f) => f.key),
  );
  // Anzeige-Bedingungen (#1122) auf Felder oder Typen, die erst im zweiten Durchgang kommen, ebenso.
  const wartet = (roh: unknown) => !!roh && anzeigeWartet(roh, offen, typFehlt(l, t, nurAngelegt));
  const felder = felderEingabe(l, t, offen, wartet);
  const register = registerEingabe(l, t, nurAngelegt, felder as Feld[], wartet);
  const unvollstaendig =
    offen.size > 0 ||
    t.register.some((r) => (r.quellen ?? []).some((q) => quelleId(l, t, q, nurAngelegt, felder as Feld[]) === null)) ||
    t.felder.some((f) => wartet(f.anzeigen)) ||
    t.register.some((r) => Array.isArray(r.abschnitte) && (r.abschnitte as unknown[]).some((x) => istObjekt(x) && wartet(x.anzeigen)));
  const name = plan.typen.find((x) => x.schluessel === t.schluessel)!.name;
  return {
    unvollstaendig,
    daten: {
      id: ids.get(t.schluessel),
      name,
      schluessel: typKennung(m.id, t.schluessel),
      beschreibung: t.beschreibung,
      titelVorlage: t.titelVorlage ?? '',
      felder,
      register,
      ...(t.trefferliste ? { trefferliste: t.trefferliste.filter((k) => !offen.has(k)) } : {}),
      ...(t.beschriftungen ? { beschriftungen: t.beschriftungen } : {}),
      ...(t.ausPost !== undefined ? { ausPost: t.ausPost } : {}),
      ...(t.erkennbarAn ? { erkennbarAn: t.erkennbarAn } : {}),
      ...(t.mehrzahl ? { mehrzahl: t.mehrzahl } : {}),
      ...(t.inSuche !== undefined ? { inSuche: t.inSuche } : {}),
      // Ist Teil einer anderen Mappe (#1031): erst, wenn das Feld dabei ist (sonst im zweiten Durchgang).
      teilVon: t.gehoertZu && !offen.has(t.gehoertZu) ? t.gehoertZu : null,
      // Archivmodus (#1051) wie in der Vorschau – zählt nur beim Anlegen (und im zweiten Durchgang desselben neuen Typs);
      // das Update übernimmt den Archivmodus des vorhandenen Typs.
      archiv: plan.typen.find((x) => x.schluessel === t.schluessel)?.archiv
        ? archivOhneName(plan.typen.find((x) => x.schluessel === t.schluessel)!.archiv!)
        : null,
      sichtAnlegen: false,
    },
  };
}

/**
 * Paketstand der Mappentypen (#653): neue Typen so, wie sie angelegt wurden; beim Update bleibt der alte Stand,
 * nur was das Update hinzufügt (Felder, Register), kommt dazu – eigene Änderungen gehören nicht dazu.
 */
export function typStandNach(l: AnlegeLauf, nachher: Map<string, Mappentyp>): Record<string, TypBild> {
  const { typMap, a, vorher, abschnittRegister } = l;
  const { alt } = a;
  const typStand: Record<string, TypBild> = {};
  for (const tid of Object.values(typMap)) {
    const t = nachher.get(tid);
    if (!t) continue;
    const jetztBild = typBild(t, (id) => nachher.get(id)?.schluessel);
    const vorBild = alt?.typStand?.[tid];
    typStand[tid] = !vorBild
      ? jetztBild
      : {
          ...vorBild,
          felder: [
            ...vorBild.felder,
            ...jetztBild.felder.filter(
              (f) => !vorBild.felder.some((g) => g.key === f.key) && !vorher.get(tid)?.felder.some((g) => g.key === f.key),
            ),
          ],
          register: [
            ...vorBild.register.map((r) => {
              if (!abschnittRegister.get(tid)?.has(r.key)) return r;
              const jetzt = jetztBild.register.find((g) => g.key === r.key);
              return jetzt?.werte.abschnitte ? { ...r, werte: { ...r.werte, abschnitte: jetzt.werte.abschnitte } } : r;
            }),
            ...jetztBild.register.filter(
              (r) => !vorBild.register.some((g) => g.key === r.key) && !vorher.get(tid)?.register.some((g) => g.key === r.key),
            ),
          ],
        };
  }
  return typStand;
}

/** Herausgeber, ersetzte Ids und nötige DMS-Version für den Eintrag des Pakets. */
export function herausgeberAngaben(l: AnlegeLauf, katalogUrl: string) {
  const { m, a } = l;
  const { plan, alt, herkunft } = a;
  return {
    // Herausgeber (#1084): einmal gespeichert, gilt er für alle weiteren Updates.
    ...(plan.paket.herausgeber ? { herausgeber: plan.paket.herausgeber } : alt?.herausgeber ? { herausgeber: alt.herausgeber } : {}),
    // Ohne Herausgeber aus dem offiziellen Katalog, aber ohne gültige Signatur (#1351): nicht später doch `app.ablago`.
    ...(plan.paket.herausgeberGeprueft
      ? { herausgeberGeprueft: true }
      : !plan.paket.herausgeber && !alt?.herausgeber && herkunft.art === 'katalog' && herkunft.url === katalogUrl
        ? { herausgeberGeprueft: false }
        : {}),
    // Weiterer signierter Katalog: Herausgeber an dessen Schlüssel gebunden (Sicherheit C); bei geordnetem Wechsel der neue.
    ...(plan.herausgeberSchluessel
      ? { herausgeberSchluessel: plan.herausgeberSchluessel }
      : alt?.herausgeberSchluessel
        ? { herausgeberSchluessel: alt.herausgeberSchluessel }
        : {}),
    // Ersetzte Ids (#1084): für mitgelieferte Automatisierungen und spätere Updates unter dieser Id.
    ...(() => {
      const f = [...new Set([...(alt?.ersetzt ?? []), ...(m.ersetzt ?? [])])].filter((x) => x !== m.id);
      return f.length ? { ersetzt: f } : {};
    })(),
    // Nötige DMS-Version (#458): bestimmt u. a., ob das Paket „Volltext fertig“ auch ohne Text bekommt.
    ...(m.dms ? { dms: m.dms } : {}),
  };
}

/** Was das Paket mitbringt, für seinen Eintrag: Beispiele, Vorgaben, Einstellungen, Code, Links, Sprache, Aktionen. */
export function mitgeliefertAngaben(l: AnlegeLauf) {
  const { m, a, beispielIds, beispielStaende, vorgabenErg } = l;
  const { paket, alt, v } = a;
  return {
    // Beispiel-Mappen mit Schlüssel (#347), damit spätere Pakete auf sie verweisen können.
    ...(beispielIds.size ? { beispiele: Object.fromEntries(beispielIds) } : alt?.beispiele ? { beispiele: alt.beispiele } : {}),
    ...(beispielStaende.length
      ? { beispielMappen: beispielStaende }
      : alt?.beispielMappen?.length
        ? { beispielMappen: alt.beispielMappen }
        : {}),
    // Vorgaben (#1038): auch die, die die neue Version nicht mehr nennt – sie bleiben und gehören weiter zum Paket.
    ...(() => {
      const v = { ...alt?.vorgaben, ...vorgabenErg.vorgaben };
      return Object.keys(v).length ? { vorgaben: v } : {};
    })(),
    ...(vorgabenErg.ergaenzungen.length
      ? { ergaenzungen: vorgabenErg.ergaenzungen }
      : alt?.ergaenzungen?.length
        ? { ergaenzungen: alt.ergaenzungen }
        : {}),
    einstellungen: paket.einstellungen,
    code: m.code !== undefined,
    ...(paket.automatisierungen.length ? { automatisierungen: paket.automatisierungen.map((a) => a.schluessel) } : {}),
    ...(paket.code
      ? {
          laeufer: {
            ...paket.code.info,
            modul: modulInfo(paket.code),
            daten: paket.code.dateien.filter((d) => d.name !== 'modul.wasm').map((d) => d.name),
          },
        }
      : {}),
    ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
    ...(paket.sprache
      ? {
          sprache: {
            ...paket.sprache.angabe,
            texte: anzahlTexte(paket.sprache.texte),
            uebergangen: paket.sprache.uebergangen.length,
            beschriftungen: Object.keys(paket.sprache.beschriftungen),
          },
        }
      : {}),
    // Aktionen im Menü „Mappe“ (#1039): wie diese Version sie nennt; ausgeschaltete merkt sich die Werkbank getrennt.
    ...(paket.mappenaktionen?.length ? { mappenaktionen: paket.mappenaktionen } : {}),
  };
}
