import { useRef, useState, type ReactNode } from 'react';
import { HILFE, hilfeOnlineUrl, type Hilfeort } from '../../../shared/src/hilfe';
import { Knopf } from '../bausteine';
import { Marke } from '../Marke';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { ladeDatei, merkeDatei } from './datei';
import { setzeStand, useAssistent, type Ansicht } from './stand';

/**
 * Einrichtungsassistent (#119, #804): erst sammeln, dann eine Zusammenfassung, dann „Jetzt einrichten“.
 *
 *   1 Code · 2 Datenbank · 3 Neu oder Sicherung       – sofort, weil technisch nötig
 *   4 Ablage · 5 Dein Konto · 6 Nutzung · 7 Pakete · 8 Optionales  – nur gesammelt, jederzeit änderbar
 *   9 Zusammenfassung → „Jetzt einrichten“ (mit Fortschritt) · 10 Fertig: Notfallblatt, Zwei-Faktor anbieten, abschließen
 *
 * Seit #821 gibt es nur „Dein Konto“: die Person, die einrichtet, mit „Gesamte Verwaltung“ – kein Administrator und
 * kein erster Benutzer daneben. Eine zweite Person mit Verwaltungsrecht empfiehlt danach ein Hinweis in der Werkbank.
 *
 * Im Assistenten gibt es keine einzelnen Speichern-Knöpfe (#803): „Weiter“ übernimmt alles, was im Schritt sichtbar
 * steht – auch Vorschläge, die man nicht geändert hat. Die Knöpfe stehen in jedem Schritt unten an derselben Stelle.
 */
export const SCHRITTE = [
  t('einrichtung.schritt.sprache'),
  t('einrichtung.schritt.code'),
  t('einrichtung.schritt.datenbank'),
  t('einrichtung.schritt.wahl'),
  t('einrichtung.schritt.ablage'),
  t('einrichtung.schritt.konto'),
  t('einrichtung.schritt.nutzung'),
  t('einrichtung.schritt.pakete'),
  t('einrichtung.schritt.optional'),
  t('einrichtung.schritt.zusammenfassung'),
  t('einrichtung.schritt.fertig'),
] as const;
/** Feste Schritte vor dem Sammeln (#729: Sprache zuerst). */
export const VOR = { sprache: 0, code: 1, datenbank: 2, wahl: 3 } as const;
export const NR: Record<Ansicht | 'fertig', number> = {
  ablage: 4,
  konto: 5,
  nutzung: 6,
  pakete: 7,
  optional: 8,
  zusammenfassung: 9,
  fertig: 10,
};
export const REIHE: Ansicht[] = ['ablage', 'konto', 'nutzung', 'pakete', 'optional', 'zusammenfassung'];
export const REPO = 'https://github.com/motom001/dms';

/** Hilfe je Schritt (#278): der passende Abschnitt im Online-Handbuch, mit Bildern. */
const HILFE_JE_SCHRITT: Hilfeort[] = [
  'einrichtung.sprache',
  'einrichtung.code',
  'einrichtung.datenbank',
  'einrichtung.wahl',
  'einrichtung.mandant',
  'einrichtung.konto',
  'einrichtung.nutzung',
  'einrichtung.pakete',
  'einrichtung.optional',
  'einrichtung.zusammenfassung',
  'einrichtung.fertig',
];

/** Schrittleiste: welche Schritte anklickbar sind, welche gesperrt (mit Grund). */
export interface Leiste {
  erledigt(i: number): boolean;
  klick?(i: number): (() => void) | null;
  gesperrt?(i: number): string | null;
}

function Fortschritt({ aktiv, leiste }: { aktiv: number; leiste?: Leiste }) {
  const [grund, setGrund] = useState<string | null>(null);
  const erledigt = (i: number) => i !== aktiv && (leiste ? leiste.erledigt(i) : i < aktiv);
  return (
    <>
      <ol
        className="assistent-schritte"
        aria-label={t('einrichtung.leiste', { nr: aktiv + 1, von: SCHRITTE.length, name: SCHRITTE[aktiv] })}>
        {SCHRITTE.map((s, i) => {
          const inhalt = (
            <>
              <span className="nr" aria-hidden="true">
                {erledigt(i) ? <Symbol name="haken" /> : i + 1}
              </span>
              <span className="name">{s}</span>
            </>
          );
          const gehe = i !== aktiv ? (leiste?.klick?.(i) ?? null) : null;
          const sperre = !gehe && i !== aktiv ? (leiste?.gesperrt?.(i) ?? null) : null;
          const klick = gehe
            ? () => {
                setGrund(null);
                gehe();
              }
            : sperre
              ? () => setGrund(sperre)
              : null;
          return (
            <li key={s} className={erledigt(i) ? 'erledigt' : i === aktiv ? 'aktiv' : ''} aria-current={i === aktiv ? 'step' : undefined}>
              {klick ? (
                <Knopf
                  art="link"
                  className="schrittknopf"
                  onClick={klick}
                  title={gehe ? t('einrichtung.leiste.zu', { name: s }) : t('einrichtung.leiste.gesperrt', { name: s })}>
                  {inhalt}
                </Knopf>
              ) : (
                inhalt
              )}
            </li>
          );
        })}
      </ol>
      {grund && (
        <div className="hinweis info klein" role="status">
          <p>
            <Symbol name="schloss" /> {grund}
          </p>
        </div>
      )}
    </>
  );
}

