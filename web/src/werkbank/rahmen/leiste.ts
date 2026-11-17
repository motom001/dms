import { t } from '../../sprache';
import { bereichName, wartungsPlakette } from '../../../../shared/src/werkbankansicht';
import { istOffen } from '../../../../shared/src/auskunft';
import type { useDaten } from '../../daten';
import type { WerkbankEintrag } from '../Uebersicht';
import type { WerkbankZustaende } from './zustaende';
import type { PaketeZustand } from '../paketeZustand';

/** Was die Leiste braucht: Zustände, Zahlen der Übersicht (#375) und die Automatisierungen (aus Werkbank.tsx). */
export interface LeistenKontext {
  d: ReturnType<typeof useDaten>;
  z: WerkbankZustaende & { pakete: PaketeZustand };
  uz: { [k: string]: number | null | undefined } | undefined;
  wartungAn: boolean;
  automatisierung: { zahl: number | undefined; warn: unknown };
}

const n = bereichName;
/** Zahlen links (#375): die des geladenen Bereichs, sonst die aus der Übersicht; nur > 0 anzeigen. */
const zahl = (geladen: number | null | undefined, ersatz: number | null | undefined) => (geladen ?? ersatz) || undefined;

/** Reihenfolge und Gruppen wie in BEREICHE (#354); Namen aus der Sprachdatei (#473). */
export function leistenEintraege(k: LeistenKontext): WerkbankEintrag[] {
  return [
    ...ablageEintraege(k),
    ...ablaufEintraege(k),
    ...benutzerEintraege(k),
    ...postEintraege(k),
    ...suchEintraege(k),
    ...sichernEintraege(k),
    ...einstellungenEintraege(k),
    ...wartungEintraege(k),
  ];
}

/** Übersicht und „Ablage aufbauen“ (#717). */
function ablageEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { d, uz } = k;
  const { uebersicht, nummernkreise, pakete } = k.z;
  return [
    { pfad: 'uebersicht', name: n('uebersicht'), gruppe: null, warn: uebersicht.hinweise || undefined },
    // Ablage aufbauen (#717)
    { pfad: 'pakete', name: n('pakete'), gruppe: 'ablage', zahl: zahl(pakete.stand?.installiert.length, uz?.pakete) },
    { pfad: 'beispielablage', name: n('beispielablage'), gruppe: 'ablage' },
    { pfad: 'typen', name: n('typen'), gruppe: 'ablage', zahl: d.typen.length },
    { pfad: 'sichten', name: n('sichten'), gruppe: 'ablage', zahl: d.sichten.length || undefined },
    { pfad: 'nummernkreise', name: n('nummernkreise'), gruppe: 'ablage', zahl: zahl(nummernkreise.liste?.length, uz?.nummernkreise) },
  ];
}

/** Automatisierungen, Vorlagen, Rundgänge, Tipps. */
function ablaufEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { uebersicht, ablaufvorlagen, rundgaenge, tipps } = k.z;
  return [
    {
      pfad: 'automatisierungen',
      name: n('automatisierungen'),
      gruppe: 'ablage',
      zahl: k.automatisierung.zahl,
      warn: k.automatisierung.warn || uebersicht.stand?.automatisierungen?.angehalten.length ? '!' : undefined,
      warnTitel: t('automatisierung.ui.leiste'),
    },
    {
      pfad: 'ablaufvorlagen',
      name: n('ablaufvorlagen'),
      gruppe: 'ablage',
      zahl: ablaufvorlagen.stand?.vorlagen.length || undefined,
      warn: (ablaufvorlagen.stand?.angehalten.length ?? uebersicht.stand?.ablaeufe?.angehalten.length) ? '!' : undefined,
      warnTitel: t('automatisierung.vorlage.ui.leiste'),
    },
    { pfad: 'rundgaenge', name: n('rundgaenge'), gruppe: 'ablage', zahl: rundgaenge.stand?.rundgaenge.length || undefined },
    { pfad: 'tipps', name: n('tipps'), gruppe: 'ablage', zahl: tipps.stand?.tipps.length || undefined },
  ];
}

