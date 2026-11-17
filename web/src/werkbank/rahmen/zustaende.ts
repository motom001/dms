import { useEffect } from 'react';
import { useWoerter } from '../Woerter';
import { useRundgaenge } from '../Rundgaenge';
import { useTippsWerkbank } from '../TippsWerkbank';
import { useAnmeldeschutz } from '../Anmeldeschutz';
import { useRegion } from '../Region';
import { useDatenEinstellungen } from '../DatenEinstellungen';
import { useNutzung, useOrganisation } from '../Organisation';
import { useSprachen } from '../Sprachen';
import { useNummernkreise } from '../Nummernkreise';
import { useStempelVorlagenWerkbank } from '../Stempel';
import { useDarfWeg } from '../Archiv';
import { useDatenschutz } from '../Datenschutz';
import { useVollexport } from '../Vollexport';
import { usePostfaecher } from '../Postfaecher';
import { useEingangsordner } from '../Eingangsordner';
import { useWebdav } from '../Webdav';
import { useAblaufvorlagen } from '../Ablaufvorlagen';
import { useBenutzer } from '../Benutzer';
import { useBetrieb } from '../betriebZustand';
import { useDatenbank } from '../Datenbank';
import { useExtern } from '../ExterneDienste';
import { useProtokoll } from '../Protokoll';
import { useTechnik } from '../Technik';
import { useTresor } from '../Verschluesselung';
import { useAufgaben } from '../Aufgaben';
import { useAufgabenEmpfaenger } from '../AufgabenEmpfaenger';
import { useTexterkennung } from '../Texterkennung';
import { useWerkbankAnsicht } from '../Ansicht';
import { useUebersicht } from '../Uebersicht';
import { useWartungsmodus } from '../Wartungsmodus';
import { useSicherung } from '../Sicherung';
import { useFehlermeldungen } from '../Fehlermeldungen';
import { useAnbindung } from '../Anbindung';
import { useSpeicherplatz } from '../Speicherplatz';
import { useSystemlast } from '../Auslastung';
import { usePapierkorb } from '../../ablage/Papierkorb';
import { filterAusAdresse } from '../../../../shared/src/aufgabenfilter';
import { useBeiWiederErreichbar } from '../../erreichbar';
import { geheZu } from '../../ort';
import { abschnittUmleitung, werkbankUmleitung } from '../../../../shared/src/werkbankansicht';

/*
 * Zustände der Werkbank (#819), in drei Hooks in der Reihenfolge von früher – dazwischen ruft Werkbank.tsx
 * useAutomatisierungen und usePakete selbst auf. Jeder lädt nur, wenn sein Bereich offen ist.
 */

/** Benutzer bis WebDAV. */
export function useWerkbankZustaende1(bereich: string, darf: (pfad: string) => boolean) {
  const benutzer = useBenutzer();
  const protokoll = useProtokoll(bereich === 'protokoll');
  const datenbank = useDatenbank(bereich === 'systemzustand');
  const externeDienste = useExtern(bereich === 'systemzustand');
  const technik = useTechnik(bereich === 'systemzustand');
  const betrieb = useBetrieb();
  const tresor = useTresor(darf('verschluesselung'));
  const papierkorb = usePapierkorb(true, bereich === 'papierkorb');
  const aufgabenFilter = filterAusAdresse(new URLSearchParams(location.search));
  const aufgaben = useAufgaben(bereich === 'aufgaben', !!aufgabenFilter.erledigt);
  const aufgabenEmpfaenger = useAufgabenEmpfaenger(bereich === 'benutzer');
  const ocr = useTexterkennung(bereich === 'texterkennung' || bereich === 'wartung');
  const woerter = useWoerter(bereich === 'woerter');
  const uebersicht = useUebersicht();
  const meldungen = useFehlermeldungen(bereich === 'fehlermeldungen');
  const wartungsmodus = useWartungsmodus(bereich === 'wartung');
  const sicherung = useSicherung(bereich === 'sicherung');
  const speicherplatz = useSpeicherplatz(bereich === 'systemzustand');
  const systemlast = useSystemlast(bereich === 'systemzustand');
  const eingang = useEingangsordner(bereich === 'eingangsordner');
  const webdav = useWebdav(bereich === 'webdav');
  return {
    benutzer,
    protokoll,
    datenbank,
    externeDienste,
    technik,
    betrieb,
    tresor,
    papierkorb,
    aufgabenFilter,
    aufgaben,
    aufgabenEmpfaenger,
    ocr,
    woerter,
    uebersicht,
    meldungen,
    wartungsmodus,
    sicherung,
    speicherplatz,
    systemlast,
    eingang,
    webdav,
  };
}

/** Automatisierungsvorlagen bis Vollexport, mit dem Recht auf die Datenschutz-Bereiche. */
export function useWerkbankZustaende2(bereich: string, darf: (pfad: string) => boolean) {
  const ablaufvorlagen = useAblaufvorlagen(bereich === 'ablaufvorlagen');
  const rundgaenge = useRundgaenge(bereich === 'rundgaenge');
  const tipps = useTippsWerkbank(bereich === 'tipps');
  const postfaecher = usePostfaecher(bereich === 'postfaecher');
  const nummernkreise = useNummernkreise(bereich === 'nummernkreise');
  const stempel = useStempelVorlagenWerkbank(bereich === 'stempel');
  const darfWeg = useDarfWeg(bereich === 'aufbewahrung');
  // Vorgaben der Auskünfte stehen seit #1183 auf „Eigene Organisation“ – dort nur mit Recht auf die Datenschutz-Bereiche.
  const datenschutzRecht = darf('auskuenfte') || darf('loeschkonzept');
  const datenschutz = useDatenschutz(
    bereich === 'auskuenfte' || bereich === 'loeschkonzept' || (bereich === 'organisation' && datenschutzRecht),
  );
  const vollexport = useVollexport(bereich === 'vollexport');
  return { ablaufvorlagen, rundgaenge, tipps, postfaecher, nummernkreise, stempel, darfWeg, datenschutzRecht, datenschutz, vollexport };
}