function SchrittHilfe({ aktiv }: { aktiv: number }) {
  const z = HILFE[HILFE_JE_SCHRITT[aktiv]];
  return (
    <a
      className="assistent-hilfe"
      href={hilfeOnlineUrl(z)}
      target="_blank"
      rel="noreferrer"
      title={t('einrichtung.hilfe.titel', { titel: z.titel })}
      aria-label={t('einrichtung.hilfe.label', { hilfe: t('einrichtung.hilfe') })}>
      <span className="hilfesymbol" aria-hidden="true">
        ?
      </span>{' '}
      {t('einrichtung.hilfe')}
    </a>
  );
}

/**
 * „Aus Konfigurationsdatei laden“ (#806), klein oben rechts. Auf dem Schritt „Einrichtungscode“ prüft Ablago die Datei
 * erst nach dem Code – ohne Code nimmt der Server nichts an.
 */
function DateiLaden({ ohneCode, imEinrichtungsmodus }: { ohneCode?: boolean; imEinrichtungsmodus?: boolean }) {
  const eingabe = useRef<HTMLInputElement>(null);
  const [meldung, setMeldung] = useState<string>();
  const st = useAssistent();
  async function gewaehlt(f: File | undefined) {
    if (!f) return;
    setMeldung(undefined);
    if (f.size > 64 * 1024) {
      setMeldung(t('einrichtung.datei.zugross'));
      return;
    }
    const text = await f.text();
    if (ohneCode) {
      merkeDatei(text);
      setMeldung(t('einrichtung.datei.nachcode', { name: f.name }));
      return;
    }
    if (
      st.sammlung.besucht.length &&
      !(await rueckfrage({
        titel: t('einrichtung.datei.ersetzen.titel'),
        text: t('einrichtung.datei.ersetzen.text'),
        ja: t('einrichtung.datei.ersetzen.ja'),
      }))
    )
      return;
    try {
      await ladeDatei(text, !!imEinrichtungsmodus);
    } catch (e) {
      setMeldung((e as Error).message);
    }
  }
  return (
    <span className="assistent-datei klein">
      <Knopf art="link" onClick={() => eingabe.current?.click()} title={t('einrichtung.datei.laden.titel')}>
        {t('einrichtung.datei.laden')}
      </Knopf>
      <input
        ref={eingabe}
        type="file"
        accept=".yaml,.yml,.json,application/yaml,application/json,text/yaml"
        hidden
        onChange={(e) => {
          void gewaehlt(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {meldung && (
        <span className="leise klein" role="status">
          {meldung}
        </span>
      )}
    </span>
  );
}

export function Rahmen({
  aktiv,
  titel,
  unter,
  children,
  leiste,
  datei,
}: {
  aktiv: number;
  titel: string;
  unter?: ReactNode;
  children: ReactNode;
  leiste?: Leiste;
  /** „Aus Konfigurationsdatei laden“ zeigen (#806). */
  datei?: { ohneCode?: boolean; imEinrichtungsmodus?: boolean };
}) {
  const st = useAssistent();
  return (
    <div className="kartenseite">
      <div className="karte breit assistent">
        <div className="marke gross">
          <Marke logo={null} schriftzug="Ablago" gross />
        </div>
        <div className="assistent-kopf">
          <p className="ueber">{t('einrichtung.kopf', { nr: aktiv + 1, von: SCHRITTE.length })}</p>
          <span className="assistent-kopf-rechts">
            {datei && <DateiLaden {...datei} />}
            <SchrittHilfe aktiv={aktiv} />
          </span>
        </div>
        <Fortschritt aktiv={aktiv} leiste={leiste} />
        {datei && st.dateiFehler.length > 0 && (
          <div className="hinweis schlecht stapel" role="alert">
            <p>
              <strong>{t('einrichtung.datei.fehler.titel')}</strong>
            </p>
            <ul>
              {st.dateiFehler.map((f, i) => (
                <li key={i}>
                  {f.zeile ? t('einrichtung.datei.fehler.zeile', { zeile: f.zeile, feld: f.feld }) : f.feld}: {f.text}
                </li>
              ))}
            </ul>
            <div className="knoepfe">
              <Knopf onClick={() => setzeStand((x) => ({ ...x, dateiFehler: [] }))}>{t('einrichtung.datei.fehler.schliessen')}</Knopf>
            </div>
          </div>
        )}
        <h1>{titel}</h1>
        {unter && <p className="leise">{unter}</p>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Sprache (#729) ---------- */

/** Zurück zum ersten Schritt: Sprache wählen. */
export const zurSprache = () => setzeStand((x) => ({ ...x, spracheGewaehlt: false }));
