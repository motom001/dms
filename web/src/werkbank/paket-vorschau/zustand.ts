import { useEffect, useState } from 'react';
import { vorausgewaehlt } from '../../../../shared/src/pakete';
import type { UmbauEntscheidungen } from '../../../../shared/src/umbau';
import { hatGesamt } from '../../../../shared/src/verwaltungsrecht';
import { betriebApi } from '../../api/betrieb';
import type { PaketVorschau } from '../../api/pakete';
import { useKonto } from '../../konto';
import { t as tx, t } from '../../sprache';
import { umbauStart, type UmbauStand } from '../PaketUmbau';

/**
 * Zustand der Paket-Vorschau (#1279 aus VorschauBlock gezogen): Namen, Haken, Umbau und die Antwort, die Installieren
 * bzw. Aktualisieren braucht – samt „gesperrt“, solange etwas fehlt.
 */

/** Antworten einer Vorschau – was Installieren bzw. Aktualisieren braucht; sichern: vor dem Umbau eine Sicherung (#702). */
export interface VorschauAntwort {
  namen: Record<string, string>;
  sichtNamen: Record<string, string>;
  beispiele: boolean;
  mitAbhaengigkeiten: boolean;
  automatisierungen: string[];
  rechteBestaetigt?: boolean;
  bestaetigt?: boolean;
  herausgeberBestaetigt?: boolean;
  umbauBestaetigt?: boolean;
  umbauEntscheidungen?: UmbauEntscheidungen;
  sichtenErsetzen?: string[];
  /** Update vorhandener Mappentypen (#1658): Teile trotzdem ersetzen, entfallende Felder behalten. */
  typTeileErsetzen?: string[];
  felderBehalten?: string[];
  sichern?: boolean;
}

/** „Vorher sichern“ (#702): eine Sicherung starten und abwarten. Liefert den Fehler oder null; scheitert sie, kein Umbau. */
export async function sicherungVorher(): Promise<string | null> {
  try {
    let lauf: Awaited<ReturnType<typeof betriebApi.sicherungLauf>> = await betriebApi.sicherungJetzt();
    while (lauf?.status === 'laeuft') {
      await new Promise((r) => setTimeout(r, 1500));
      lauf = await betriebApi.sicherungLauf();
    }
    return lauf?.status === 'fehler' ? t('pakete.umbau.vorschau.sicherung-fehler', { fehler: lauf.fehler ?? '' }) : null;
  } catch (e) {
    return t('pakete.umbau.vorschau.sicherung-fehler', { fehler: (e as Error).message });
  }
}

/** Namen neuer Mappentypen und Ansichten: Vorschlag des Servers oder der Name aus dem Paket. */
function useNamen(v: PaketVorschau) {
  const [namen, setNamen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      v.typen.filter((eintrag) => !eintrag.vorhanden).map((eintrag) => [eintrag.schluessel, eintrag.vorschlag ?? eintrag.name]),
    ),
  );
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>(() =>
    Object.fromEntries(v.sichten.filter((s) => !s.vorhanden && !s.ausgelassen).map((s) => [s.schluessel, s.vorschlag ?? s.name])),
  );
  const konflikt =
    v.typen.some(
      (eintrag) =>
        !eintrag.vorhanden && eintrag.konflikt && (namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase(),
    ) ||
    v.sichten.some(
      (s) => !s.vorhanden && !s.ausgelassen && s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase(),
    );
  const leer = Object.values(namen).some((n) => !n.trim()) || Object.values(sichtNamen).some((n) => !n.trim());
  return { namen, setNamen, sichtNamen, setSichtNamen, konflikt, leer };
}

/** Herkunft bestätigen (#189, #594): außerhalb des offiziellen Katalogs bzw. ohne gültige Signatur. */
function pruefWarnungVon(v: PaketVorschau, warnung: string | null) {
  return (
    warnung ??
    (v.pruefung?.bestaetigen
      ? v.pruefung.art === 'ungueltig'
        ? tx('pakete.herkunft.warnung.ungueltig')
        : v.pruefung.art === 'nichtgeprueft'
          ? tx('pakete.herkunft.warnung.nichtgeprueft')
          : ''
      : null)
  );
}

/** Die Antwort aus dem Zustand: nur gesetzte Bestätigungen, Umbau nur mit Plänen, ersetzte Ansichten nur, wenn welche. */
function antwortVon(x: {
  namen: Record<string, string>;
  sichtNamen: Record<string, string>;
  neueAutos: Array<{ schluessel: string }>;
  ohneAuto: string[];
  beispiele: boolean;
  mit: boolean;
  rechteOk: boolean;
  herausgeberOk: boolean;
  ok: boolean;
  umbau: unknown[];
  umbauStand: UmbauStand;
  ersetzen: string[];
  typErsetzen: string[];
  behalten: string[];
}): VorschauAntwort {
  return {
    namen: x.namen,
    sichtNamen: x.sichtNamen,
    beispiele: x.beispiele,
    mitAbhaengigkeiten: x.mit,
    automatisierungen: x.neueAutos.map((a) => a.schluessel).filter((k) => !x.ohneAuto.includes(k)),
    ...(x.rechteOk ? { rechteBestaetigt: true } : {}),
    ...(x.herausgeberOk ? { herausgeberBestaetigt: true } : {}),
    ...(x.ok ? { bestaetigt: true } : {}),
    ...(x.umbau.length
      ? { umbauBestaetigt: true, umbauEntscheidungen: x.umbauStand.entscheidungen, ...(x.umbauStand.sichern ? { sichern: true } : {}) }
      : {}),
    ...(x.ersetzen.length ? { sichtenErsetzen: x.ersetzen } : {}),
    ...(x.typErsetzen.length ? { typTeileErsetzen: x.typErsetzen } : {}),
    ...(x.behalten.length ? { felderBehalten: x.behalten } : {}),
  };
}

