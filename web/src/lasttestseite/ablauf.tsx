import { useState } from 'react';
import { dauerVon, type LasttestStand, type LasttestStufe } from '../../../shared/src/lasttest';
import {
  stufenZeit,
  stufenZustand,
  zeilenDauer,
  type AblaufZeile,
  type LasttestAblauf,
  type ZeilenZustand,
} from '../../../shared/src/lasttestablauf';
import { Aufklapper } from '../bausteine';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { zahl } from './teile';

/**
 * Ablauf des Lasttests als Tabelle (#1251, Nachtrag von Thomas): von Anfang an alle geplanten Schritte und Durchgänge
 * je Stufe, die sich während des Laufs füllen – ✓ erledigt mit Dauer und Werten, „läuft“ mit Fortschritt, offen grau.
 * Bei „alle“ je Stufe eine Gruppe, die laufende aufgeklappt. Bei groß stehen nur die nächsten Schritte der Grenzsuche da
 * („läuft, bis die Grenze erreicht ist“), nicht erreichte am Ende als „nicht nötig“. Am Handy scrollt die Tabelle in
 * ihrem Rahmen, die Seite bleibt ohne waagerechtes Scrollen. Den Zustand führt shared/src/lasttestablauf.ts.
 */

/** So viele offene Schritte der Grenzsuche stehen einzeln da; der Rest in einer Zeile. */
const GRENZE_VORAUS = 3;
const prozent = (q: number) => `${(q * 100).toFixed(2).replace('.', ',')} %`;

/** Dauer in Worten: „45 s“, „3 min 20 s“, „1 h 5 min“. */
function dauer(s: number): string {
  if (s < 60) return t('lasttest.dauer.sekunden', { s });
  if (s < 3600) return t('lasttest.dauer.minuten', { min: Math.floor(s / 60), s: s % 60 });
  return t('lasttest.dauer.stunden', { h: Math.floor(s / 3600), min: Math.floor((s % 3600) / 60) });
}

function Zustand({ z }: { z: ZeilenZustand }) {
  return (
    <span className="lasttest-zustand" data-zustand={z}>
      {z === 'erledigt' && <Symbol name="haken" />}
      {z === 'laeuft' && <span className="lasttest-punkt" aria-hidden="true" />}
      {t.frei(`lasttest.zustand.${z}`)}
    </span>
  );
}

type Anzeige =
  { art: 'zeile'; z: AblaufZeile } | { art: 'weiter'; bis: number; anzahl: number } | { art: 'unnoetig'; von: string; bis: string };

/** Zeilen für die Tabelle: Grenzsuche gekürzt (nächste offene einzeln, Rest und „nicht nötig“ je eine Zeile dahinter). */
function anzeige(zeilen: AblaufZeile[]): Anzeige[] {
  const grenze = (z: AblaufZeile) => z.art === 'durchgang' && !!z.grenze;
  const letzte = zeilen.map(grenze).lastIndexOf(true);
  const offen = zeilen.filter((z) => grenze(z) && z.zustand === 'offen');
  const unnoetig = zeilen.filter((z) => grenze(z) && z.zustand === 'nicht-noetig');
  const name = (x: AblaufZeile | undefined) => (x?.art === 'durchgang' ? x.name : '');
  const aus: Anzeige[] = [];
  let gezeigt = 0;
  zeilen.forEach((z, i) => {
    const zeigen = !grenze(z) || z.zustand === 'erledigt' || z.zustand === 'laeuft' || (z.zustand === 'offen' && gezeigt++ < GRENZE_VORAUS);
    if (zeigen) aus.push({ art: 'zeile', z });
    if (i !== letzte) return;
    const rest = offen.slice(GRENZE_VORAUS);
    const bis = rest[rest.length - 1];
    if (bis?.art === 'durchgang') aus.push({ art: 'weiter', bis: bis.n, anzahl: rest.length });
    if (unnoetig.length) aus.push({ art: 'unnoetig', von: name(unnoetig[0]), bis: name(unnoetig[unnoetig.length - 1]) });
  });
  return aus;
}

