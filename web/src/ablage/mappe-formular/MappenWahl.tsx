import { useMemo, useRef, useState, type ReactNode } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import { darfErstellen, type Feld as FeldDef, type Mappe, type Mappentyp, type Werte } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { Bezuege } from '../../api/mappen';
import { Etikett } from '../../bausteine';
import { Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { standardRoh, type Roh, type RohWerte } from '../../werte';
import { EBENEN_MAX, useEbene, type EbeneLage } from '../ebenen';
import { Mehrfachauswahl } from '../Mehrfachauswahl';
import { TypMarke, TypSymbol } from '../TypMarke';
import { VerweisFenster } from '../VerweisFenster';
import { titelFeld, unpassendText } from './hilfen';
import { useAngelegt, useFehlendeTitel, useLivePruefung, useTreffer, useZuletzt, type TrefferQuelle } from './mappen-wahl-hooks';
import { belegeVor } from './werte';

/**
 * Formular einer neuen Mappe im Fenster „+ … anlegen“ (#935) bzw. „+ Neu“ unter einer Tabelle (#1030). Kommt von außen
 * (Formular.tsx), weil das Formular selbst wieder Verweisfelder mit dieser Auswahl enthält.
 */
export type NeuesFormular = (ziel: Mappentyp, start: RohWerte, fertig: { gespeichert(m: Mappe): void; abbrechen(): void }) => ReactNode;

export interface MappenWahlProps {
  id: string;
  ziel: Mappentyp;
  mehrfach: boolean;
  wert: string | string[] | undefined;
  eigeneId?: string;
  /**
   * Mehrere Zieltypen (#1036): alle, auf die das Feld zeigen darf (`ziel` ist der erste). Die Vorschläge kommen dann über
   * `sicht` („feld:<typ>:<feld>“) aus allen, stehen je Typ unter einer Überschrift – zuletzt geöffnete zuerst – und die
   * gewählten Mappen zeigen ihren Typ.
   */
  ziele?: Mappentyp[];
  /** „Alle vom selben Typ“ (#1036): nach der ersten Mappe nur noch Mappen ihres Typs anbieten (der Server prüft es auch). */
  gleicherTyp?: boolean;
  bekannt: Bezuege;
  merke: (id: string, b: { titel: string; typId: string }) => void;
  setze: (v: Roh) => void;
  /** Auswahlfilter (#172): Sicht „feld:<typ>:<feld>“; Vorbelegung für „+ anlegen“ (Auswahlfilter, erkannte Angaben #935). */
  sicht?: string;
  vorbelegen?: Record<string, unknown>;
  /** Davon im Dokument erkannt (#935): Auf „Neue Post“ stehen diese Werte in der neuen Ebene als „Vorschlag“ (#1596). */
  erkannt?: Record<string, unknown>;
  unpassend?: string[];
  eigene?: Werte;
  /** Gewählte Mappen schon vor dem Speichern prüfen (#173, #886): Typ und Feld; mit den Gründen (#887). */
  pruefen?: { typId: string; feldKey: string };
  gruende?: Record<string, string[]>;
  typFelder?: FeldDef[];
  /** Ohne „+ … anlegen“, z. B. im Testlauf der Werkbank (#371). */
  ohneAnlegen?: boolean;
  /** Eigener Platzhalter statt „<Typ> suchen …“, z. B. „Mappe suchen …“ für die Testmappe (#710). */
  platzhalter?: string;
  /** Name des Suchfelds für Bildschirmleser, wo keine Beschriftung darüber steht (#1217: „Mappe suchen“ auf „Dokument übernehmen“). */
  eingabeLabel?: string;
  /** Eigene Vorschläge statt der Seite des Zieltyps, z. B. nur Mappen, die eine Automatisierung sehen darf (#709). */
  quelle?: TrefferQuelle['quelle'];
  /** Text, wenn es gar keine Vorschläge gibt. */
  leer?: string;
  /** Fenster „+ … anlegen“ (#935): das Formular der neuen Mappe. */
  neuesFormular: NeuesFormular;
  /** Name des Felds (#1288): Der Knopf ✕ heißt für Bildschirmleser „<Feld> entfernen“. */
  feldName?: string;
}

/* ---------- Auswahl verwiesener Mappen (mit Suche statt langer Klappliste) ---------- */

export function MappenWahlKern(p: MappenWahlProps) {
  const { ziel, mehrfach, eigeneId, bekannt, merke, setze, sicht, typFelder = [] } = p;
  const { eigeneText, gewaehlt, alle, mehrere, alleIds } = grundlage(p);
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  // Kein „Ändern“ (#1288): Ein gesetzter Verweis wird mit ✕ entfernt und neu gewählt.
  const zeigeSuche = mehrfach || !gewaehlt.length;
  const zuletzt = useZuletzt(mehrere, offen);
  useFehlendeTitel(gewaehlt, bekannt, merke);
  const { treffer, gesamt } = useTreffer({ offen, eingabe, ziel, sicht, eigeneText, quelle: p.quelle, mehrere, alleIds });
  // Passen die gewählten Mappen noch zu den Werten dieser Mappe (#173, #886)? Hinweis mit Grund (#887) schon vor dem Speichern.
  const { unpassend, gruende } = useLivePruefung(p, gewaehlt.join(','), eigeneText);

  // Anlegen (#935, #1288): als letzter Eintrag der Vorschläge, im verschiebbaren Fenster; danach steht die Mappe im Feld.
  const [fenster, setFenster] = useState<{ typ: Mappentyp; text: string } | null>(null);
  const [angelegt, setAngelegt] = useAngelegt();
  const zurueck = useZurueck();

  function waehle(m: Mappe) {
    merke(m.id, { titel: m.titel ?? '', typId: m.typId });
    setze(mehrfach ? [...gewaehlt, m.id] : m.id);
    setEingabe('');
    setOffen(false);
  }
  const { moeglich, auswahl } = auswahlLage({
    gleicherTyp: !!p.gleicherTyp,
    mehrfach,
    gewaehlt,
    bekannt,
    alle,
    treffer,
    eigeneId,
    zuletzt,
  });
  const anlegbar = p.ohneAnlegen ? [] : moeglich.filter((x) => darfErstellen(x));
  const neuTyp = fenster?.typ ?? ziel;
  const start = useMemo(
    () => startFuer(neuTyp, fenster?.text ?? '', p.vorbelegen),
    [neuTyp, fenster], // eslint-disable-line react-hooks/exhaustive-deps -- Startwerte neu je Fenster; vorbelegen gilt beim Öffnen
  );
  const namen = mehrere ? alle.map((x) => typName(x)).join(', ') : typName(ziel);
  const text = eingabe.trim();
  // Neue Post (#1596): Anlegen öffnet eine weitere Ebene in der rechten Spalte statt des Fensters; auf der dritten gesperrt.
  const ebene = useEbene();
  const gesperrt = gesperrtIn(ebene);
  const inEbene = (x: Mappentyp) =>
    ebene &&
    oeffneEbene(ebene, x, text, p, {
      gespeichert: (m) => {
        waehle(m);
        setAngelegt(titelOder(m.titel));
      },
      zurueck: () => window.setTimeout(() => zurueck.ziel.current?.focus(), 0),
    });

  return (
    <Mehrfachauswahl
      id={p.id}
      name={t('felder.verweis.gewaehlt')}
      eingabeLabel={p.eingabeLabel}
      platzhalter={p.platzhalter ?? t('felder.verweis.suchen', { typ: namen })}
      eingabe={eingabe}
      setEingabe={setEingabe}
      offen={offen}
      setOffen={setOffen}
      ohneSuche={!zeigeSuche}
      vorschlaege={treffer === null ? null : vorschlaegeVon(auswahl, mehrere ? alle : null, ziel)}
      leerText={leerVon(text, mehrere ? null : ziel, p.leer ?? leerStandard(!!ebene, namen))}
      fuss={fussVon(gesamt, treffer)}
      anlegen={anlegenListe(anlegbar, text, gesperrt)}
      legeAn={(tid) => {
        const x = anlegbar.find((y) => y.id === tid);
        if (!x || gesperrt) return;
        if (!ebene) setFenster({ typ: x, text });
        else {
          setOffen(false);
          inEbene(x);
        }
      }}
      waehle={(mid) => {
        const m = auswahl.find((x) => x.id === mid);
        if (m) waehle(m);
      }}
      gewaehlt={eintraege({ gewaehlt, bekannt, mehrere, mehrfach, unpassend, gruende, typFelder, feldName: p.feldName })}
      entferne={(x) => setze(mehrfach ? gewaehlt.filter((y) => y !== x) : '')}
      darunter={
        <AngelegtDarunter fenster={fenster?.typ ?? null} schliessen={() => setFenster(null)} zurueck={zurueck} angelegt={angelegt}>
          {fenster &&
            p.neuesFormular(fenster.typ, start, {
              gespeichert: (m) => {
                waehle(m);
                setAngelegt(titelOder(m.titel));
                setFenster(null);
              },
              abbrechen: () => setFenster(null),
            })}
        </AngelegtDarunter>
      }
    />
  );
}

/** Startwerte einer neuen Mappe: Vorgaben des Typs, Vorbelegung und das Getippte als Bezeichnung bzw. Titel (#1288). */
function startFuer(typ: Mappentyp, text: string, vorbelegen: Record<string, unknown> | undefined) {
  const r = standardRoh(typ);
  const feld = text ? titelFeld(typ) : undefined;
  belegeVor(typ, r, { ...(vorbelegen ?? {}), ...(feld ? { [feld]: text } : {}) });
  return r;
}

/**
 * Neue Post (#1596): die neue Mappe als nächste Ebene der rechten Spalte. Was Ablago im Dokument erkannt hat, geht
 * getrennt mit – die Ebene trägt es als „Vorschlag“ ein; das Getippte hat Vorrang.
 */
function oeffneEbene(
  ebene: EbeneLage,
  typ: Mappentyp,
  text: string,
  p: MappenWahlProps,
  danach: { gespeichert(m: Mappe): void; zurueck(): void },
) {
  const erkannt = Object.keys(p.erkannt ?? {});
  const start = startFuer(typ, text, Object.fromEntries(Object.entries(p.vorbelegen ?? {}).filter(([k]) => !erkannt.includes(k))));
  const roh: RohWerte = {};
  belegeVor(typ, roh, p.erkannt ?? {});
  const feld = text ? titelFeld(typ) : undefined;
  if (feld) delete roh[feld];
  ebene.oeffne({ typ, start, erkannt: roh, feld: p.feldName ?? typName(typ), ...danach });
}

/** Auf der dritten Ebene (#1596) lässt sich nichts mehr anlegen. */
const gesperrtIn = (e: EbeneLage | null) => !!e && e.nr >= EBENEN_MAX;

/** Einträge zum Anlegen; auf der dritten Ebene (#1596) stattdessen der Grund, warum es nicht geht. */
const anlegenListe = (typen: Mappentyp[], text: string, gesperrt: boolean) =>
  typen.map((x) => ({ id: x.id, text: gesperrt ? <EbeneGesperrt typ={x} /> : anlegenText(x, text) }));

/** Ohne Eingabe und ohne Vorschläge: auf „Neue Post“ (#1596) „Keine passende Mappe gefunden.“, sonst „Noch keine Mappe in …“. */
const leerStandard = (ebene: boolean, namen: string) =>
  ebene ? t('ablage.ebenen.keine-passende') : t('felder.verweis.leer', { typ: namen });

/** Auf der dritten Ebene (#1596): statt „+ Person anlegen …“ der Grund, warum es hier nicht mehr geht. */
function EbeneGesperrt({ typ }: { typ: Mappentyp }) {
  return (
    <span className="leise">
      {tn('ablage.ebenen.gesperrt', { gesperrt: <strong>{t('ablage.ebenen.gesperrt-wort')}</strong>, typ: typName(typ) })}
    </span>
  );
}

/** „+ Vertrag anlegen …“ – mit dem Getippten, wenn es die neue Mappe vorbelegt: „+ Vertrag „xyz“ anlegen …“ (#1288). */
const anlegenText = (typ: Mappentyp, text: string) =>
  text && titelFeld(typ) ? t('felder.verweis.neu-mit', { typ: typName(typ), text }) : t('felder.verweis.neu', { typ: typName(typ) });

/** Ohne Vorschläge: „Vertrag „xyz“ nicht gefunden“ – bei mehreren Zieltypen ohne Typ (#1288); ohne Eingabe `leer`. */
const leerVon = (text: string, typ: Mappentyp | null, leer: string) =>
  !text ? leer : typ ? t('felder.verweis.typ-nicht-gefunden', { typ: typName(typ), text }) : t('felder.verweis.nicht-gefunden', { text });

/**
 * Wohin der Fokus nach dem Fenster geht (#1288): ins Suchfeld des Verweisfelds – oder, wenn danach eine Mappe gewählt
 * ist und es kein Suchfeld mehr gibt, auf ihren Link. Erst beim Schließen gesucht (eine Markierung im Feld findet es).
 */
function useZurueck() {
  const marke = useRef<HTMLSpanElement>(null);
  const ziel = useMemo(
    () => ({
      get current(): HTMLElement | null {
        const box = marke.current?.closest('.refbox');
        return (
          box?.querySelector<HTMLElement>('input[role="combobox"]') ??
          box?.querySelector<HTMLElement>('.gewaehlt a, .gewaehlt button') ??
          null
        );
      },
    }),
    [],
  );
  return { marke, ziel };
}

/** Gewählte Mappen, alle Zieltypen (#1036) und die Werte dieser Mappe als Text (für den Auswahlfilter, #173). */
function grundlage({ wert, ziel, ziele, eigene }: MappenWahlProps) {
  const eigeneText = eigene ? JSON.stringify(eigene) : '';
  const gewaehlt = (Array.isArray(wert) ? wert : wert ? [wert] : []).filter(Boolean);
  const alle = ziele?.length ? ziele : [ziel];
  return { eigeneText, gewaehlt, alle, mehrere: alle.length > 1, alleIds: alle.map((x) => x.id).join(',') };
}

/** „… weitere – such genauer“, wenn es mehr Treffer gibt, als die Liste zeigt. */
const fussVon = (gesamt: number, treffer: Mappe[] | null) =>
  gesamt > (treffer?.length ?? 0) && (
    <p className="leise klein">{t('felder.verweis.mehr', { zahl: gesamt.toLocaleString(gebietsschema()) })}</p>
  );

/**
 * Was die Auswahl anbietet. „Alle vom selben Typ“ (#1036): nach der ersten Mappe nur ihr Typ – solange die Oberfläche
 * ihn kennt (sichtbare Mappe). Mehrere Zieltypen (#1036): je Typ in der Reihenfolge des Felds, darin zuletzt geöffnete
 * zuerst; Gruppen ohne Anzahl.
 */
function auswahlLage({
  gleicherTyp,
  mehrfach,
  gewaehlt,
  bekannt,
  alle,
  treffer,
  eigeneId,
  zuletzt,
}: {
  gleicherTyp: boolean;
  mehrfach: boolean;
  gewaehlt: string[];
  bekannt: Bezuege;
  alle: Mappentyp[];
  treffer: Mappe[] | null;
  eigeneId?: string;
  zuletzt: Map<string, number> | null;
}) {
  const mehrere = alle.length > 1;
  const festerTyp = gleicherTyp && mehrfach && mehrere && gewaehlt.length ? bekannt[gewaehlt[0]]?.typId || undefined : undefined;
  const moeglich = festerTyp ? alle.filter((x) => x.id === festerTyp) : alle;
  const roh = (treffer ?? []).filter(
    (m) => m.id !== eigeneId && !gewaehlt.includes(m.id) && (!mehrere || moeglich.some((x) => x.id === m.typId)),
  );
  const rang = (mid: string) => zuletzt?.get(mid) ?? Number.MAX_SAFE_INTEGER;
  const auswahl = mehrere ? moeglich.flatMap((typ) => roh.filter((m) => m.typId === typ.id).sort((a, b) => rang(a.id) - rang(b.id))) : roh;
  return { moeglich, auswahl };
}

/** Vorschläge in der Klappliste; bei mehreren Zieltypen (`alle`) je Typ eine Gruppe. */
const vorschlaegeVon = (auswahl: Mappe[], alle: Mappentyp[] | null, ziel: Mappentyp) =>
  auswahl.map((m) => ({
    id: m.id,
    text: titelOder(m.titel),
    ...(alle ? { gruppe: typName(alle.find((x) => x.id === m.typId) ?? ziel) } : {}),
  }));

/** Unter der Auswahl: die Meldung „… angelegt“ und das Fenster mit dem Formular der neuen Mappe (`children`). */
function AngelegtDarunter({
  fenster,
  schliessen,
  zurueck,
  angelegt,
  children,
}: {
  fenster: Mappentyp | null;
  schliessen(): void;
  zurueck: ReturnType<typeof useZurueck>;
  angelegt?: string;
  children: ReactNode;
}) {
  return (
    <>
      <span ref={zurueck.marke} hidden />
      {angelegt && (
        <p className="hinweis gut klein vf-angelegt" role="status">
          {t('ablage.fenster.angelegt', { titel: angelegt })}
        </p>
      )}
      {fenster && (
        <VerweisFenster ziel={fenster} zurueck={zurueck.ziel} schliessen={schliessen}>
          {children}
        </VerweisFenster>
      )}
    </>
  );
}

/**
 * Eine gewählte Mappe (Muster A1): Link mit dem Symbol des Mappentyps und dem Titel (bei mehreren Zieltypen dahinter der
 * Typ), nicht sichtbare Mappen nur mit ihrem Titel.
 */
function GewaehlteMappe({ id: x, bekannt, mehrere }: { id: string; bekannt: Bezuege; mehrere: boolean }) {
  return bekannt[x]?.typId && !bekannt[x].verborgen ? (
    <>
      <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">
        {!mehrere && <TypSymbol typId={bekannt[x].typId} />}
        <Ehemalig id={x}>{titelOder(bekannt[x].titel)}</Ehemalig>
      </Link>
      {mehrere && <TypMarke typId={bekannt[x].typId} />}
    </>
  ) : (
    <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : 'leise'}>{bekannt[x]?.titel ?? t('felder.auswahl.lade')}</span>
  );
}

