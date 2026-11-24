import { t } from '../../sprache';
import {
  BEREICHE,
  bereichLeistenName,
  bereichName,
  wartungsPlakette,
  type Bereichskennung,
  type Zaehler,
} from '../../../../shared/src/werkbankansicht';
import { istOffen } from '../../../../shared/src/auskunft';
import type { useDaten } from '../../daten';
import type { WerkbankEintrag } from '../Uebersicht';
import type { WerkbankZustaende } from './zustaende';
import type { PaketeZustand } from '../paketeZustand';

/** Was die Leiste braucht: Zustände, Zahlen der Übersicht (#375) und die Automatisierungen (aus Werkbank.tsx). */
export interface LeistenKontext {
  d: ReturnType<typeof useDaten>;
  z: WerkbankZustaende & { pakete: PaketeZustand };
  /** Zahlen der Übersicht je Zähler aus der Liste der Werkbank-Seiten (`zaehler`, #1281). */
  uz: Readonly<Record<Zaehler, number | null>> | undefined;
  wartungAn: boolean;
  automatisierung: { zahl: number | undefined; warn: unknown };
}

const n = bereichName;
/**
 * Zahlen links (#375): die des geladenen Bereichs, sonst die aus der Übersicht. Auch die 0 steht da (#1287, Leitsatz 9);
 * nichts steht nur, solange beides noch fehlt.
 */
const zahl = (geladen: number | null | undefined, ersatz: number | null | undefined) => geladen ?? ersatz ?? undefined;

/** Was ein Eintrag der Leiste außer Name und Gruppe zeigt; `null` = steht gerade nicht in der Leiste. */
type Zusatz = Pick<WerkbankEintrag, 'zahl' | 'warn' | 'warnTitel'> | null;
type Zusaetze = Partial<Record<Bereichskennung, (k: LeistenKontext) => Zusatz>>;

/**
 * Einträge der Leiste (#354, #1281): Reihenfolge, Gruppen und Bereiche aus der Liste der Werkbank-Seiten, Namen aus der
 * Sprachdatei (#473); hier nur, was ein Bereich zusätzlich zeigt (Zahl, Hinweis) oder wann er fehlt.
 */
export function leistenEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { uebersicht } = k.z;
  return [
    { pfad: 'uebersicht', name: n('uebersicht'), gruppe: null, warn: uebersicht.hinweise || undefined },
    ...BEREICHE.flatMap((b) => {
      const f = ZUSATZ[b.pfad as Bereichskennung];
      const x = f ? f(k) : {};
      // In der Leiste steht die Gruppe darüber: dort der kurze Name (#1310), sonst überall der ganze Weg.
      return x === null ? [] : [{ pfad: b.pfad, name: bereichLeistenName(b.pfad), gruppe: b.gruppe, ...x }];
    }),
  ];
}

/** „Ablage aufbauen“ (#717): Pakete, Mappentypen, Ansichten, Nummernkreise, Automatisierungen, Vorlagen, Rundgänge, Tipps. */
const ABLAGE: Zusaetze = {
  pakete: ({ z, uz }) => ({ zahl: zahl(z.pakete.stand?.installiert.length, uz?.pakete) }),
  typen: ({ d }) => ({ zahl: d.typen.length }),
  sichten: ({ d }) => ({ zahl: d.sichten.length }),
  nummernkreise: ({ z, uz }) => ({ zahl: zahl(z.nummernkreise.liste?.length, uz?.nummernkreise) }),
  automatisierungen: ({ z, automatisierung }) => ({
    zahl: automatisierung.zahl,
    warn: automatisierung.warn || z.uebersicht.stand?.automatisierungen?.angehalten.length ? '!' : undefined,
    warnTitel: t('automatisierung.ui.leiste'),
  }),
  ablaufvorlagen: ({ z: { ablaufvorlagen, uebersicht } }) => ({
    zahl: ablaufvorlagen.stand?.vorlagen.length,
    warn: (ablaufvorlagen.stand?.angehalten.length ?? uebersicht.stand?.ablaeufe?.angehalten.length) ? '!' : undefined,
    warnTitel: t('automatisierung.vorlage.ui.leiste'),
  }),
  rundgaenge: ({ z }) => ({ zahl: z.rundgaenge.stand?.rundgaenge.length }),
  tipps: ({ z }) => ({ zahl: z.tipps.stand?.tipps.length }),
};

