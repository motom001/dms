import { useState, type ReactNode } from 'react';
import type { AutomatisierungAnsicht, AutomatisierungOrt, DannKarte, Kontextdaten } from '../../../../shared/src/automatisierung';
import { Feld, Knopf, KnopfLink, Suchfeld, type KnopfSperre } from '../../bausteine';
import { t } from '../../sprache';
import { umgestellt, useZiehen, Ziehgriff } from '../../ziehen';
import { vorratName, type VorratKarte, type Zweig } from './hilfen';

/**
 * Bausteine des Editors einer Automatisierung (#675, #1000; #1279 aus Automatisierungen.tsx gezogen): Sperre für
 * mitgelieferte, Probleme je Bereich, Ablagestellen, Kartenliste mit Umsortieren, Vorrat und „+ Karte“.
 */

/**
 * Warum sich eine mitgelieferte Automatisierung nicht löschen lässt (#1174): Sie kommt aus einem Paket (bzw. mit Ablago),
 * das sie beim nächsten Update wieder anlegte. Statt zu löschen: ausschalten – aus bleibt aus, auch nach Updates.
 */
export function mitgeliefertSperre(a: AutomatisierungAnsicht, k: Kontextdaten): KnopfSperre {
  if (a.herkunft !== 'paket' || !a.paketId)
    return { titel: t('automatisierung.ui.loeschen.gesperrt'), grund: t('automatisierung.ui.loeschen.ablago') };
  const name = k.pakete?.find((p) => p.id === a.paketId)?.name ?? a.paketId;
  return {
    titel: t('automatisierung.ui.loeschen.gesperrt'),
    grund: t('automatisierung.ui.loeschen.paket', { paket: name }),
    stattdessen: (
      <KnopfLink to={`/werkbank/pakete/${encodeURIComponent(a.paketId)}`} groesse="klein">
        {t('automatisierung.ui.loeschen.zum-paket', { paket: name })}
      </KnopfLink>
    ),
  };
}

