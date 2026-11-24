import { useState } from 'react';
import { betriebApi, type SicherungStand } from '../../api/betrieb';
import type { SicherungsMeta } from '../../api/einrichtung';
import { t, tn } from '../../sprache';
import { Link } from '../../ort';
import { Feld, Knopf, KnopfLink } from '../../bausteine';
import { Kopf } from '../Kopf';
import { bytes, sicherungText, zeit } from '../sicherungFormat';
import { WOZU_MAX } from '../SicherungWozu';
import { SicherungListe } from '../SicherungListe';
import { useVerwaltetVerschluesselung, type SicherungZustand } from './zustand';
import { sicherungsHinweise, type SicherungsHinweis } from './hinweise';
import { AusserHaus, Speicherort, Speicherplatz, StandZeile } from './Abschnitte';
import { Zeitplan } from './Zeitplan';
import { Probe } from './Probe';

type Meldung = { art: 'gut' | 'schlecht'; text: string };

export function SicherungPanel({ z }: { z: SicherungZustand }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const mitNotfallblatt = useVerwaltetVerschluesselung();
  const s = z.stand;
  if (z.fehler)
    return (
      <div className="hinweis schlecht">
        <p>{z.fehler}</p>
      </div>
    );
  if (!s) return <p className="leise">{t('werkbank.sicherung.lade')}</p>;
  const laeuft = s.lauf?.status === 'laeuft';
  // #1509 (C9): Scheitert die erste Sicherung, steht die Ursache hier am Stand – der rote Hinweis nur in der Übersicht.
  // Der nächste Schritt „Kopie außer Haus“ steht hier im Abschnitt „Außer Haus“, nur in der Übersicht als Hinweis.
  const hinweise = sicherungsHinweise(s.zustand, mitNotfallblatt).filter(
    (h) => h.schluessel !== 'sicherung.erste-fehler' && h.schluessel !== 'sicherung.ausser-haus',
  );
  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try {
      await f();
      await z.laden();
      if (gut) setMeldung({ art: 'gut', text: gut });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.sicherung.sicherung')} ueber={t('werkbank.sicherung.werkbank')} hilfe="werkbank.sicherung">
        <p className="leise">
          {tn('werkbank.sicherung.eine-sicherung-enthaelt-die', {
            link: (
              <Link to="/werkbank/verschluesselung" className="verweis">
                {t('werkbank.sicherung.verschluesselung')}
              </Link>
            ),
          })}
        </p>
      </Kopf>

      {hinweisListe(s, hinweise)}

      <JetztSichern s={s} meldung={meldung} tu={tu} />

      <SicherungListe s={s} laeuft={laeuft} laden={z.laden} />

      {s.zustand.probe && (
        <Probe
          stand={s.zustand.probe}
          lauf={s.probe ?? null}
          sicherungen={s.liste.some((x) => x.meta)}
          gesperrt={laeuft}
          neuLaden={() => void z.laden()}
        />
      )}

      <Zeitplan
        key={JSON.stringify(s.plan)}
        plan={s.plan}
        nurNeuesteMoeglich={!!s.zustand.nurNeueste?.moeglich}
        groesseJe={s.speicher.dateienBytes + s.speicher.datenbankBytes}
        notfallblatt={s.zustand.notfallblatt.aktuell}
        mitNotfallblatt={mitNotfallblatt}
        gespeichert={() => void z.laden()}
      />

      <Speicherplatz s={s} />

      <Speicherort s={s} />

      <AusserHaus x={s.zustand.extern} />
    </div>
  );
}

