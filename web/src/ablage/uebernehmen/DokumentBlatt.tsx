import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Dokument } from '../../../../shared/src/model';
import type { Bereich, SchwaerzSeite } from '../../../../shared/src/schwaerzen';
import { wegfallendeSeiten, type Leerseiten } from '../../../../shared/src/leerseiten';
import { dokumentUrl, schwaerzBildUrl } from '../../api/dokumente';
import { Knopf, Umschalter } from '../../bausteine';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { farbeVon, setzeNutzlast, type Marke, type Nutzlast } from '../bruecke';
import { ansichtVon } from '../Dokumente';
import { GrosseSeiteMarke, grosseSeite, MitLeerseiten } from '../Leerseiten';
import { klebenderKopf, SeiteFigur, SeitenSprung, useSeitenlage, type Seitenlage } from '../Seitenbetrachter';
import { BereichFlaeche, BereichKnopf, BereichZeilen, type BereichLage } from './bereich';
import type { Woerter } from './hilfen';

/**
 * Ein Dokument in der Mitte: Seitenbilder mit Rahmen und markierbarem Text. Kopf wie in der Mappe (#1211, #1217):
 * Umschalter „PDF/A · Original“, „Seite n von N“ (#1324), „In neuem Tab“. Die Seiten rollen mit der Spalte, der Kopf
 * bleibt oben stehen (#1323); Bild und Wörter einer Seite entstehen erst in ihrer Nähe (#1339). Ein Original, das sich
 * nicht anzeigen lässt, mit Satz und „Original herunterladen“.
 */
export function DokumentBlatt({
  x,
  w,
  marken,
  hervor,
  setHervor,
  insAktive,
  leer,
  setzeLeer,
  herunterladen,
  bereich,
}: {
  x: Dokument;
  w: Woerter | 'keine' | undefined;
  marken: Marke[];
  hervor: string | null;
  setHervor(k: string | null): void;
  insAktive(n: Nutzlast, eigenesFeld?: string): void;
  /** Leerseiten (#997): Markierung des Pakets und Wahl je Seite; null ohne. */
  leer: Leerseiten | null;
  setzeLeer(l: Leerseiten | null): void;
  /** Darf das Original heruntergeladen werden (Exportrecht, kein Pflicht-Stempel)? */
  herunterladen: boolean;
  /** Bereich markieren (#1597); fehlt, wo es kein Formular rechts gibt. */
  bereich?: BereichLage;
}) {
  const weg = wegfallendeSeiten(leer);
  const mitArchiv = x.archivfassung?.stand === 'fertig';
  const [archiv, setArchiv] = useState(mitArchiv);
  useEffect(() => {
    setArchiv(mitArchiv);
  }, [mitArchiv]);
  const { seiten, nurArchiv } = zuZeigen(w, archiv);
  const ansicht = ansichtVon(x, !archiv);
  const lage = useSeitenlage(seiten?.length ?? 0);
  return (
    <article className="ue-dokument" aria-label={x.name} ref={lage.wurzel}>
      <DokKopf
        x={x}
        archiv={mitArchiv ? archiv : null}
        setArchiv={setArchiv}
        tab={ansicht?.url}
        lage={seiten?.length ? lage : null}
        bereich={bereich}
      />
      {bereich && <BereichZeilen b={bereich} dokId={x.id} />}
      {w === undefined ? (
        <p className="leise klein ue-betrachter-text">{t('ablage.uebernehmen.lade')}</p>
      ) : seiten?.length ? (
        <div className="ue-betrachter" tabIndex={0} role="group" aria-label={x.name}>
          <OhneText x={x} w={w} />
          <MitLeerseiten x={x} l={leer} darf geaendert={setzeLeer}>
            {seiten.map((s, i) => (
              <Seite
                key={`${i}-${archiv}`}
                x={x}
                nr={i + 1}
                lage={lage}
                s={s}
                archiv={archiv}
                marken={marken}
                hervor={hervor}
                setHervor={setHervor}
                insAktive={insAktive}
                weg={weg.includes(i + 1)}
                bereich={bereich}
              />
            ))}
          </MitLeerseiten>
        </div>
      ) : ansicht && !nurArchiv ? (
        <div className="ue-ansicht">
          {ansicht.pdf ? <iframe src={ansicht.url} title={x.name} /> : <img src={ansicht.url} alt={x.name} />}
        </div>
      ) : (
        <NichtAnzeigbar x={x} herunterladen={herunterladen} />
      )}
    </article>
  );
}

/** Seiten ohne Text mit Lage: Die Texterkennung läuft noch – oder Rahmen und Markieren gehen hier nicht. */
function OhneText({ x, w }: { x: Dokument; w: Woerter | 'keine' }) {
  if (w === 'keine' || w.mitText) return null;
  const laeuft = x.ocr?.stand === 'wartet' || x.ocr?.stand === 'laeuft';
  return <p className="leise klein">{laeuft ? t('ablage.uebernehmen.text-kommt') : t('ablage.uebernehmen.ohne-text')}</p>;
}

