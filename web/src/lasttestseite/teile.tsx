import { useState } from 'react';
import type { LasttestStand, Speicherwahl } from '../../../shared/src/lasttest';
import { bereinigeGeraet, GERAET_MAX, teileErgebnis } from '../../../shared/src/lasttest';
import { handbuchUrl } from '../../../shared/src/hilfe';
import { Aufklapper, Feld, Knopf, KnopfLink } from '../bausteine';
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

/** Felder für Gerät und Speicher (#1452: der Hinweis am Knopf „Kopieren“ springt dorthin). */
const FELD_ID = { geraet: 'lasttest-geraet', speicher: 'lasttest-speicher' } as const;

/**
 * Kopieren auch ohne HTTPS (NAS im Heimnetz, `http://`): Zwischenablage, sonst markieren und execCommand in einem kurz
 * angelegten, unsichtbaren Feld (#1251). Der Fokus geht danach zurück an den Knopf.
 */
async function kopiere(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* weiter */
  }
  const zurueck = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const behelf = document.createElement('textarea');
  behelf.value = text;
  behelf.readOnly = true;
  behelf.className = 'lasttest-behelf';
  document.body.appendChild(behelf);
  behelf.focus();
  behelf.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    behelf.remove();
    zurueck?.focus();
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

/**
 * Stand: Schritt, Demo-Mappen, Durchgang, Restdauer; Warnung ohne Datei, fertig, Abbruch. Mit Ablauf (#1251) stehen
 * Stufe, laufender Durchgang (#1452) und fertige Durchgänge in dessen Abschnitt; ohne (älteres Skript) wie bisher hier.
 */
export function LaufStand({
  stand,
  zustand,
  jetzt,
  rest,
  mitAblauf,
}: {
  stand: LasttestStand;
  zustand: Zustand;
  jetzt: number;
  rest: [number, number] | null;
  mitAblauf: boolean;
}) {
  return (
    <div className="lasttest-stand" role="status" aria-live="polite">
      {zustand === 'laeuft' && (
        <>
          <p>
            <strong>{t.frei(`lasttest.schritt.${stand.schritt}`)}</strong>
          </p>
          {stand.demo && !mitAblauf && (
            <>
              <progress max={stand.demo.gesamt || 1} value={stand.demo.fertig} />
              <p className="klein leise">{t('lasttest.demo', { fertig: zahl(stand.demo.fertig), gesamt: zahl(stand.demo.gesamt) })}</p>
            </>
          )}
          {stand.durchgang && !mitAblauf && (
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
      {!mitAblauf && !!stand.durchgaenge.length && (
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
      <Feld id={FELD_ID.geraet} className="breit" beschriftung={t('lasttest.geraet')} hinweis={t('lasttest.geraet.hinweis')}>
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
        id={FELD_ID.speicher}
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

/** Was im Ergebnis noch „bitte ergänzen“ heißt (#1452) – nur ein Hinweis, gesperrt wird nichts. */
type Ergaenzen = 'geraet' | 'speicher' | 'beide' | null;
export function ergaenzenAus(a: LasttestStand['angaben']): Ergaenzen {
  const geraet = !bereinigeGeraet(a.geraet);
  if (geraet) return a.speicher ? 'geraet' : 'beide';
  return a.speicher ? null : 'speicher';
}

/**
 * Ergebnis (#1452): ein Ergebnis, der Platz dafür ist von Anfang an da. Solange es fehlt, der Hinweis und die Vorschau
 * von Gerät und Speicher; dann oben der kurze Block für die Gerätemeldung (bis „RAM …“), darunter zum Aufklappen der
 * Rest mit dem ganzen Bericht. Kopieren und Herunterladen nehmen immer alles. Dazu Formular und Sammel-Issue.
 */
export function Ergebnis({
  stand,
  text,
  zeile,
  ergaenzen,
  kopiert,
  setKopiert,
  setGesichert,
}: {
  stand: LasttestStand;
  /** Das ganze Ergebnis (`ganzesErgebnis`); leer, solange der Test läuft. */
  text: string;
  zeile: string[];
  ergaenzen: Ergaenzen;
  kopiert: 'ja' | 'nein' | null;
  setKopiert: (k: 'ja' | 'nein') => void;
  setGesichert: (g: boolean) => void;
}) {
  const [ganz, setGanz] = useState(false);
  const datei = () => {
    herunterladen(`lasttest-${stand.wahl}.md`, text);
    setGesichert(true);
  };
  const { kurz, rest } = teileErgebnis(text);
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
          <pre className="lasttest-block" id="lasttest-ergebnis-text">
            {ganz ? text.replace(/\n$/, '') : kurz}
          </pre>
          {!!rest.trim() && (
            <Aufklapper form="zeile" offen={ganz} steuert="lasttest-ergebnis-text" umschalten={() => setGanz(!ganz)}>
              {t('lasttest.ergebnis.ganz')}
            </Aufklapper>
          )}
          {/* Am Knopf „Kopieren“ (#1452): fehlt noch Gerät oder Speicher, ein Satz mit Sprung zum Feld – gesperrt wird nichts. */}
          {ergaenzen && (
            <div className="hinweis warn">
              <p>
                <Symbol name="warnung" /> {t.frei(`lasttest.ergebnis.ergaenzen.${ergaenzen}`)}{' '}
                <Knopf
                  groesse="klein"
                  onClick={() => document.getElementById(FELD_ID[ergaenzen === 'speicher' ? 'speicher' : 'geraet'])?.focus()}>
                  {t('lasttest.ergebnis.zum-feld')}
                </Knopf>
              </p>
            </div>
          )}
          <div className="knoepfe">
            <Knopf
              art="haupt"
              symbol={kopiert === 'ja' ? 'haken' : undefined}
              onClick={() =>
                kopiere(text).then((ok) => {
                  setKopiert(ok ? 'ja' : 'nein');
                  if (ok) setGesichert(true);
                })
              }>
              {kopiert === 'ja' ? t('lasttest.kopiert') : t('lasttest.kopieren')}
            </Knopf>
            <Knopf symbol="herunterladen" onClick={datei}>
              {t('lasttest.herunterladen')}
            </Knopf>
            <KnopfLink href={FORMULAR} neuesFenster>
              {t('lasttest.formular')} <Symbol name="extern" />
            </KnopfLink>
            <KnopfLink href={SAMMEL} neuesFenster>
              {t('lasttest.sammel')} <Symbol name="extern" />
            </KnopfLink>
          </div>
          {kopiert === 'nein' && (
            <p className="klein fehlertext" role="alert">
              {t('lasttest.kopieren.geht-nicht')}
            </p>
          )}
          {stand.datei && <p className="klein leise">{t('lasttest.datei', { datei: stand.datei })}</p>}
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