/** Benutzer und Sicherheit, Datenschutz (#1184). */
function benutzerEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { d, uz } = k;
  const { benutzer, tresor, stempel, darfWeg, datenschutz } = k.z;
  return [
    // Benutzer und Sicherheit
    {
      pfad: 'benutzer',
      name: n('benutzer'),
      gruppe: 'benutzer',
      zahl: zahl(benutzer.geladen ? benutzer.liste.filter((b) => b.aktiv).length : undefined, uz?.benutzer),
    },
    {
      pfad: 'verschluesselung',
      name: n('verschluesselung'),
      gruppe: 'benutzer',
      warn: tresor.stand && tresor.stand.zustand !== 'vorhanden' ? t('werkbank.leiste.fehlt') : undefined,
    },
    ...(d.typen.some((x) => x.archiv)
      ? [{ pfad: 'aufbewahrung', name: n('aufbewahrung'), gruppe: 'benutzer' as const, zahl: zahl(darfWeg.liste?.length, uz?.darfWeg) }]
      : []),
    { pfad: 'stempel', name: n('stempel'), gruppe: 'benutzer', zahl: stempel.liste?.length || undefined },
    // Datenschutz (#1184): drei Einträge, nur bei beruflicher Nutzung in der Leiste (`inLeiste` unten).
    {
      pfad: 'auskuenfte',
      name: n('auskuenfte'),
      gruppe: 'datenschutz',
      zahl: datenschutz.stand?.verzeichnis.filter((e) => istOffen(e.zustand)).length || undefined,
    },
    {
      pfad: 'loeschkonzept',
      name: n('loeschkonzept'),
      gruppe: 'datenschutz',
      warn: datenschutz.stand?.loeschkonzept?.luecken.length ? '!' : undefined,
      warnTitel: t('werkbank.loeschkonzept.personendaten'),
    },
    { pfad: 'loeschprotokoll', name: n('loeschprotokoll'), gruppe: 'datenschutz' },
  ];
}

/** Post und Eingänge. */
function postEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { uz } = k;
  const { uebersicht, eingang, postfaecher } = k.z;
  return [
    // Post und Eingänge
    {
      pfad: 'postfaecher',
      name: n('postfaecher'),
      gruppe: 'post',
      zahl: zahl(postfaecher.liste?.length, uz?.postfaecher),
      warn:
        uebersicht.stand?.postfachAnmeldung?.length ||
        postfaecher.liste?.some((p) => p.stand.fehlerFolge > 0 || (p.oauth && p.oauth.zustand !== 'ok'))
          ? '!'
          : undefined,
      warnTitel: uebersicht.stand?.postfachAnmeldung?.length
        ? t('werkbank.leiste.postfach.anmeldung')
        : t('werkbank.leiste.postfach.abruf'),
    },
    ...(eingang.stand?.vorhanden
      ? [
          {
            pfad: 'eingangsordner',
            name: n('eingangsordner'),
            gruppe: 'post' as const,
            warn: eingang.stand.fehler?.length ? String(eingang.stand.fehler.length) : undefined,
            warnTitel: t('werkbank.leiste.eingangsordner'),
          },
        ]
      : []),
  ];
}

/** WebDAV, Texterkennung, gleichbedeutende Wörter. */
function suchEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { woerter, uebersicht, webdav } = k.z;
  return [
    {
      pfad: 'webdav',
      name: n('webdav'),
      gruppe: 'post',
      warn: webdav.stand?.einstellung.aktiv ? t('werkbank.leiste.an') : undefined,
      warnTitel: t('werkbank.leiste.webdav'),
    },
    {
      pfad: 'texterkennung',
      name: n('texterkennung'),
      gruppe: 'post',
      warn: uebersicht.stand?.texterkennung?.fehler ? String(uebersicht.stand.texterkennung.fehler) : undefined,
      warnTitel: t('werkbank.leiste.texterkennung'),
    },
    { pfad: 'woerter', name: n('woerter'), gruppe: 'post', zahl: woerter.gruppen?.length || undefined },
  ];
}

/** Daten sichern. */
function sichernEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { papierkorb, uebersicht } = k.z;
  return [
    // Daten sichern
    {
      pfad: 'sicherung',
      name: n('sicherung'),
      gruppe: 'sichern',
      warn:
        uebersicht.stand?.sicherung &&
        (uebersicht.stand.sicherung.fehler || (uebersicht.stand.sicherung.schluessel && uebersicht.stand.sicherung.zuAlt))
          ? '!'
          : undefined,
      warnTitel: t('werkbank.leiste.sicherung'),
    },
    { pfad: 'vollexport', name: n('vollexport'), gruppe: 'sichern' },
    {
      pfad: 'papierkorb',
      name: n('papierkorb'),
      gruppe: 'sichern',
      zahl: zahl(
        papierkorb.eintraege ? papierkorb.eintraege.length + papierkorb.dokumente.length : undefined,
        uebersicht.stand?.papierkorb.anzahl,
      ),
    },
    { pfad: 'daten', name: n('daten'), gruppe: 'sichern' },
  ];
}