/**
 * Welche Seiten das Blatt zeigt: Stammen sie nur aus der Archivfassung (#1137, z. B. E-Mail), zeigt „Original“ keine
 * Seiten und keinen Betrachter, sondern den Satz mit „Original herunterladen“ wie in der Mappe.
 */
function zuZeigen(w: Woerter | 'keine' | undefined, archiv: boolean): { seiten: SchwaerzSeite[] | null; nurArchiv: boolean } {
  if (!w || w === 'keine') return { seiten: null, nurArchiv: false };
  return { seiten: archiv || !w.archiv ? w.seiten : null, nurArchiv: !!w.archiv };
}

/** Kopf eines Dokuments wie in der Mappe (#1211): Name, Umschalter „PDF/A · Original“ (`archiv` null: ohne Archivfassung), „In neuem Tab“. */
function DokKopf({
  x,
  archiv,
  setArchiv,
  tab,
  lage,
  bereich,
}: {
  x: Dokument;
  archiv: boolean | null;
  setArchiv(an: boolean): void;
  tab?: string;
  /** Mit Seiten: „Seite n von N“ und der Kopf bleibt oben stehen (#1323, #1324). */
  lage: Seitenlage | null;
  bereich?: BereichLage;
}) {
  return (
    <div className={`dokansicht-kopf klein ue-dokkopf ${lage ? klebenderKopf : ''}`} data-seitenkopf>
      <span className="ue-dokname">{x.name}</span>
      {bereich && lage && <BereichKnopf b={bereich} dokId={x.id} />}
      {archiv !== null && (
        <Umschalter
          wert={archiv ? 'archiv' : 'original'}
          setze={(v) => setArchiv(v === 'archiv')}
          beschriftung={t('ablage.dokumente.fassung')}
          wahlen={[
            { wert: 'archiv', text: t('ablage.dokumente.laden.pdfa') },
            { wert: 'original', text: t('ablage.dokumente.laden.original') },
          ]}
        />
      )}
      {archiv === null && x.archivfassung?.stand === 'wartet' && <span className="leise">{t('volltext.archiv.wird-erstellt')}</span>}
      {archiv !== null && <Hilfe ort="dokumente.archivfassung" />}
      {lage && <SeitenSprung lage={lage} />}
      {tab && (
        <a
          className="verweis dokansicht-tab"
          href={tab}
          target="_blank"
          rel="noreferrer"
          aria-label={t('ablage.dokumente.in-neuem-tab-oeffnen-2', { name: x.name })}>
          {t('ablage.dokumente.in-neuem-tab')} <Symbol name="extern" />
        </a>
      )}
    </div>
  );
}

/** Original, das der Browser nicht zeigt (#946, #1211, z. B. eine E-Mail): ein Satz und „Original herunterladen“. */
function NichtAnzeigbar({ x, herunterladen }: { x: Dokument; herunterladen: boolean }) {
  const endung = /\.([^.]{1,8})$/.exec(x.name)?.[1]?.toLowerCase();
  return (
    <div className="dokansicht-leer">
      <p>{endung ? t('ablage.dokumente.original-nicht-anzeigbar', { endung }) : t('ablage.dokumente.original-nicht-anzeigbar-ohne')}</p>
      {herunterladen && (
        <Knopf
          symbol="herunterladen"
          onClick={() => {
            location.assign(dokumentUrl(x.id, true));
          }}>
          {t('ablage.dokumente.original-herunterladen')}
        </Knopf>
      )}
    </div>
  );
}