/** Die gewählten Mappen in der Auswahl: Titel, Hinweis „passt nicht zu …“ (#887) und der Name des Knopfs ✕ (#1288). */
function eintraege({
  gewaehlt,
  bekannt,
  mehrere,
  mehrfach,
  unpassend,
  gruende,
  typFelder,
  feldName,
}: {
  gewaehlt: string[];
  bekannt: Bezuege;
  mehrere: boolean;
  mehrfach: boolean;
  unpassend: string[];
  gruende: Record<string, string[]>;
  typFelder: FeldDef[];
  feldName?: string;
}) {
  return gewaehlt.map((x) => ({
    id: x,
    // Mehrere Zieltypen (#1036): mit Typ-Symbol und -Name; nicht sichtbare Mappen nur als „(nicht sichtbar)“, ohne Typ.
    inhalt: <GewaehlteMappe id={x} bekannt={bekannt} mehrere={mehrere} />,
    zusatz: unpassend.includes(x) && (
      <Etikett art="warn" title={t('felder.verweis.unpassend.titel')}>
        {unpassendText(typFelder, gruende[x] ?? [])}
      </Etikett>
    ),
    // „Halter entfernen“ bei einem einzelnen Verweis; bei mehreren mit dem Titel, damit jedes ✕ einen eigenen Namen hat.
    entfernenText:
      feldName && !mehrfach
        ? t('felder.verweis.entfernen.feld', { feld: feldName })
        : bekannt[x]
          ? t('felder.verweis.entfernen', { titel: titelOder(bekannt[x].titel) })
          : t('felder.verweis.entfernen.ohne'),
  }));
}
