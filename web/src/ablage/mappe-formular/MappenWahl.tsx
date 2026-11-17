import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import { darfErstellen, type Feld as FeldDef, type Mappe, type Mappentyp, type Werte } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { Bezuege } from '../../api/mappen';
import { Knopf } from '../../bausteine';
import { Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { standardRoh, type Roh, type RohWerte } from '../../werte';
import { Mehrfachauswahl } from '../Mehrfachauswahl';
import { TypMarke } from '../TypMarke';
import { VerweisFenster } from '../VerweisFenster';
import { unpassendText } from './hilfen';
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
}

/* ---------- Auswahl verwiesener Mappen (mit Suche statt langer Klappliste) ---------- */

export function MappenWahlKern(p: MappenWahlProps) {
  const { ziel, mehrfach, eigeneId, bekannt, merke, setze, sicht, typFelder = [] } = p;
  const { eigeneText, gewaehlt, alle, mehrere, alleIds } = grundlage(p);
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [aendern, setAendern] = useState(false);
  const zeigeSuche = mehrfach || !gewaehlt.length || aendern;
  const zuletzt = useZuletzt(mehrere, offen);
  useFehlendeTitel(gewaehlt, bekannt, merke);
  const { treffer, gesamt } = useTreffer({ offen, eingabe, ziel, sicht, eigeneText, quelle: p.quelle, mehrere, alleIds });
  // Passen die gewählten Mappen noch zu den Werten dieser Mappe (#173, #886)? Hinweis mit Grund (#887) schon vor dem Speichern.
  const { unpassend, gruende } = useLivePruefung(p, gewaehlt.join(','), eigeneText);

  // „+ … anlegen“ (#935): im verschiebbaren Fenster statt auf einer neuen Seite; danach steht die Mappe im Feld.
  const [fenster, setFenster] = useState<Mappentyp | null>(null);
  const [angelegt, setAngelegt] = useAngelegt();
  const anlegenRef = useRef<HTMLButtonElement>(null);

  const aendere = () => {
    setAendern(true);
    setOffen(true);
  };
  function waehle(m: Mappe) {
    merke(m.id, { titel: m.titel ?? '', typId: m.typId });
    setze(mehrfach ? [...gewaehlt, m.id] : m.id);
    setEingabe('');
    setOffen(false);
    setAendern(false);
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
  const neuTyp = fenster ?? ziel;
  const start = useMemo(() => {
    const r = standardRoh(neuTyp);
    belegeVor(neuTyp, r, p.vorbelegen ?? {});
    return r;
  }, [neuTyp, fenster]); // eslint-disable-line react-hooks/exhaustive-deps -- Startwerte neu je Fenster; vorbelegen gilt beim Öffnen
  const namen = mehrere ? alle.map((x) => typName(x)).join(', ') : typName(ziel);

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
      schliessen={() => setAendern(false)}
      ohneSuche={!zeigeSuche}
      vorschlaege={treffer === null ? null : vorschlaegeVon(auswahl, mehrere ? alle : null, ziel)}
      leerText={eingabe ? t('felder.verweis.nichts') : (p.leer ?? t('felder.verweis.leer', { typ: namen }))}
      fuss={fussVon(gesamt, treffer)}
      waehle={(mid) => {
        const m = auswahl.find((x) => x.id === mid);
        if (m) waehle(m);
      }}
      gewaehlt={eintraege({ gewaehlt, bekannt, mehrere, mehrfach, aendern, unpassend, gruende, typFelder, aendere })}
      entferne={(x) => setze(mehrfach ? gewaehlt.filter((y) => y !== x) : '')}
      darunter={
        <AnlegenDarunter
          typen={p.ohneAnlegen ? [] : moeglich}
          fenster={fenster}
          setFenster={setFenster}
          anlegenRef={anlegenRef}
          angelegt={angelegt}>
          {fenster &&
            p.neuesFormular(fenster, start, {
              gespeichert: (m) => {
                waehle(m);
                setAngelegt(titelOder(m.titel));
                setFenster(null);
              },
              abbrechen: () => setFenster(null),
            })}
        </AnlegenDarunter>
      }
    />
  );
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

/**
 * Unter der Auswahl: „+ … anlegen“ (Leitsatz 2: Knopf der Art Anlegen, klein) – nur, wenn die Person im Zieltyp anlegen
 * darf, bei mehreren je Typ ein Knopf –, die Meldung „… angelegt“ und das Fenster mit dem Formular (`children`).
 */
function AnlegenDarunter({
  typen,
  fenster,
  setFenster,
  anlegenRef,
  angelegt,
  children,
}: {
  typen: Mappentyp[];
  fenster: Mappentyp | null;
  setFenster(x: Mappentyp | null): void;
  anlegenRef: RefObject<HTMLButtonElement | null>;
  angelegt?: string;
  children: ReactNode;
}) {
  const anlegbar = typen.filter((x) => darfErstellen(x));
  return (
    <>
      {anlegbar.length > 0 && (
        <div className="zeile">
          {anlegbar.map((x, i) => (
            <Knopf
              key={x.id}
              ref={i === 0 ? anlegenRef : undefined}
              art="anlegen"
              groesse="klein"
              aria-haspopup="dialog"
              aria-expanded={fenster?.id === x.id}
              onClick={() => setFenster(x)}>
              {t('ablage.mappeformular.anlegen-2', { name: typName(x) })}
            </Knopf>
          ))}
        </div>
      )}
      {angelegt && (
        <p className="hinweis gut klein vf-angelegt" role="status">
          {t('ablage.fenster.angelegt', { titel: angelegt })}
        </p>
      )}
      {fenster && (
        <VerweisFenster ziel={fenster} zurueck={anlegenRef} schliessen={() => setFenster(null)}>
          {children}
        </VerweisFenster>
      )}
    </>
  );
}

/** Eine gewählte Mappe: Link mit Titel (bei mehreren Zieltypen mit Typ), nicht sichtbare Mappen nur mit ihrem Titel. */
function GewaehlteMappe({ id: x, bekannt, mehrere }: { id: string; bekannt: Bezuege; mehrere: boolean }) {
  return bekannt[x]?.typId && !bekannt[x].verborgen ? (
    <>
      <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">
        <Ehemalig id={x}>{titelOder(bekannt[x].titel)}</Ehemalig>
      </Link>
      {mehrere && <TypMarke typId={bekannt[x].typId} />}
    </>
  ) : (
    <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : 'leise'}>{bekannt[x]?.titel ?? t('felder.auswahl.lade')}</span>
  );
}