/** Einstellungen. */
function einstellungenEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { d } = k;
  const { aufgaben, uebersicht, anmeldeschutz, organisation } = k.z;
  return [
    // Einstellungen
    {
      pfad: 'betrieb',
      name: n('betrieb'),
      gruppe: 'einstellungen',
      warn: uebersicht.stand && !uebersicht.stand.mail ? t('werkbank.leiste.aus') : undefined,
      warnTitel: t('werkbank.leiste.mail'),
    },
    { pfad: 'region', name: n('region'), gruppe: 'einstellungen' },
    { pfad: 'sprachen', name: n('sprachen'), gruppe: 'einstellungen' },
    // Eigene Organisation (#995) mit der Nutzung (#1170): Notizen an die Verwaltung (Merkmal oder Verantwortliche geändert).
    {
      pfad: 'organisation',
      name: n('organisation'),
      gruppe: 'einstellungen',
      warn: organisation.stand?.neu ? String(organisation.stand.neu) : undefined,
      warnTitel: t('werkbank.organisation.notizen.titel'),
    },
    {
      pfad: 'aufgaben',
      name: n('aufgaben'),
      gruppe: 'einstellungen',
      zahl: zahl(aufgaben.liste?.filter((a) => !a.erledigt).length, uebersicht.stand?.aufgaben.offen),
      // #798: Aufgaben bei Personen ohne Leserecht.
      warn: uebersicht.stand?.ohneLeserecht ? '!' : undefined,
      warnTitel: t('werkbank.ohne-leserecht.titel'),
    },
    { pfad: 'anmeldeschutz', name: n('anmeldeschutz'), gruppe: 'einstellungen', zahl: anmeldeschutz.stand?.gesperrt.length || undefined },
    { pfad: 'designs', name: n('designs'), gruppe: 'einstellungen', zahl: d.designs.length || undefined },
    {
      pfad: 'anbindung',
      name: n('anbindung'),
      gruppe: 'einstellungen',
      warn:
        uebersicht.stand?.anbindung && (uebersicht.stand.anbindung.umgebung === 'abweichend' || uebersicht.stand.anbindung.neustartNoetig)
          ? '!'
          : undefined,
      warnTitel: t('werkbank.leiste.anbindung'),
    },
  ];
}

/** Wartung und Fehlersuche. */
function wartungEintraege(k: LeistenKontext): WerkbankEintrag[] {
  const { d, wartungAn } = k;
  const { protokoll, uebersicht, wartungsmodus, systemlast } = k.z;
  return [
    // Wartung und Fehlersuche
    {
      pfad: 'systemzustand',
      name: n('systemzustand'),
      gruppe: 'wartung',
      ...(uebersicht.stand?.speicherplatz && uebersicht.stand.speicherplatz.zustand !== 'ok'
        ? {
            warn:
              uebersicht.stand.speicherplatz.zustand === 'grenze'
                ? t('werkbank.leiste.speicher.voll')
                : t('werkbank.leiste.speicher.knapp'),
            warnTitel: t('werkbank.leiste.speicher'),
          }
        : // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
          systemlast.stand?.warnung.length || uebersicht.stand?.auslastung?.length
          ? { warn: t('systemzustand.warnung.plakette'), warnTitel: t('systemzustand.warnung.leiste') }
          : {}),
    },
    {
      pfad: 'protokoll',
      name: n('protokoll'),
      gruppe: 'wartung',
      warn: protokoll.debug?.an ? t('werkbank.leiste.debug') : undefined,
      warnTitel: t('werkbank.leiste.debug.titel'),
    },
    {
      pfad: 'fehlermeldungen',
      name: n('fehlermeldungen'),
      gruppe: 'wartung',
      warn: uebersicht.stand?.fehlermeldungen ? String(uebersicht.stand.fehlermeldungen) : undefined,
      warnTitel: t('werkbank.leiste.fehlermeldungen'),
    },
    {
      pfad: 'wartung',
      name: n('wartung'),
      gruppe: 'wartung',
      warn: wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null),
      warnTitel: wartungAn ? t('werkbank.leiste.wartung.an') : t('werkbank.leiste.wartung.angekuendigt'),
    },
    { pfad: 'demo', name: n('demo'), gruppe: 'wartung', zahl: Object.values(d.zaehler.typen).reduce((a, z) => a + z.demo, 0) || undefined },
  ];
}