/** Benutzer und Sicherheit, Datenschutz (#1184; seit #1319 nur an der Stufe, wie jede andere Gruppe). */
const BENUTZER: Zusaetze = {
  benutzer: ({ z: { benutzer }, uz }) => ({
    zahl: zahl(benutzer.geladen ? benutzer.liste.filter((b) => b.aktiv).length : undefined, uz?.benutzer),
  }),
  verschluesselung: ({ z: { tresor } }) => ({
    warn: tresor.stand && tresor.stand.zustand !== 'vorhanden' ? t('werkbank.leiste.fehlt') : undefined,
  }),
  // Nur mit Archivmodus an einem Mappentyp.
  aufbewahrung: ({ d, z, uz }) => (d.typen.some((x) => x.archiv) ? { zahl: zahl(z.darfWeg.liste?.length, uz?.darfWeg) } : null),
  stempel: ({ z }) => ({ zahl: z.stempel.liste?.length }),
  auskuenfte: ({ z }) => ({ zahl: z.datenschutz.stand?.verzeichnis.filter((e) => istOffen(e.zustand)).length }),
  // Lücken im Löschkonzept warnen nur bei beruflicher Nutzung (#1319): Sonst holte die Warnung die Gruppe Datenschutz
  // in die Leiste, obwohl die Stufe sie nicht enthält – ein Löschkonzept braucht die private Ablage nicht.
  loeschkonzept: ({ d, z }) => ({
    warn: z.datenschutz.stand?.loeschkonzept?.luecken.length && d.zaehler.merkmale?.beruflich ? '!' : undefined,
    warnTitel: t('werkbank.loeschkonzept.personendaten'),
  }),
};

/** Post und Eingänge: Postfächer, Eingangsordner (nur wenn eingebunden), WebDAV, Texterkennung, gleichbedeutende Wörter. */
const POST: Zusaetze = {
  postfaecher: ({ z: { uebersicht, postfaecher }, uz }) => ({
    zahl: zahl(postfaecher.liste?.length, uz?.postfaecher),
    warn:
      uebersicht.stand?.postfachAnmeldung?.length ||
      postfaecher.liste?.some((p) => p.stand.fehlerFolge > 0 || (p.oauth && p.oauth.zustand !== 'ok'))
        ? '!'
        : undefined,
    warnTitel: uebersicht.stand?.postfachAnmeldung?.length ? t('werkbank.leiste.postfach.anmeldung') : t('werkbank.leiste.postfach.abruf'),
  }),
  eingangsordner: ({ z: { eingang } }) =>
    eingang.stand?.vorhanden
      ? {
          warn: eingang.stand.fehler?.length ? String(eingang.stand.fehler.length) : undefined,
          warnTitel: t('werkbank.leiste.eingangsordner'),
        }
      : null,
  webdav: ({ z }) => ({
    warn: z.webdav.stand?.einstellung.aktiv ? t('werkbank.leiste.an') : undefined,
    warnTitel: t('werkbank.leiste.webdav'),
  }),
  texterkennung: ({ z: { uebersicht } }) => ({
    warn: uebersicht.stand?.texterkennung?.fehler ? String(uebersicht.stand.texterkennung.fehler) : undefined,
    warnTitel: t('werkbank.leiste.texterkennung'),
  }),
  woerter: ({ z }) => ({ zahl: z.woerter.gruppen?.length }),
};