/** Ohne Schlüssel keine Sicherung; darunter die Hinweise zur Sicherung (wie in der Übersicht). */
function hinweisListe(s: SicherungStand, hinweise: SicherungsHinweis[]) {
  return (
    <>
      {!s.zustand.schluessel && (
        <div className="hinweis warn">
          <p>
            {tn('werkbank.sicherung.erzeuge-ihn-zuerst-unter', {
              b: <strong>{t('werkbank.sicherung.ohne-schluessel-keine-sicherung')}</strong>,
            })}
          </p>
          <KnopfLink to="/werkbank/verschluesselung" groesse="klein">
            {t('werkbank.sicherung.zur-verschluesselung')}
          </KnopfLink>
        </div>
      )}
      {hinweise.map((h, i) => (
        <div key={i} className={`hinweis ${h.art === 'info' ? 'info' : h.art}`}>
          <p>{h.text}</p>
          {h.ziel && (
            <KnopfLink to={h.ziel} groesse="klein">
              {h.knopf}
            </KnopfLink>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * „Jetzt sichern“: Stand in einer Zeile, Fortschritt oder Knopf, Ergebnis darunter (#986). Dazu „Wozu?“ (#1529,
 * freiwillig); die Meldung nach dem Ende nennt die Sicherung, die gerade fertig wurde (#1531).
 */
function JetztSichern({
  s,
  meldung,
  tu,
}: {
  s: SicherungStand;
  meldung: Meldung | undefined;
  tu: (f: () => Promise<unknown>, gut?: string) => Promise<void>;
}) {
  const [wozu, setWozu] = useState('');
  const lauf = s.lauf;
  const laeuft = lauf?.status === 'laeuft';
  const ergebnis = lauf?.art === 'sicherung' ? (lauf.ergebnis as SicherungsMeta | undefined) : undefined;
  return (
    <section className="blatt" id="jetzt">
      <h2 className="h3">{t('werkbank.sicherung.jetzt-sichern')}</h2>
      <StandZeile s={s} />
      {laeuft ? (
        <div className="stapel">
          <p>
            <strong>{lauf!.titel}</strong> – {lauf!.schritt}
          </p>
          <progress max={Math.max(lauf!.gesamt, lauf!.bytes, 1)} value={lauf!.bytes} />
          <p className="leise klein">
            {t('werkbank.sicherung.seit-du-kannst-die', {
              bytes: bytes(lauf!.bytes),
              wert: lauf!.gesamt ? t('werkbank.sicherung.von-etwa', { bytes: bytes(lauf!.gesamt) }) : '',
              zeit: zeit(lauf!.gestartet),
            })}
          </p>
        </div>
      ) : (
        <>
          <p className="leise">{t('werkbank.sicherung.ablago-laeuft-dabei-weiter')}</p>
          <Feld beschriftung={t('werkbank.sicherung.wozu')} optional hinweis={t('werkbank.sicherung.wozu.hinweis')}>
            <input value={wozu} maxLength={WOZU_MAX} onChange={(e) => setWozu(e.target.value)} />
          </Feld>
          <div className="knoepfe">
            <Knopf
              art="haupt"
              gesperrt={!s.zustand.schluessel}
              onClick={() =>
                tu(async () => {
                  await betriebApi.sicherungJetzt(wozu.trim() || undefined);
                  setWozu('');
                })
              }>
              {t('werkbank.sicherung.jetzt-sichern')}
            </Knopf>
          </div>
          {/* Ergebnis unter dem Knopf (#986). */}
          {lauf?.status === 'fehler' && (
            <p className="fehlertext" role="alert">
              {tn('werkbank.sicherung.fehlgeschlagen-2', { titel: lauf.titel, fehler: lauf.fehler })}
            </p>
          )}
          {lauf?.status === 'fertig' && (lauf.art === 'sicherung' || lauf.art === 'holen') && (
            <p className="gutertext" role="status">
              {ergebnis?.beginn
                ? t('werkbank.sicherung.fertig-mit', {
                    titel: lauf.titel,
                    wert: lauf.beendet ? zeit(lauf.beendet) : '',
                    sicherung: sicherungText(ergebnis),
                  })
                : t('werkbank.sicherung.fertig', { titel: lauf.titel, wert: lauf.beendet ? zeit(lauf.beendet) : '' })}
            </p>
          )}
        </>
      )}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </section>
  );
}