/** Eine Seite: Bild, darüber die Wörter (zum Markieren) und die Rahmen (zum Ziehen und Anklicken). */
function Seite({
  x,
  nr,
  lage,
  s,
  archiv,
  marken,
  hervor,
  setHervor,
  insAktive,
  weg = false,
  bereich,
}: {
  x: Dokument;
  nr: number;
  lage: Seitenlage;
  s: SchwaerzSeite;
  archiv: boolean;
  marken: Marke[];
  hervor: string | null;
  setHervor(k: string | null): void;
  insAktive(n: Nutzlast, eigenesFeld?: string): void;
  /** Leerseite (#997): fällt beim Übernehmen weg – blass. */
  weg?: boolean;
  /** Bereich markieren (#1597): Ist er für dieses Dokument an, zieht man ein Rechteck statt Wörter zu markieren. */
  bereich?: BereichLage;
}) {
  const [wahl, setWahl] = useState<{ von: number; bis: number; zieht: boolean } | null>(null);
  const prozent = (a: { x: number; y: number; b: number; h: number }) => ({
    left: `${a.x * 100}%`,
    top: `${a.y * 100}%`,
    width: `${a.b * 100}%`,
    height: `${a.h * 100}%`,
  });
  const hier = marken.flatMap((m) =>
    m.bereiche
      .filter((b) => b.seite === nr)
      .map((b, i) => ({ m, b, erster: i === 0 && m.bereiche.findIndex((y) => y.seite === nr) === m.bereiche.indexOf(b) })),
  );
  const nummern = gemeinsameNummern(hier);
  const gewaehlt = wahl ? [Math.min(wahl.von, wahl.bis), Math.max(wahl.von, wahl.bis)] : null;
  function fertig() {
    if (!wahl || !gewaehlt) return;
    const text = s.woerter
      .slice(gewaehlt[0], gewaehlt[1] + 1)
      .map((y) => y[0])
      .join(' ');
    setWahl({ ...wahl, zieht: false });
    if (text.trim()) insAktive({ text });
  }
  // Wörter nur in der Nähe (#1339): 100 Seiten Text sind sonst Zehntausende Elemente bei jeder Eingabe.
  const nah = lage.istNah(nr);
  return (
    <SeiteFigur
      nr={nr}
      lage={lage}
      mass={s}
      bild={schwaerzBildUrl(x, nr, archiv)}
      klasse={grosseSeite(weg)}
      leer={weg}
      unter={<GrosseSeiteMarke weg={weg} />}
      flaeche={{
        onPointerUp: () => {
          if (wahl?.zieht) fertig();
        },
        onPointerLeave: () => {
          if (wahl?.zieht) fertig();
        },
      }}>
      {nah &&
        s.woerter.map((y, k) => (
          <span
            key={k}
            className={`ue-wort${gewaehlt && k >= gewaehlt[0] && k <= gewaehlt[1] ? ' an' : ''}`}
            style={prozent({ x: y[1], y: y[2], b: y[3], h: y[4] })}
            onPointerDown={(e: ReactPointerEvent) => {
              if (e.button > 0) return;
              e.preventDefault();
              setWahl({ von: k, bis: k, zieht: true });
            }}
            onPointerEnter={() => {
              if (wahl?.zieht) setWahl({ ...wahl, bis: k });
            }}
          />
        ))}
      {hier.map(({ m, b, erster }, k) => (
        <span
          key={`r${k}`}
          className={`ue-rahmen ${farbeVon(m.nr)}${hervor === m.feldKey ? ' an' : ''}${m.beleg !== undefined ? ' beleg' : ''}`}
          style={prozent(b as Bereich)}
          data-marke={m.nr}
          draggable
          role="button"
          tabIndex={erster ? 0 : -1}
          aria-label={t('ablage.uebernehmen.rahmen', { nr: m.nr, text: m.nutzlast.text })}
          title={t('ablage.uebernehmen.rahmen-titel', { text: m.nutzlast.text })}
          onDragStart={(e) => setzeNutzlast(e, m.nutzlast)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHervor(m.feldKey)}
          onMouseLeave={() => setHervor(null)}
          onFocus={() => setHervor(m.feldKey)}
          onBlur={() => setHervor(null)}
          onClick={() => insAktive(m.nutzlast, m.feldKey)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              insAktive(m.nutzlast, m.feldKey);
            }
          }}>
          {nummern[k].length === 1 && <span className="ue-rahmen-nr">{m.nr}</span>}
        </span>
      ))}
      {bereich?.an === x.id && <BereichFlaeche fertig={(r) => bereich.fertig(x.id, s, r)} />}
      {/* Mehrere Nummern einer Stelle (#1647) über allen Rahmen; die Namen der Rahmen nennen sie schon. */}
      {hier.map(({ b }, k) =>
        nummern[k].length > 1 ? (
          <span key={`n${k}`} className="ue-rahmen-nrn" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }} aria-hidden="true">
            {nummern[k].map((nr) => (
              <span key={nr} className={`ue-nr ${farbeVon(nr)}`}>
                {nr}
              </span>
            ))}
          </span>
        ) : null,
      )}
    </SeiteFigur>
  );
}

/** Abstand (Anteil der Seite), unter dem zwei Nummern als „an derselben Stelle“ gelten – sie lägen übereinander. */
const GLEICHE_STELLE = 0.01;

/**
 * Nummern je Rahmen (#1647): Teilen sich mehrere Felder eine Stelle, lägen ihre Nummern übereinander und nur die oberste
 * wäre zu sehen. Darum stehen alle zusammen („2 3“) an der Stelle des letzten Rahmens, die Rahmen selbst ohne Nummer.
 */
function gemeinsameNummern(hier: Array<{ m: Marke; b: Bereich; erster: boolean }>): number[][] {
  const liste = hier.map((): number[] => []);
  hier.forEach(({ m, b, erster }, i) => {
    if (!erster) return;
    let ziel = i;
    for (let k = i + 1; k < hier.length; k++) {
      const x = hier[k];
      if (x.erster && Math.abs(x.b.x - b.x) < GLEICHE_STELLE && Math.abs(x.b.y - b.y) < GLEICHE_STELLE) ziel = k;
    }
    liste[ziel].push(m.nr);
  });
  return liste;
}