/** Daten sichern. */
const SICHERN: Zusaetze = {
  sicherung: ({ z: { uebersicht } }) => ({
    warn:
      uebersicht.stand?.sicherung &&
      (uebersicht.stand.sicherung.fehler || (uebersicht.stand.sicherung.schluessel && uebersicht.stand.sicherung.zuAlt))
        ? '!'
        : undefined,
    warnTitel: t('werkbank.leiste.sicherung'),
  }),
  papierkorb: ({ z: { papierkorb, uebersicht } }) => ({
    zahl: zahl(
      papierkorb.eintraege ? papierkorb.eintraege.length + papierkorb.dokumente.length : undefined,
      uebersicht.stand?.papierkorb.anzahl,
    ),
  }),
};

/** Einstellungen. */
const EINSTELLUNGEN: Zusaetze = {
  betrieb: ({ z: { uebersicht } }) => ({
    warn: uebersicht.stand && !uebersicht.stand.mail ? t('werkbank.leiste.aus') : undefined,
    warnTitel: t('werkbank.leiste.mail'),
  }),
  // Eigene Organisation (#995) mit der Nutzung (#1170): Notizen an die Verwaltung (Merkmal oder Verantwortliche geändert).
  organisation: ({ z: { organisation } }) => ({
    warn: organisation.stand?.neu ? String(organisation.stand.neu) : undefined,
    warnTitel: t('werkbank.organisation.notizen.titel'),
  }),
  aufgaben: ({ z: { aufgaben, uebersicht } }) => ({
    zahl: zahl(aufgaben.liste?.filter((a) => !a.erledigt).length, uebersicht.stand?.aufgaben.offen),
    // #798: Aufgaben bei Personen ohne Leserecht.
    warn: uebersicht.stand?.ohneLeserecht ? '!' : undefined,
    warnTitel: t('werkbank.ohne-leserecht.titel'),
  }),
  anmeldeschutz: ({ z }) => ({ zahl: z.anmeldeschutz.stand?.gesperrt.length }),
  designs: ({ d }) => ({ zahl: d.designs.length }),
  anbindung: ({ z: { uebersicht } }) => ({
    warn:
      uebersicht.stand?.anbindung && (uebersicht.stand.anbindung.umgebung === 'abweichend' || uebersicht.stand.anbindung.neustartNoetig)
        ? '!'
        : undefined,
    warnTitel: t('werkbank.leiste.anbindung'),
  }),
};

/** Wartung und Fehlersuche. */
const WARTUNG: Zusaetze = {
  systemzustand: ({ z: { uebersicht, systemlast } }) =>
    uebersicht.stand?.speicherplatz && uebersicht.stand.speicherplatz.zustand !== 'ok'
      ? {
          warn:
            uebersicht.stand.speicherplatz.zustand === 'grenze' ? t('werkbank.leiste.speicher.voll') : t('werkbank.leiste.speicher.knapp'),
          warnTitel: t('werkbank.leiste.speicher'),
        }
      : // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
        systemlast.stand?.warnung.length || uebersicht.stand?.auslastung?.length
        ? { warn: t('systemzustand.warnung.plakette'), warnTitel: t('systemzustand.warnung.leiste') }
        : {},
  protokoll: ({ z: { protokoll } }) => ({
    warn: protokoll.debug?.an ? t('werkbank.leiste.debug') : undefined,
    warnTitel: t('werkbank.leiste.debug.titel'),
  }),
  fehlermeldungen: ({ z: { uebersicht } }) => ({
    warn: uebersicht.stand?.fehlermeldungen ? String(uebersicht.stand.fehlermeldungen) : undefined,
    warnTitel: t('werkbank.leiste.fehlermeldungen'),
  }),
  wartung: ({ z: { wartungsmodus }, wartungAn }) => ({
    warn: wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null),
    warnTitel: wartungAn ? t('werkbank.leiste.wartung.an') : t('werkbank.leiste.wartung.angekuendigt'),
  }),
  demo: ({ d }) => ({ zahl: Object.values(d.zaehler.typen).reduce((a, z) => a + z.demo, 0) }),
};

const ZUSATZ: Zusaetze = { ...ABLAGE, ...BENUTZER, ...POST, ...SICHERN, ...EINSTELLUNGEN, ...WARTUNG };