function Schrittzeile({ z, stand, jetzt }: { z: Extract<AblaufZeile, { art: 'schritt' }>; stand: LasttestStand; jetzt: number }) {
  const d = zeilenDauer(z, jetzt);
  const demo = z.schritt === 'demo' && z.zustand === 'laeuft' ? stand.demo : null;
  return (
    <tr className="lasttest-zeile" data-zustand={z.zustand}>
      <td>
        <Zustand z={z.zustand} />
      </td>
      <td colSpan={3}>
        <span className="lasttest-was">{t.frei(`lasttest.schritt.${z.schritt}`)}</span>
        <span className="klein leise lasttest-wofuer">{t.frei(`lasttest.schritt.${z.schritt}.wofuer`)}</span>
      </td>
      <td>{d === null ? '–' : dauer(d)}</td>
      <td colSpan={5}>
        {demo && (
          <>
            <progress max={demo.gesamt || 1} value={demo.fertig} aria-label={t('lasttest.schritt.demo')} />
            <span className="klein leise">{t('lasttest.demo', { fertig: zahl(demo.fertig), gesamt: zahl(demo.gesamt) })}</span>
          </>
        )}
      </td>
    </tr>
  );
}

/** Ziel erreicht: ✓, ✗ (bei der Grenzsuche „Grenze“) oder „–“ ohne Ziel bzw. solange es offen ist. */
function Ziel({ z }: { z: Extract<AblaufZeile, { art: 'durchgang' }> }) {
  if (!z.ziel || z.erreicht === undefined) return <span className="leise">–</span>;
  return z.erreicht ? (
    <span className="lasttest-ziel" data-erreicht="ja">
      <Symbol name="haken" /> {t('lasttest.ziel.ja')}
    </span>
  ) : (
    <span className="lasttest-ziel" data-erreicht="nein">
      <Symbol name="schliessen" /> {t(z.grenze ? 'lasttest.ziel.grenze' : 'lasttest.ziel.nein')}
    </span>
  );
}

function Durchgangszeile({ z, stand, jetzt }: { z: Extract<AblaufZeile, { art: 'durchgang' }>; stand: LasttestStand; jetzt: number }) {
  const w = z.werte;
  const d = zeilenDauer(z, jetzt);
  const laeuft = z.zustand === 'laeuft';
  const rest = laeuft && stand.durchgang?.name === z.name ? Math.max(0, Math.round((stand.durchgang.ende - jetzt) / 1000)) : null;
  return (
    <tr className="lasttest-zeile" data-zustand={z.zustand}>
      <td>
        <Zustand z={z.zustand} />
      </td>
      <td>
        <span className="lasttest-was">{z.name}</span>
        <span className="klein leise lasttest-wofuer">{t.frei(`lasttest.modus.${z.modus}.wofuer`)}</span>
      </td>
      <td className="rechts">{zahl(z.n)}</td>
      <td>{t.frei(`lasttest.modus.${z.modus}`)}</td>
      <td>
        {laeuft && rest !== null ? (
          <>
            <progress max={z.dauerS || 1} value={Math.max(0, (z.dauerS || 0) - rest)} aria-label={z.name} />
            <span className="klein">{t('lasttest.noch', { dauer: dauer(rest) })}</span>
          </>
        ) : d !== null ? (
          dauer(d)
        ) : z.zustand !== 'offen' ? (
          '–'
        ) : (
          <span className="leise">{t('lasttest.geplant', { dauer: dauer(z.dauerS) })}</span>
        )}
      </td>
      <td className="rechts">{w?.jeSekunde == null ? '–' : zahl(w.jeSekunde)}</td>
      <td className="rechts">{w?.p50 == null ? '–' : `${zahl(w.p50)} ms`}</td>
      <td className="rechts">{w?.p95 == null ? '–' : `${zahl(w.p95)} ms`}</td>
      <td className="rechts">{w ? prozent(w.fehlerquote) : '–'}</td>
      <td>
        <Ziel z={z} />
      </td>
    </tr>
  );
}

/** „noch etwa …“, „etwa …“ bzw. „fertig nach …“ je Stufe – grob, aus den Erfahrungswerten im Handbuch. */
function stufenDauer(stufe: LasttestStufe, zeilen: AblaufZeile[], stand: LasttestStand, jetzt: number): string {
  const zustand = stufenZustand(zeilen);
  if (zustand === 'erledigt') {
    const { beginn, ende } = stufenZeit(zeilen);
    return beginn !== null && ende !== null ? t('lasttest.stufe.fertig-nach', { dauer: dauer(Math.round((ende - beginn) / 1000)) }) : '';
  }
  const [lo, hi] = dauerVon(stufe, stand.mappen);
  if (zustand === 'offen') return t('lasttest.stufe.etwa', { von: lo, bis: hi });
  const vergangen = (jetzt - (stufenZeit(zeilen).beginn ?? stand.stufeBegonnen)) / 60_000;
  const von = Math.max(1, Math.ceil(lo - vergangen));
  const bis = Math.max(von, Math.ceil(hi - vergangen));
  if (bis <= 1) return t('lasttest.rest.gleich');
  return von === bis ? t('lasttest.rest.eine', { bis }) : t('lasttest.stufe.noch-etwa', { von, bis });
}

