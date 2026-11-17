import { useRef, useState } from 'react';
import { BUNDESLAENDER } from '../../../shared/src/feiertage';
import { PAKETE_JE_NUTZUNG } from '../../../shared/src/einrichtungsplan';
import { erreichbar, NOTFALLKONTAKTE_MAX, pruefeNotfallkontakt, type NotfallkontaktEingabe } from '../../../shared/src/notfallkontakte';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { einrichtungApi } from '../api/einrichtung';
import { t } from '../sprache';
import { PaketApiKontext, type PaketApi, type PaketWahl } from '../werkbank/PaketAblauf';
import { PaketeDazuholen, VORAUSWAHL } from '../werkbank/PaketeDazuholen';
import { MailSammeln, type MailGriff } from '../werkbank/MailVersand';
import { eingabeFehler, KontaktFormular, leererKontakt } from '../werkbank/NotfallkontaktFormular';
import { Navigation, Probleme, pruefeSchritt, useSenden, weiterVon, zurueckVon } from './ablauf';
import { NR, Rahmen, type Leiste } from './rahmen';
import { geheim, setzeSammlung, type MailSammlung, type Sammlung } from './stand';

/** Schritte „Pakete dazuholen“ und „Optionales“ mit Notfallkontakten (#1279 aus Schritte.tsx gezogen). */

/** Im Assistenten wählt man Pakete über die Schnittstellen mit Einrichtungscode – installiert wird noch nichts. */
const EINRICHTUNG_PAKETE: PaketApi = {
  stand: () => einrichtungApi.einrichtungPakete(),
  katalog: () => einrichtungApi.einrichtungPaketKatalog(),
  plan: (e) => einrichtungApi.einrichtungPaketPlan(e),
};

