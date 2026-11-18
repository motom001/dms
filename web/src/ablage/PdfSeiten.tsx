import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Dokument, Mappe } from '../../../shared/src/model';
import { dokumenteApi, seitenbildUrl, type PdfSeiten as Info } from '../api/dokumente';
import { Hilfe } from '../Hilfe';
import { Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';

/**
 * PDF bearbeiten (#335): Seiten mit kleinen Bildern; drehen, löschen, verschieben (Ziehen oder
 * Tastatur: Alt + Pfeiltaste), „Teilen ab hier“. Gespeichert wird erst mit „Übernehmen“ – als neue
 * Version, ohne Versionierung nach Rückfrage; bei Post entstehen beim Teilen neue Posts. In Post zusätzlich
 * „Anlage ab hier“ (#1162): Die Seiten ab dort werden eine Anlage des Dokuments (Schnittstelle `anlagen`, #998).
 */
interface Seite {
  nr: number;
  drehung: number;
  weg: boolean;
  teilAb: boolean;
  anlageAb: boolean;
}

/** Positionen (in den bleibenden Seiten) mit der Markierung; die erste Seite beginnt nie etwas Neues. */
const positionen = (bleiben: Seite[], art: 'teilAb' | 'anlageAb') => bleiben.map((s, i) => (i > 0 && s[art] ? i : -1)).filter((i) => i > 0);

/** Nummer der Anlage an Position `pos`: gezählt ab dem Beginn ihres Teils (Anlage 1, 2 … je Teil). */
function anlageNr(pos: number, teile: number[], anlagen: number[]): number {
  const start = Math.max(0, ...teile.filter((x) => x < pos));
  return anlagen.filter((x) => x > start && x <= pos).length;
}

/** Zeile unter den Seiten: wie viele bleiben, gedreht, Teile bzw. neue Posts, Anlagen. */
function zusammenfassungVon(anzahl: number, seiten: Seite[], post: boolean, anzahlTeile: number, anlagen: number): string {
  const bleiben = seiten.filter((s) => !s.weg);
  const gedreht = bleiben.filter((s) => s.drehung).length;
  return [
    t('ablage.pdfseiten.von-seiten', { anzahl, bleiben: bleiben.length }),
    ...(gedreht ? [`${gedreht} gedreht`] : []),
    ...(anzahlTeile > 1 ? [post ? t('ablage.pdfseiten.neue-posts', { anzahlTeile }) : t('ablage.pdfseiten.teile', { anzahlTeile })] : []),
    ...(anlagen ? [t('ablage.pdfseiten.anlagen-zahl', { anzahl: anlagen })] : []),
  ].join(' · ');
}

/** Name einer Kachel für Screenreader: Seite, gelöscht, gedreht, neuer Teil bzw. Anlage beginnt hier. */
function kachelText(s: Seite, neuerTeil: boolean, anlage: number): string {
  const beginn = neuerTeil
    ? t('ablage.pdfseiten.neuer-teil-beginnt-hier')
    : anlage
      ? t('ablage.pdfseiten.anlage-beginnt-hier', { nr: anlage })
      : '';
  return t('ablage.pdfseiten.seite', {
    nr: s.nr,
    wert: s.weg ? t('ablage.pdfseiten.geloescht') : '',
    wert2: s.drehung ? t('ablage.pdfseiten.gedreht-um-grad', { drehung: s.drehung }) : '',
    wert3: beginn,
  });
}

/** Rückfrage vor dem Teilen einer Post (neue Post je Teil; mit Anlagen auch bei nur einem Teil). */
function postRueckfrage(name: string, anzahlTeile: number, anlagen: number) {
  if (anzahlTeile > 1)
    return rueckfrage({
      titel: t('ablage.pdfseiten.in-posts-teilen', { anzahlTeile }),
      text: t('ablage.pdfseiten.aus-dieser-post-entstehen', { anzahlTeile }),
      ja: t('ablage.pdfseiten.teilen'),
    });
  return rueckfrage({
    titel: t('ablage.pdfseiten.anlagen-anlegen', { anzahl: anlagen }),
    text: t('ablage.pdfseiten.neue-post-mit-anlagen', { name, anzahl: anlagen }),
    ja: t('ablage.pdfseiten.anlagen-anlegen-ja'),
  });
}

/** Eine Kachel (#335): Bild, drehen, verschieben, löschen, „Teilen ab hier“ und „Anlage ab hier“ (#1162). */
function Kachel({
  s,
  i,
  pos,
  teile,
  anlagen,
  info,
  letzte,
  anlagenMoeglich,
  gezogen,
  setGezogen,
  element,
  fallen,
  taste,
  aendere,
  verschiebe,
}: {
  s: Seite;
  i: number;
  pos: number;
  teile: number[];
  anlagen: number[];
  info: Info;
  letzte: boolean;
  anlagenMoeglich: boolean;
  gezogen: number | undefined;
  setGezogen(i: number | undefined): void;
  element(el: HTMLLIElement | null): void;
  fallen(e: DragEvent): void;
  taste(e: KeyboardEvent): void;
  aendere(p: Partial<Seite>): void;
  verschiebe(nach: number): void;
}) {
  const neuerTeil = !s.weg && pos > 0 && s.teilAb;
  const anlage = anlagen.includes(pos) ? anlageNr(pos, teile, anlagen) : 0;
  return (
    <li
      ref={element}
      tabIndex={0}
      className={`seite ${s.weg ? 'weg' : ''} ${neuerTeil ? 'teilab' : ''} ${anlage ? 'anlageab' : ''} ${gezogen === i ? 'zieht' : ''}`}
      aria-label={kachelText(s, neuerTeil, anlage)}
      draggable
      onDragStart={() => setGezogen(i)}
      onDragEnd={() => setGezogen(undefined)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={fallen}
      onKeyDown={taste}>
      {neuerTeil && <span className="teilmarke">{t('ablage.pdfseiten.teil', { wert: teile.indexOf(pos) + 2 })}</span>}
      {anlage > 0 && <span className="teilmarke anlagemarke">{t('ablage.pdfseiten.anlage-marke', { nr: anlage })}</span>}
      <div className="seitenbild">
        {s.nr <= info.bilderBis ? (
          <img src={seitenbildUrl(info, s.nr)} alt="" loading="lazy" style={{ transform: `rotate(${s.drehung}deg)` }} draggable={false} />
        ) : (
          <span className="leise">{s.nr}</span>
        )}
      </div>
      <span className="klein">{t('ablage.pdfseiten.seite-2', { nr: s.nr })}</span>
      <div className="seitenknoepfe">
        <Knopf
          groesse="klein"
          title={t('ablage.pdfseiten.nach-links-drehen')}
          nurSymbol={t('ablage.pdfseiten.seite-nach-links-drehen', { nr: s.nr })}
          gesperrt={s.weg}
          onClick={() => aendere({ drehung: (s.drehung + 270) % 360 })}>
          <Symbol name="zuruecksetzen" />
        </Knopf>
        <Knopf
          groesse="klein"
          title={t('ablage.pdfseiten.nach-rechts-drehen')}
          nurSymbol={t('ablage.pdfseiten.seite-nach-rechts-drehen', { nr: s.nr })}
          gesperrt={s.weg}
          onClick={() => aendere({ drehung: (s.drehung + 90) % 360 })}>
          <Symbol name="neu-laden" />
        </Knopf>
        <Knopf
          groesse="klein"
          title={t('ablage.pdfseiten.nach-vorn')}
          nurSymbol={t('ablage.pdfseiten.seite-nach-vorn', { nr: s.nr })}
          gesperrt={i === 0}
          onClick={() => verschiebe(i - 1)}>
          <Symbol name="pfeil-links" />
        </Knopf>
        <Knopf
          groesse="klein"
          title={t('ablage.pdfseiten.nach-hinten')}
          nurSymbol={t('ablage.pdfseiten.seite-nach-hinten', { nr: s.nr })}
          gesperrt={letzte}
          onClick={() => verschiebe(i + 1)}>
          <Symbol name="pfeil-rechts" />
        </Knopf>
      </div>
      <div className="seitenknoepfe">
        {/* Erst mit „Übernehmen“ wirksam, bis dahin „Behalten“ (Leitsatz 5): kein roter Link. */}
        <Knopf groesse="klein" onClick={() => aendere({ weg: !s.weg })}>
          {s.weg ? t('ablage.pdfseiten.behalten') : t('ablage.pdfseiten.loeschen')}
        </Knopf>
        {pos > 0 && (
          <Knopf groesse="klein" aria-pressed={s.teilAb} onClick={() => aendere({ teilAb: !s.teilAb, anlageAb: false })}>
            {s.teilAb ? t('ablage.pdfseiten.nicht-teilen') : t('ablage.pdfseiten.teilen-ab-hier')}
          </Knopf>
        )}
        {pos > 0 && anlagenMoeglich && (
          <Knopf groesse="klein" aria-pressed={s.anlageAb} onClick={() => aendere({ anlageAb: !s.anlageAb, teilAb: false })}>
            {s.anlageAb ? t('ablage.pdfseiten.keine-anlage') : t('ablage.pdfseiten.anlage-ab-hier')}
          </Knopf>
        )}
      </div>
    </li>
  );
}

export function PdfSeiten({
  d,
  post,
  versioniert,
  papierkorb,
  teilAb,
  anlagenMoeglich = false,
  schliessen,
  fertig,
}: {
  d: Dokument;
  post: boolean;
  versioniert: boolean;
  papierkorb: boolean;
  /** „Anlage ab hier“ anbieten (#1162): nur in Post, bei einem Hauptdokument ohne Anlagen. */
  anlagenMoeglich?: boolean;
  /** Vorschlag aus dem Hinweis „Post teilen?“ (#579): „Teilen ab hier“ an dieser Seite schon gesetzt – übernommen wird erst mit „Übernehmen“. */
  teilAb?: number;
  schliessen(): void;
  fertig(r: { dokumente: Dokument[]; posten: Mappe[] }): void;
}) {
  const [info, setInfo] = useState<Info>();
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  const [gezogen, setGezogen] = useState<number>();
  const kacheln = useRef<Array<HTMLLIElement | null>>([]);
  const [fokus, setFokus] = useState<number>();

  useEffect(() => {
    dokumenteApi.pdfSeiten(d.id).then(
      (i) => {
        setInfo(i);
        setSeiten(
          Array.from({ length: i.anzahl }, (_, k) => ({
            nr: k + 1,
            drehung: 0,
            weg: false,
            teilAb: !!teilAb && k + 1 === teilAb && k > 0,
            anlageAb: false,
          })),
        );
      },
      (e: Error) => setFehler(e.message),
    );
  }, [d.id, d.sha256]); // eslint-disable-line react-hooks/exhaustive-deps -- Seiten nur bei anderem Dokument oder anderem Inhalt neu laden
  // Mit Vorschlag (#579) die Kachel der Seite gleich ins Bild holen.
  useEffect(() => {
    if (teilAb && seiten.length >= teilAb) kacheln.current[teilAb - 1]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [teilAb, seiten.length]);
  useEffect(() => {
    if (fokus !== undefined) kacheln.current[fokus]?.focus();
  }, [fokus, seiten]);

  if (fehler && !info)
    return (
      <div className="hinweis schlecht pdfseiten">
        <p>{fehler}</p>
        <Knopf onClick={schliessen}>{t('ablage.pdfseiten.schliessen')}</Knopf>
      </div>
    );
  if (!info) return <p className="leise pdfseiten">{t('ablage.pdfseiten.lade-seiten')}</p>;

  const aendere = (i: number, p: Partial<Seite>) => setSeiten((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const verschiebe = (von: number, nach: number) => {
    if (nach < 0 || nach >= seiten.length || von === nach) return;
    setSeiten((s) => {
      const n = [...s];
      const [x] = n.splice(von, 1);
      n.splice(nach, 0, x);
      return n;
    });
    setFokus(nach);
  };
  const taste = (i: number, e: KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      verschiebe(i, i - 1);
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      verschiebe(i, i + 1);
    }
  };
  const fallen = (i: number, e: DragEvent) => {
    e.preventDefault();
    if (gezogen !== undefined) verschiebe(gezogen, i);
    setGezogen(undefined);
  };

  const bleiben = seiten.filter((s) => !s.weg);
  // Teile beginnen an Seiten, die bleiben; die erste bleibende beginnt immer den ersten Teil.
  const teile = positionen(bleiben, 'teilAb');
  const anlagen = anlagenMoeglich ? positionen(bleiben, 'anlageAb') : [];
  const geaendert =
    bleiben.length !== info.anzahl || teile.length > 0 || anlagen.length > 0 || bleiben.some((s, i) => s.nr !== i + 1 || s.drehung);
  const anzahlTeile = teile.length + 1;

  async function uebernehmen() {
    if (!bleiben.length) {
      setFehler(t('ablage.pdfseiten.mindestens-eine-seite-muss'));
      return;
    }
    const postTeilen = post && (anzahlTeile > 1 || anlagen.length > 0);
    let bestaetigt = false;
    if (!versioniert && !postTeilen) {
      if (
        !(await rueckfrage({
          titel: t('ablage.pdfseiten.ersetzen', { name: d.name }),
          text: t('ablage.pdfseiten.fuer-dieses-register-ist', {
            wert: papierkorb ? t('ablage.pdfseiten.das-bisherige-kommt-in') : t('ablage.pdfseiten.das-bisherige-ist-danach'),
          }),
          ja: t('ablage.pdfseiten.ersetzen-2'),
          gefahr: !papierkorb,
        }))
      )
        return;
      bestaetigt = true;
    }
    if (postTeilen && !(await postRueckfrage(d.name, anzahlTeile, anlagen.length))) return;
    setLaeuft(true);
    setFehler(undefined);
    try {
      fertig(
        await dokumenteApi.bearbeitePdf(d.id, {
          seiten: bleiben.map((s) => ({ nr: s.nr, drehung: s.drehung })),
          teile,
          ...(anlagen.length ? { anlagen } : {}),
          bestaetigt,
        }),
      );
    } catch (e) {
      setFehler((e as Error).message);
      setLaeuft(false);
    }
  }

  const zusammenfassung = zusammenfassungVon(info.anzahl, seiten, post, anzahlTeile, anlagen.length);

  return (
    <div className="pdfseiten" role="region" aria-label={t('ablage.pdfseiten.seiten-von', { name: d.name })}>
      <div className="pdfseiten-kopf">
        <strong>
          {t('ablage.pdfseiten.seiten-bearbeiten')} <Hilfe ort="dokumente.seiten" />
        </strong>
        <span className="leise klein">{t('ablage.pdfseiten.ziehen-oder-alt-pfeiltaste')}</span>
      </div>
      <ol className="seitenraster">
        {seiten.map((s, i) => {
          const pos = bleiben.indexOf(s);
          return (
            <Kachel
              key={s.nr}
              s={s}
              i={i}
              pos={pos}
              teile={teile}
              anlagen={anlagen}
              info={info}
              letzte={i === seiten.length - 1}
              anlagenMoeglich={anlagenMoeglich}
              gezogen={gezogen}
              setGezogen={setGezogen}
              element={(el) => {
                kacheln.current[i] = el;
              }}
              fallen={(e) => fallen(i, e)}
              taste={(e) => taste(i, e)}
              aendere={(p) => aendere(i, p)}
              verschiebe={(nach) => verschiebe(i, nach)}
            />
          );
        })}
      </ol>
      {anzahlTeile > 1 && (
        <p className="leise klein">
          {post
            ? t('ablage.pdfseiten.beim-uebernehmen-entsteht-je')
            : t('ablage.pdfseiten.teil-1-ersetzt-die', { name: d.name, wert: versioniert ? t('ablage.pdfseiten.als-neue-version') : '' })}
        </p>
      )}
      {anlagen.length > 0 && (
        <p className="leise klein">{anzahlTeile > 1 ? t('ablage.pdfseiten.anlagen-je-teil') : t('ablage.pdfseiten.anlagen-neue-post')}</p>
      )}
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
      <div className="pdfseiten-fuss">
        <span className="leise klein">{zusammenfassung}</span>
        <Knopf
          art="haupt"
          groesse="klein"
          gesperrt={!geaendert || !bleiben.length}
          laeuft={laeuft}
          laeuftText={t('ablage.pdfseiten.wird-uebernommen')}
          onClick={() => void uebernehmen()}>
          {t('ablage.pdfseiten.uebernehmen')}
        </Knopf>
        <Knopf groesse="klein" gesperrt={laeuft} onClick={schliessen}>
          {t('ablage.pdfseiten.abbrechen')}
        </Knopf>
      </div>
      {versioniert && <p className="leise klein">{t('ablage.pdfseiten.das-bisherige-pdf-bleibt')}</p>}
    </div>
  );
}