export function Ablauf({ ablauf, stand, jetzt }: { ablauf: LasttestAblauf; stand: LasttestStand; jetzt: number }) {
  // Der laufende Durchgang steht nur in seiner Zeile (#1452): Fortschritt und „noch …“ in der Spalte Dauer.
  // Aufgeklappt (#1452): die Stufe, an der der Test gerade ist (bei nur einer Stufe immer) – beginnt eine neue, klappt die
  // fertige zu und die neue auf. Was man selbst umschaltet, bleibt so.
  const [gewaehlt, setGewaehlt] = useState<Partial<Record<LasttestStufe, boolean>>>({});
  const eine = ablauf.stufen.length === 1;
  const aktuell = stand.zustand === 'laeuft' ? ablauf.aktuell : -1;
  return (
    <section className="lasttest-ablauf" aria-labelledby="lasttest-ablauf">
      <h2 id="lasttest-ablauf">{t('lasttest.ablauf')}</h2>
      <p className="klein leise">{t('lasttest.ablauf.text')}</p>
      {ablauf.stufen.map(({ stufe, zeilen }, i) => {
        const zustand = stufenZustand(zeilen);
        const offen = gewaehlt[stufe] ?? (eine || (aktuell >= 0 ? i === aktuell : zustand === 'laeuft'));
        const id = `lasttest-ablauf-${stufe}`;
        return (
          <div key={stufe} className="lasttest-gruppe" data-zustand={zustand}>
            <Aufklapper offen={offen} steuert={id} umschalten={() => setGewaehlt({ ...gewaehlt, [stufe]: !offen })}>
              <span className="lasttest-gruppe-titel">
                <Zustand z={zustand} />
                <strong>{t('lasttest.stufe.gruppe', { stufe: t.frei(`lasttest.stufe.${stufe}`) })}</strong>
              </span>
              <span className="leise klein">{stufenDauer(stufe, zeilen, stand, jetzt)}</span>
            </Aufklapper>
            {offen && (
              // Rahmen mit eigenem Scrollen am Handy: per Tastatur erreichbar (axe scrollable-region-focusable).
              <div
                className="tabellenrahmen"
                id={id}
                tabIndex={0}
                role="group"
                aria-label={t('lasttest.stufe.gruppe', { stufe: t.frei(`lasttest.stufe.${stufe}`) })}>
                <table className="tabelle klein lasttest-tabelle">
                  <thead>
                    <tr>
                      <th>{t('lasttest.spalte.zustand')}</th>
                      <th>{t('lasttest.spalte.durchgang')}</th>
                      <th className="rechts">{t('lasttest.spalte.gleichzeitig')}</th>
                      <th>{t('lasttest.spalte.art')}</th>
                      <th>{t('lasttest.spalte.dauer')}</th>
                      <th className="rechts">{t('lasttest.spalte.je-sekunde')}</th>
                      <th className="rechts">p50</th>
                      <th className="rechts">p95</th>
                      <th className="rechts">{t('lasttest.spalte.fehler')}</th>
                      <th>{t('lasttest.spalte.ziel')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anzeige(zeilen).map((a, i) =>
                      a.art === 'zeile' ? (
                        a.z.art === 'schritt' ? (
                          <Schrittzeile key={i} z={a.z} stand={stand} jetzt={jetzt} />
                        ) : (
                          <Durchgangszeile key={i} z={a.z} stand={stand} jetzt={jetzt} />
                        )
                      ) : (
                        <tr key={i} className="lasttest-zeile" data-zustand={a.art === 'weiter' ? 'offen' : 'nicht-noetig'}>
                          <td>
                            <Zustand z={a.art === 'weiter' ? 'offen' : 'nicht-noetig'} />
                          </td>
                          <td colSpan={9} className="leise">
                            {a.art === 'weiter'
                              ? t('lasttest.grenze.weiter', { anzahl: a.anzahl, zahl: zahl(a.anzahl), bis: zahl(a.bis) })
                              : t('lasttest.grenze.unnoetig', { von: a.von, bis: a.bis })}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