/** Anmeldeschutz bis „Werkbank anpassen“. */
export function useWerkbankZustaende3(bereich: string) {
  const anmeldeschutz = useAnmeldeschutz(bereich === 'anmeldeschutz');
  const region = useRegion(bereich === 'region');
  const daten = useDatenEinstellungen(bereich === 'daten');
  const nutzung = useNutzung(bereich === 'organisation');
  const organisation = useOrganisation(bereich === 'organisation');
  const sprachen = useSprachen(bereich === 'sprachen');
  const anbindung = useAnbindung(bereich === 'anbindung');
  const ansicht = useWerkbankAnsicht();
  return { anmeldeschutz, region, daten, nutzung, organisation, sprachen, anbindung, ansicht };
}

export type WerkbankZustaende = ReturnType<typeof useWerkbankZustaende1> &
  ReturnType<typeof useWerkbankZustaende2> &
  ReturnType<typeof useWerkbankZustaende3> & {
    automatisierungen: { laden: () => Promise<unknown> };
  };

/** Wieder erreichbar nach Update oder Neustart (#122): Übersicht und offenen Bereich neu laden. */
export function useWiederLaden(bereich: string, z: WerkbankZustaende) {
  const { uebersicht, protokoll, betrieb, tresor, papierkorb, aufgaben, ocr, woerter, wartungsmodus, meldungen, sicherung } = z;
  const { speicherplatz, systemlast, technik, datenbank, anbindung, benutzer, webdav, automatisierungen } = z;
  const { ablaufvorlagen, rundgaenge, tipps, datenschutz, daten } = z;
  useBeiWiederErreichbar(() => {
    void uebersicht.laden();
    const offen: Record<string, (() => Promise<unknown>) | undefined> = {
      protokoll: protokoll.neu,
      betrieb: betrieb.laden,
      verschluesselung: tresor.laden,
      papierkorb: papierkorb.laden,
      aufgaben: aufgaben.laden,
      texterkennung: ocr.laden,
      woerter: woerter.laden,
      wartung: async () => {
        await ocr.laden();
        await wartungsmodus.laden();
      },
      fehlermeldungen: meldungen.laden,
      sicherung: sicherung.laden,
      systemzustand: async () => {
        await speicherplatz.laden();
        await systemlast.laden();
        await technik.laden();
        await datenbank.laden();
      },
      anbindung: anbindung.laden,
      benutzer: benutzer.laden,
      webdav: webdav.laden,
      automatisierungen: automatisierungen.laden,
      ablaufvorlagen: ablaufvorlagen.laden,
      rundgaenge: rundgaenge.laden,
      tipps: tipps.laden,
      auskuenfte: datenschutz.laden,
      loeschkonzept: datenschutz.laden,
      daten: daten.laden,
    };
    void offen[bereich]?.();
  });
}

/** Benutzer beim Öffnen neu laden, alte Links und Abschnitte umleiten, zur Sprungmarke rollen. */
export function useWerkbankSprung(bereich: string, id: string | undefined, benutzer: { laden: () => Promise<unknown> }) {
  // Anmeldungen und Aktivität ändern sich laufend: beim Öffnen der Benutzer neu laden.
  useEffect(() => {
    if (bereich === 'benutzer') void benutzer.laden();
  }, [bereich, id]); // eslint-disable-line react-hooks/exhaustive-deps -- neu laden nur beim Wechsel von Bereich oder Eintrag
  // Alte Direktlinks (#366): in Bereiche ohne Mitte → Seite, Eintrag aufgeklappt; /werkbank/stempel?offen=:id → /werkbank/stempel/:id (#990);
  // umgezogene Bereiche (#407: /werkbank/datenbank → /werkbank/anbindung) an die neue Stelle.
  const umleitung = werkbankUmleitung(bereich, id, location.search);
  useEffect(() => {
    if (umleitung) geheZu(umleitung, true);
  }, [umleitung]);
  // Umgezogene Abschnitte (#1184): /werkbank/loeschkonzept#loeschprotokoll → /werkbank/loeschprotokoll.
  const abschnittNeu = abschnittUmleitung(bereich, location.hash.slice(1));
  useEffect(() => {
    if (abschnittNeu) geheZu(abschnittNeu, true);
  }, [abschnittNeu]);
  // Sprungmarke (#725): Zusammengelegte Bereiche stehen als Abschnitt auf einer Seite (z. B. /werkbank/wartung#wartungsmodus).
  // Der Abschnitt erscheint oft erst nach dem Laden – kurz danach suchen.
  const marke = location.hash.slice(1);
  useEffect(() => {
    if (!marke) return;
    let n = 0;
    const iv = setInterval(() => {
      const el = document.getElementById(marke);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        clearInterval(iv);
      } else if (++n > 30) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, [bereich, marke]);
  return umleitung;
}