export function useVorschau({
  v,
  warnung,
  herkunftBestaetigt,
  ohne,
  melde,
}: {
  v: PaketVorschau;
  warnung: string | null;
  herkunftBestaetigt: boolean;
  ohne: string[];
  melde?(x: VorschauAntwort | null): void;
}) {
  // Mitgelieferte Automatisierungen (#712): abgewählte bleiben aus. Vorausgewählt (#1082): die mit eingeschaltet: true –
  // nennt das Paket das nirgends, wie bisher alle.
  const neueAutos = (v.automatisierungen ?? []).filter((a) => a.neu);
  const [ohneAuto, setOhneAuto] = useState<string[]>(() => {
    const an = vorausgewaehlt(v.automatisierungen ?? []);
    return neueAutos.filter((a) => !an.includes(a.schluessel)).map((a) => a.schluessel);
  });
  const n = useNamen(v);
  // Ansichten (#1125): geänderte bzw. vor #1125 installierte bleiben – außer, sie sind hier angehakt.
  const [ersetzen, setErsetzen] = useState<string[]>([]);
  // Mappentypen (#1658): Geändertes bleibt, Entfallendes geht – außer, es ist hier angehakt („Trotzdem …“, „Feld behalten“).
  const [typErsetzen, setTypErsetzen] = useState<string[]>([]);
  const [behalten, setBehalten] = useState<string[]>([]);
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [ok, setOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const rechteFehlen = !!v.laeufer?.bestaetigen && !rechteOk;
  // Erstmals ein Herausgeber an einem Bestandspaket (#1084): eigener Haken, sonst kein Update.
  const [herausgeberOk, setHerausgeberOk] = useState(false);
  const herausgeberFehlt = !!v.herausgeberBestaetigen && !herausgeberOk;
  // Umbau (#1041): Rückfragen, „Vorher sichern“ und Bestätigung – nur „Gesamte Verwaltung“.
  const { ich } = useKonto();
  const umbau = v.umbau ?? [];
  const [umbauStand, setUmbauStand] = useState<UmbauStand>(() => umbauStart(umbau));
  const [sicherungFehler, setSicherungFehler] = useState<string | null>(null);
  const umbauFehlt = umbau.length > 0 && (!umbauStand.bestaetigt || !hatGesamt(ich));
  /** „Vorher sichern“ (#702): eine Sicherung starten und abwarten; scheitert sie, kein Umbau. */
  const sichereVorher = async (): Promise<boolean> => {
    setSicherungFehler(null);
    const f = await sicherungVorher();
    setSicherungFehler(f);
    return !f;
  };
  // Namenskonflikte (#1123) stehen auch in den Problemen; sie verhindern nichts, wenn oben umbenannt ist.
  const probleme = v.probleme.filter((p) => !v.namenskonflikte?.includes(p) && !ohne.includes(p));
  const pruefWarnung = pruefWarnungVon(v, warnung);
  const bestaetigen = pruefWarnung !== null && !herkunftBestaetigt;
  const gesperrt = probleme.length > 0 || n.konflikt || n.leer || (bestaetigen && !ok) || rechteFehlen || herausgeberFehlt || umbauFehlt;
  const antwort = antwortVon({
    ...n,
    neueAutos,
    ohneAuto,
    beispiele,
    mit,
    rechteOk,
    herausgeberOk,
    ok: bestaetigen && ok,
    umbau,
    umbauStand,
    ersetzen,
    typErsetzen,
    behalten,
  });
  // Ohne eigene Knöpfe (#1168): bei jeder Änderung melden – verglichen als Text, damit gleiche Antworten nicht erneut kommen.
  const gemeldet = JSON.stringify(gesperrt ? null : antwort);
  useEffect(() => {
    melde?.(JSON.parse(gemeldet) as VorschauAntwort | null);
  }, [gemeldet, melde]);
  return {
    ...n,
    neueAutos,
    ohneAuto,
    setOhneAuto,
    ersetzen,
    setErsetzen,
    typErsetzen,
    setTypErsetzen,
    behalten,
    setBehalten,
    beispiele,
    setBeispiele,
    mit,
    setMit,
    ok,
    setOk,
    rechteOk,
    setRechteOk,
    laeuft,
    setLaeuft,
    herausgeberOk,
    setHerausgeberOk,
    ich,
    umbau,
    umbauStand,
    setUmbauStand,
    sicherungFehler,
    sichereVorher,
    probleme,
    pruefWarnung,
    bestaetigen,
    gesperrt,
    antwort,
  };
}
export type VorschauZustand = ReturnType<typeof useVorschau>;