export function PaketeSchritt({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  // Vorbelegt beim „Ändern“ bzw. aus der Datei (#806): Auswahl, Beispiele, ausgeschaltete Automatisierungen.
  const quelle = s.pakete
    ? s.pakete.pakete.map((p) => ({ id: p.id, beispiele: p.beispiele, automatisierungen: p.automatisierungen, gewaehlt: p.gewaehlt }))
    : (s.paketeVorgabe?.map((p) => ({ ...p, gewaehlt: true })) ?? null);
  const start = quelle?.filter((p) => p.gewaehlt).map((p) => p.id);
  const vorgabe = quelle
    ? {
        beispiele: quelle.filter((p) => p.beispiele).map((p) => p.id),
        automatisierungenAus: quelle.flatMap((p) =>
          Object.entries(p.automatisierungen)
            .filter(([, an]) => !an)
            .map(([k]) => `${p.id}|${k}`),
        ),
        automatisierungenAn: quelle.flatMap((p) =>
          Object.entries(p.automatisierungen)
            .filter(([, an]) => an)
            .map(([k]) => `${p.id}|${k}`),
        ),
      }
    : undefined;
  // Vorschlag nach der Antwort auf „Wofür nutzt du Ablago?“ (#1045), dazu die bisherige Empfehlung; nur was es im Katalog gibt.
  const empfohlen = s.nutzung ? [...new Set([...PAKETE_JE_NUTZUNG[s.nutzung], ...VORAUSWAHL])] : VORAUSWAHL;
  const gesammelt = (w: PaketWahl | null) => {
    geheim.paketEinstellungen = w?.eingabe.einstellungen;
    setzeSammlung((x) => ({ ...x, pakete: w, paketeVorgabe: null }));
    weiterVon('pakete');
  };
  return (
    <Rahmen aktiv={NR.pakete} titel={t('einrichtung.pakete.titel')} leiste={leiste} unter={t('einrichtung.pakete.unter')}>
      <Probleme liste={s.probleme.pakete} />
      <p className="leise klein">{t('einrichtung.pakete.erst')}</p>
      {s.organisation && (
        <div className="hinweis info">
          <p>{t('einrichtung.pakete.basis', { name: s.organisation.name })}</p>
        </div>
      )}
      <PaketApiKontext.Provider value={EINRICHTUNG_PAKETE}>
        <PaketeDazuholen
          key={JSON.stringify(start ?? null)}
          start={start}
          vorgabe={vorgabe}
          empfohlen={empfohlen}
          sammeln={gesammelt}
          zurueck={() => zurueckVon('pakete', zurWahl)}
          ueberspringen={() => gesammelt(null)}
          weiter={() => {}}
        />
      </PaketApiKontext.Provider>
    </Rahmen>
  );
}

const neueMail = (): MailSammlung => ({
  aktiv: true,
  host: '',
  port: 587,
  verbindung: 'starttls',
  benutzer: '',
  absender: '',
  selbstsigniert: false,
  mitPasswort: false,
});

/**
 * Notfallkontakte im Schritt „Optionales“ (#812): nur gesammelt; angelegt werden sie bei „Jetzt einrichten“ mit dem
 * Zugang des Assistenten (erstes Konto). Dasselbe Formular wie in Werkbank → Verschlüsselung.
 */
function NotfallSammeln({ liste, setze }: { liste: NotfallkontaktEingabe[]; setze: (l: NotfallkontaktEingabe[]) => void }) {
  const [neu, setNeu] = useState<NotfallkontaktEingabe | null>(null);
  const [fehler, setFehler] = useState<string[]>();
  return (
    <section className="blatt stapel" id="notfallkontakte">
      <h2 className="h3">{t('einrichtung.optional.notfall.titel')}</h2>
      <p className="leise klein">{t('einrichtung.optional.notfall.text')}</p>
      {liste.length > 0 && (
        <ul className="liste-einfach">
          {liste.map((k, i) => (
            <li key={`${k.email}-${i}`}>
              <strong>{k.name}</strong> <span>{erreichbar(k)}</span>
              {k.notiz && <span className="leise"> – {k.notiz}</span>}{' '}
              <Knopf
                art="gefahr"
                symbol="geloescht"
                onClick={() => setze(liste.filter((_, j) => j !== i))}
                rueckfrage={{
                  titel: t('einrichtung.optional.notfall.entfernen.frage', { name: k.name }),
                  ja: t('einrichtung.optional.notfall.entfernen'),
                }}>
                {t('einrichtung.optional.notfall.entfernen')}
              </Knopf>
            </li>
          ))}
        </ul>
      )}
      {neu ? (
        <>
          <KontaktFormular wert={neu} setze={setNeu} fehler={fehler} />
          <div className="knoepfe">
            <Knopf
              art="haupt"
              onClick={() => {
                const f = eingabeFehler(neu);
                setFehler(f);
                if (f.length) return;
                setze([...liste, pruefeNotfallkontakt(neu).wert]);
                setNeu(null);
              }}>
              {t('einrichtung.optional.notfall.uebernehmen')}
            </Knopf>
            <Knopf
              onClick={() => {
                setNeu(null);
                setFehler(undefined);
              }}>
              {t('werkbank.notfallkontakte.abbrechen')}
            </Knopf>
          </div>
        </>
      ) : (
        <div className="knoepfe">
          <Knopf
            art="anlegen"
            groesse="klein"
            gesperrt={liste.length >= NOTFALLKONTAKTE_MAX ? t('werkbank.notfallkontakte.max', { max: NOTFALLKONTAKTE_MAX }) : false}
            onClick={() => {
              setFehler(undefined);
              setNeu(leererKontakt());
            }}>
            {t('werkbank.notfallkontakte.neu')}
          </Knopf>
        </div>
      )}
    </section>
  );
}

export function OptionalSchritt({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  const [o, setO] = useState(s.optional);
  const [probleme, setProbleme] = useState<string[] | undefined>(s.probleme.optional);
  const x = useSenden();
  // E-Mail-Versand mit demselben Formular wie in der Werkbank (#813); es sammelt nur, gespeichert wird bei „Jetzt einrichten“.
  const mail = useRef<MailGriff | null>(null);
  const vorschlag = typeof location !== 'undefined' ? location.origin : '';
  const mitTypen = (s.pakete?.neueTypen ?? 0) > 0;
  const m = o.mail;
  const merke = () => {
    // Passwort nur im Speicher (geheim), im Sammelstand (sessionStorage) steht nur, ob eines eingegeben ist.
    const g = m ? mail.current?.sammle() : undefined;
    const { passwort, ...angaben } = g ?? { passwort: geheim.mail };
    geheim.mail = m ? passwort : '';
    setzeSammlung((a) => ({
      ...a,
      optional: { ...o, beispiele: o.beispiele && !mitTypen, mail: m ? { ...m, ...angaben, mitPasswort: !!passwort } : null },
    }));
  };
  return (
    <Rahmen aktiv={NR.optional} titel={t('einrichtung.schritt.optional')} leiste={leiste} unter={t('einrichtung.optional.unter')}>
      <form className="stapel" onSubmit={(e) => e.preventDefault()}>
        <Probleme liste={probleme} />
        <section className="blatt">
          <h2 className="h3">{t('einrichtung.optional.adresse.titel')}</h2>
          <p className="leise klein">{t('einrichtung.optional.adresse.text')}</p>
          <Feld
            beschriftung={t('einrichtung.optional.adresse')}
            kopfZusatz={o.adresse && o.adresse === vorschlag && <small className="chip">{t('einrichtung.vorgeschlagen')}</small>}
            hinweis={o.adresse ? t('einrichtung.optional.adresse.hinweis') : t('einrichtung.optional.adresse.leer')}>
            <input
              value={o.adresse}
              onChange={(e) => setO({ ...o, adresse: e.target.value })}
              inputMode="url"
              autoComplete="off"
              placeholder={t('einrichtung.optional.adresse.beispiel')}
            />
          </Feld>
        </section>
        <section className="blatt">
          <h2 className="h3">{t('einrichtung.optional.region')}</h2>
          <p className="leise klein">{t('einrichtung.optional.region.text')}</p>
          <Feld beschriftung={t('einrichtung.optional.bundesland')}>
            <select value={o.bundesland} onChange={(e) => setO({ ...o, bundesland: e.target.value })}>
              <option value="">{t('einrichtung.optional.bundesland.keins')}</option>
              {Object.entries(BUNDESLAENDER).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Feld>
        </section>
        <section className="blatt">
          <h2 className="h3">{t('einrichtung.optional.beispiele.titel')}</h2>
          <p className="leise klein">{t('einrichtung.optional.beispiele.text')}</p>
          <HakenFeld beschriftung={t('einrichtung.optional.beispiele')} hinweis={mitTypen && t('einrichtung.optional.beispiele.pakete')}>
            <input
              type="checkbox"
              checked={o.beispiele && !mitTypen}
              disabled={mitTypen}
              onChange={(e) => setO({ ...o, beispiele: e.target.checked })}
            />
          </HakenFeld>
          {/* „Erst mal umsehen“ (#988): Beispiel-Ablage aus den Beispielen der gewählten Pakete. */}
          {mitTypen && (
            <HakenFeld beschriftung={t('einrichtung.optional.beispielablage')} hinweis={t('einrichtung.optional.beispielablage.hinweis')}>
              <input type="checkbox" checked={!!o.beispielablage} onChange={(e) => setO({ ...o, beispielablage: e.target.checked })} />
            </HakenFeld>
          )}
        </section>
        <section className="blatt" id="mail">
          <h2 className="h3">{t('einrichtung.optional.mail')}</h2>
          <p className="leise klein">{t('einrichtung.optional.mail.text')}</p>
          <HakenFeld beschriftung={t('einrichtung.optional.mail.an')}>
            <input type="checkbox" checked={!!m} onChange={(e) => setO({ ...o, mail: e.target.checked ? neueMail() : null })} />
          </HakenFeld>
          {m && (
            <>
              <MailSammeln wert={m} passwort={geheim.mail} email={s.konto.email.trim()} ablage={s.ablage} griff={mail} />
              <p className="leise klein">
                {s.verweise.mail
                  ? t('einrichtung.optional.mail.verweis', { verweis: s.verweise.mail })
                  : t('einrichtung.optional.mail.passwort')}
              </p>
              <p className="leise klein">{t('einrichtung.optional.mail.testen')}</p>
            </>
          )}
        </section>
        <NotfallSammeln liste={o.notfallkontakte ?? []} setze={(l) => setO({ ...o, notfallkontakte: l })} />
        <Navigation
          sendet={x.sendet}
          fehler={x.fehler}
          zurueck={() => {
            merke();
            zurueckVon('optional', zurWahl);
          }}
          weiter={() =>
            void x.los(async () => {
              merke();
              const p = await pruefeSchritt('optional');
              setProbleme(p);
              if (!p.length) weiterVon('optional');
            })
          }
        />
      </form>
    </Rahmen>
  );
}
