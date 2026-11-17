import type { RefObject } from 'react';
import type { LasttestStand, Speicherwahl } from '../../../shared/src/lasttest';
import { GERAET_MAX } from '../../../shared/src/lasttest';
import { handbuchUrl } from '../../../shared/src/hilfe';
import { Feld, Knopf } from '../bausteine';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Teile der Lasttest-Seite (#1279 aus lasttest.tsx gezogen): Stand des Laufs, Angaben zu Gerät und Speicher, Ergebnis
 * zum Kopieren oder Herunterladen und das Herunterfahren.
 */

const FORMULAR = 'https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml';
const SAMMEL = 'https://github.com/motom001/dms/issues/576';
export const zahl = (n: number) => n.toLocaleString(gebietsschema());
const prozent = (q: number) => `${(q * 100).toFixed(2).replace('.', ',')} %`;

/** Kopieren auch ohne HTTPS (NAS im Heimnetz): Zwischenablage, sonst markieren und execCommand. */
async function kopiere(text: string, feld: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* weiter */
  }
  if (!feld) return false;
  feld.focus();
  feld.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

function herunterladen(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Zustand = LasttestStand['zustand'];

/** Stand: Stufe, Schritt, Demo-Mappen, Durchgang, Restdauer; Warnung ohne Datei, fertig, Abbruch, fertige Durchgänge. */
export function LaufStand({
  stand,
  zustand,
  jetzt,
  rest,
}: {
  stand: LasttestStand;
  zustand: Zustand;
  jetzt: number;
  rest: [number, number] | null;
}) {
  return (
    <div className="lasttest-stand" role="status" aria-live="polite">
      {zustand === 'laeuft' && (
        <>
          {stand.stufe && <p className="klein leise">{t('lasttest.stufe', { nr: stand.nr, von: stand.von })}</p>}
          <p>
            <strong>{t.frei(`lasttest.schritt.${stand.schritt}`)}</strong>
          </p>
          {stand.demo && (
            <>
              <progress max={stand.demo.gesamt || 1} value={stand.demo.fertig} />
              <p className="klein leise">{t('lasttest.demo', { fertig: zahl(stand.demo.fertig), gesamt: zahl(stand.demo.gesamt) })}</p>
            </>
          )}
          {stand.durchgang && (
            <p className="klein">
              {t('lasttest.durchgang', {
                name: stand.durchgang.name,
                n: stand.durchgang.n,
                sekunden: Math.max(0, Math.round((stand.durchgang.ende - jetzt) / 1000)),
              })}
            </p>
          )}
          <p className="lasttest-rest">
            <Symbol name="stoppuhr" />{' '}
            {rest
              ? rest[0] === rest[1]
                ? t('lasttest.rest.eine', { bis: rest[1] })
                : t('lasttest.rest', { von: rest[0], bis: rest[1] })
              : t('lasttest.rest.gleich')}
          </p>
        </>
      )}
      {!!stand.ohneDatei && (
        <div className="hinweis warn">
          <p>
            <Symbol name="warnung" /> <strong>{t('lasttest.ohne-datei', { anzahl: stand.ohneDatei, zahl: zahl(stand.ohneDatei) })}</strong>{' '}
            {t('lasttest.ohne-datei.text')}
          </p>
        </div>
      )}
      {zustand === 'fertig' && (
        <div className="hinweis gut">
          <p>
            <Symbol name="haken" /> <strong>{t('lasttest.fertig')}</strong>
            {stand.ergebnis?.verfehlt ? ` ${t('lasttest.fertig.verfehlt')}` : ''}
          </p>
        </div>
      )}
      {(zustand === 'abbruch' || zustand === 'fehler') && (
        <div className="hinweis schlecht">
          <p>
            <Symbol name="warnung" /> <strong>{t(zustand === 'abbruch' ? 'lasttest.abbruch' : 'lasttest.fehler')}</strong> {stand.meldung}{' '}
            {zustand === 'fehler' ? t('lasttest.fehler.protokoll') : ''}
          </p>
        </div>
      )}
      {!!stand.durchgaenge.length && (
        <ul className="klein leise lasttest-durchgaenge">
          {stand.durchgaenge.map((d, i) => (
            <li key={i}>{t('lasttest.durchgang.fertig', { name: d.name, p95: d.p95 ?? '–', fehler: prozent(d.fehlerquote) })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Gerät und Speicher: gehen sofort in den Block, der Server bekommt sie kurz danach. */
export function Angaben({
  stand,
  angaben,
  zustand,
  setGeraet,
  setSpeicher,
  merke,
}: {
  stand: LasttestStand;
  angaben: LasttestStand['angaben'];
  zustand: Zustand;
  setGeraet: (g: string) => void;
  setSpeicher: (s: Speicherwahl | null) => void;
  merke: (a: Partial<LasttestStand['angaben']>) => void;
}) {
  return (
    <div className="formular">
      <Feld className="breit" beschriftung={t('lasttest.geraet')} hinweis={t('lasttest.geraet.hinweis')}>
        <input
          value={angaben.geraet}
          maxLength={GERAET_MAX}
          placeholder={t('lasttest.geraet.beispiel')}
          disabled={zustand === 'beendet'}
          onChange={(e) => {
            setGeraet(e.target.value);
            merke({ geraet: e.target.value });
          }}
        />
      </Feld>
      <Feld
        beschriftung={t('lasttest.speicher')}
        hinweis={
          stand.speicherErkannt
            ? t('lasttest.speicher.hinweis.erkannt', { art: stand.speicherErkannt })
            : t('lasttest.speicher.hinweis.offen')
        }>
        <select
          value={angaben.speicher ?? ''}
          disabled={zustand === 'beendet'}
          onChange={(e) => {
            const w = (e.target.value || null) as Speicherwahl | null;
            setSpeicher(w);
            merke({ speicher: w });
          }}>
          {!angaben.speicher && <option value="">{t('lasttest.speicher.waehlen')}</option>}
          {(['HDD', 'SSD', t('oberflaeche.lasttest.nvme')] as const).map((a) => (
            <option key={a} value={a}>
              {a === stand.speicherErkannt ? t('lasttest.speicher.erkannt', { art: a }) : a}
            </option>
          ))}
          <option value="unbekannt">{t('lasttest.speicher.unbekannt')}</option>
        </select>
      </Feld>
      <p className="feld breit klein leise lasttest-auto">{t('lasttest.automatisch')}</p>
    </div>
  );
}

/** Ergebnis: Vorschau, solange es fehlt; dann Block, Kopieren, Herunterladen, Formular, Sammel-Issue und Bericht. */
export function Ergebnis({
  stand,
  block,
  zeile,
  kopiert,
  setKopiert,
  feld,
  textDatei,
  setGesichert,
}: {
  stand: LasttestStand;
  block: string;
  zeile: string[];
  kopiert: 'ja' | 'nein' | null;
  setKopiert: (k: 'ja' | 'nein') => void;
  feld: RefObject<HTMLTextAreaElement | null>;
  textDatei: string;
  setGesichert: (g: boolean) => void;
}) {
  return (
    <section className="lasttest-ergebnis" aria-labelledby="lasttest-ergebnis">
      <h2 id="lasttest-ergebnis">{t('lasttest.ergebnis')}</h2>
      {!stand.ergebnis ? (
        <>
          <p className="leise">{t('lasttest.ergebnis.warten')}</p>
          <p className="klein mono umbruch">{t('lasttest.vorschau', { geraet: zeile[0], speicher: zeile[1] })}</p>
        </>
      ) : (
        <>
          <p className="klein leise">{t('lasttest.ergebnis.text')}</p>
          <Feld beschriftung={t('lasttest.ergebnis')} beschriftungVerbergen>
            <textarea ref={feld} className="mono lasttest-block" readOnly value={block} rows={block.split('\n').length} />
          </Feld>
          <div className="knoepfe">
            <Knopf
              art="haupt"
              symbol={kopiert === 'ja' ? 'haken' : undefined}
              onClick={() => kopiere(block, feld.current).then((ok) => setKopiert(ok ? 'ja' : 'nein'))}>
              {kopiert === 'ja' ? t('lasttest.kopiert') : t('lasttest.kopieren')}
            </Knopf>
            <Knopf
              symbol="herunterladen"
              onClick={() => {
                herunterladen(`lasttest-${stand.wahl}.md`, textDatei);
                setGesichert(true);
              }}>
              {t('lasttest.herunterladen')}
            </Knopf>
            <a className="knopf" href={FORMULAR} target="_blank" rel="noreferrer">
              {t('lasttest.formular')} <Symbol name="extern" />
            </a>
            <a className="knopf" href={SAMMEL} target="_blank" rel="noreferrer">
              {t('lasttest.sammel')} <Symbol name="extern" />
            </a>
          </div>
          {kopiert === 'nein' && (
            <p className="klein fehlertext" role="alert">
              {t('lasttest.kopieren.geht-nicht')}
            </p>
          )}
          {stand.datei && <p className="klein leise">{t('lasttest.datei', { datei: stand.datei })}</p>}
          <details>
            <summary>{t('lasttest.bericht')}</summary>
            <pre className="lasttest-bericht">{stand.ergebnis.bericht}</pre>
          </details>
        </>
      )}
    </section>
  );
}

/** Ende: nach dem Herunterfahren der Dank, sonst Handbuch und „Test beenden“ (Gefahr, mit Rückfrage). */
export function Ende({
  zustand,
  herunterfahren,
  beendenText,
}: {
  zustand: Zustand;
  herunterfahren: () => Promise<void>;
  beendenText: string;
}) {
  return zustand === 'beendet' ? (
    <div className="hinweis gut stapel" role="status">
      <p>
        <strong>{t('lasttest.danke')}</strong>
      </p>
      <p>{t('lasttest.danke.text')}</p>
      <p>
        {t('lasttest.danke.teilen')}{' '}
        <a className="verweis" href={SAMMEL} target="_blank" rel="noreferrer">
          {t('lasttest.sammel')} <Symbol name="extern" />
        </a>
      </p>
      <p className="klein">{t('lasttest.beendet.text')}</p>
    </div>
  ) : (
    <div className="knoepfe lasttest-ende">
      <a className="verweis klein" href={handbuchUrl('admin', null, 'lasttest/')} target="_blank" rel="noreferrer">
        {t('lasttest.handbuch')} <Symbol name="extern" />
      </a>
      <Knopf
        art="gefahr"
        symbol="abmelden"
        onClick={herunterfahren}
        rueckfrage={{ titel: t('lasttest.beenden.frage'), text: beendenText, ja: t('lasttest.beenden.frage.ja') }}>
        {t('lasttest.beenden')}
      </Knopf>
    </div>
  );
}