/** Die gewählten Mappen in der Auswahl: Titel, Hinweis „passt nicht zu …“ (#887), „Ändern“ (einzeln), Entfernen. */
function eintraege({
  gewaehlt,
  bekannt,
  mehrere,
  mehrfach,
  aendern,
  unpassend,
  gruende,
  typFelder,
  aendere,
}: {
  gewaehlt: string[];
  bekannt: Bezuege;
  mehrere: boolean;
  mehrfach: boolean;
  aendern: boolean;
  unpassend: string[];
  gruende: Record<string, string[]>;
  typFelder: FeldDef[];
  aendere(): void;
}) {
  return gewaehlt.map((x) => ({
    id: x,
    // Mehrere Zieltypen (#1036): mit Typ-Symbol und -Name; nicht sichtbare Mappen nur als „(nicht sichtbar)“, ohne Typ.
    inhalt: <GewaehlteMappe id={x} bekannt={bekannt} mehrere={mehrere} />,
    zusatz: unpassend.includes(x) && (
      <span className="chip warn" title={t('felder.verweis.unpassend.titel')}>
        {unpassendText(typFelder, gruende[x] ?? [])}
      </span>
    ),
    aktionen: !mehrfach && !aendern && (
      <Knopf groesse="klein" onClick={aendere}>
        {t('felder.verweis.aendern')}
      </Knopf>
    ),
    entfernenText: bekannt[x] ? t('felder.verweis.entfernen', { titel: titelOder(bekannt[x].titel) }) : t('felder.verweis.entfernen.ohne'),
  }));
}