/** Probleme eines Bereichs (#1000) stehen in ihm – nicht gesammelt am Ende des Formulars. */
export function Probleme({ liste, ort }: { liste: Array<{ ort: AutomatisierungOrt; text: string }>; ort: AutomatisierungOrt }) {
  const hier = [...new Set(liste.filter((x) => x.ort === ort).map((x) => x.text))];
  return hier.length ? (
    <ul className="fehlertext klein">
      {hier.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  ) : null;
}

/**
 * Ablagestelle für Karten in „Wenn“ (mit „Und“) und „Dann“. Kein Kasten und keine zweite Überschrift (#1000,
 * Musterkatalog C15): Der Bereich trägt die `h2`; nur „Und“ als Abschnitt darin bekommt eine `h3`.
 */
export function Bereichskasten({
  titel,
  hinweis,
  ablage,
  kopf,
  fuss,
  children,
}: {
  titel?: string;
  hinweis?: string;
  ablage: Record<string, unknown>;
  kopf?: ReactNode;
  fuss?: ReactNode;
  children: ReactNode;
}) {
  const { className, ...rest } = ablage as { className?: string };
  const Huelle = titel ? 'section' : 'div';
  return (
    <Huelle className={`automatisierung-bereich ${className ?? ''}`} {...rest}>
      {(titel || kopf) && (
        <div className="zeile">
          {titel && <h3 className="h4">{titel}</h3>}
          {kopf}
        </div>
      )}
      {hinweis && <p className="leise klein">{hinweis}</p>}
      {children}
      {fuss}
    </Huelle>
  );
}

/** Karten eines Zweigs (Dann oder Sonst, #677): umsortieren, aufklappen, entfernen. */
export function KartenListe({
  zweig,
  karten,
  setze,
  offen,
  setOffen,
  editor,
  kurz,
}: {
  zweig: Zweig;
  karten: DannKarte[];
  setze: (k: DannKarte[]) => void;
  offen: string | null;
  setOffen: (id: string | null) => void;
  editor: (karte: DannKarte, setze: (n: DannKarte) => void) => ReactNode;
  kurz: (karte: DannKarte) => string;
}) {
  const reihe = useZiehen({
    erlaubt: (q, ziel) => karten.some((x) => x.id === q) && karten.some((x) => x.id === ziel),
    fertig: (q, ziel, ort) =>
      setze(
        umgestellt(
          karten,
          karten.findIndex((y) => y.id === q),
          karten.findIndex((y) => y.id === ziel),
          ort === 'in' ? 'nach' : ort,
        ),
      ),
  });
  return (
    <ol className="automatisierung-karten" data-zweig={zweig}>
      {karten.map((karte, i) => (
        <li key={karte.id} {...reihe.eintrag(karte.id)}>
          <div className="karte-kopf">
            <Ziehgriff
              griff={reihe.griff(karte.id, vorratName({ bereich: 'dann', art: karte.art }))}
              tasten={{
                hoch: i > 0 ? () => setze(umgestellt(karten, i, i - 1, 'vor')) : undefined,
                runter: i < karten.length - 1 ? () => setze(umgestellt(karten, i, i + 1, 'nach')) : undefined,
              }}
            />
            <Knopf aria-expanded={offen === karte.id} onClick={() => setOffen(offen === karte.id ? null : karte.id)}>
              <strong>{vorratName({ bereich: 'dann', art: karte.art })}</strong> <span className="leise">{kurz(karte)}</span>
            </Knopf>
            <Knopf groesse="klein" symbol="schliessen" onClick={() => setze(karten.filter((x) => x.id !== karte.id))}>
              {t('automatisierung.ui.entfernen')}
            </Knopf>
          </div>
          {offen === karte.id && editor(karte, (n) => setze(karten.map((x) => (x.id === karte.id ? n : x))))}
        </li>
      ))}
    </ol>
  );
}

export function Vorrat({
  vorrat,
  ablage,
  fuegeHinzu,
  passend,
}: {
  vorrat: VorratKarte[];
  ablage: ReturnType<typeof useZiehen>;
  fuegeHinzu: (b: string, art: string) => void;
  passend: (v: { art: string }) => boolean;
}) {
  const [suche, setSuche] = useState('');
  const treffer = vorrat
    .filter((v) => passend(v))
    .filter((v) => !suche.trim() || vorratName(v).toLowerCase().includes(suche.trim().toLowerCase()));
  return (
    <div className="automatisierung-vorrat">
      <Suchfeld
        wert={suche}
        setze={setSuche}
        beschriftung={t('automatisierung.ui.vorrat.suchen')}
        platzhalter={t('automatisierung.ui.vorrat.suchen')}
      />
      <p className="leise klein">{t('automatisierung.ui.vorrat.hinweis')}</p>
      {(['wenn', 'und', 'dann'] as const).map((b) => {
        const liste = treffer.filter((v) => v.bereich === b);
        return liste.length ? (
          <div key={b}>
            <p className="klein">
              <strong>{t.frei(`automatisierung.ui.${b}`)}</strong>
            </p>
            <ul className="stapel">
              {liste.map((v) => (
                <li key={`${v.bereich}|${v.art}`} className="vorratkarte">
                  <Ziehgriff griff={ablage.griff(`${v.bereich}|${v.art}`, vorratName(v))} tasten={{}} />
                  <Knopf onClick={() => fuegeHinzu(v.bereich, v.art)}>{vorratName(v)}</Knopf>
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      })}
    </div>
  );
}

export function KarteHinzu({
  vorrat,
  bereich,
  fuegeHinzu,
  passend,
}: {
  vorrat: VorratKarte[];
  bereich: 'und' | Zweig;
  fuegeHinzu: (b: string, art: string) => void;
  passend: (v: { art: string }) => boolean;
}) {
  return (
    <Feld beschriftung={t('automatisierung.ui.karte.hinzu')} beschriftungVerbergen className="klein">
      <select
        value=""
        onChange={(x) => {
          if (x.target.value) fuegeHinzu(bereich, x.target.value);
        }}>
        <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
        {vorrat
          .filter((v) => v.bereich === (bereich === 'sonst' ? 'dann' : bereich) && passend(v))
          .map((v) => (
            <option key={v.art} value={v.art}>
              {vorratName(v)}
            </option>
          ))}
      </select>
    </Feld>
  );
}
