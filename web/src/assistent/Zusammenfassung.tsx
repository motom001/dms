import { useState, type ReactNode } from 'react';
import { BUNDESLAENDER } from '../../../shared/src/feiertage';
import { beruflichBei } from '../../../shared/src/einrichtungsplan';
import { VORLAGEN, vorlageFuer } from '../../../shared/src/werkbankansicht';
import { DARF_VORGABE } from '../../../shared/src/darf';
import { Knopf } from '../bausteine';
import { t } from '../sprache';
import { ausfuehren, neuerLauf } from './ausfuehren';
import { pruefeAlles, speichereDatei } from './datei';
import { Navigation, useSenden, zurueckVon } from './ablauf';
import { NR, Rahmen, REIHE, SCHRITTE, type Leiste } from './rahmen';
import { geheim, setzeSammlung, setzeStand, type Ansicht, type Sammlung } from './stand';

/** Zusammenfassung vor „Jetzt einrichten“ (#1279 aus Schritte.tsx gezogen). */

function Abschnitt({ titel, ziel, probleme, children }: { titel: string; ziel: Ansicht; probleme?: string[]; children: ReactNode }) {
  return (
    <section className={`blatt zf-abschnitt${probleme?.length ? ' mitfehler' : ''}`} aria-label={titel}>
      <div className="zf-kopf">
        <h2 className="h3">{titel}</h2>
        <Knopf onClick={() => setzeSammlung((s) => ({ ...s, ansicht: ziel, zurZusammenfassung: true }))}>
          {t('einrichtung.zf.aendern')}
          <span className="sr"> – {titel}</span>
        </Knopf>
      </div>
      <div className="zf-inhalt">{children}</div>
      {probleme?.length ? (
        <ul className="fehlertext klein">
          {probleme.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function Zusammenfassung({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  const x = useSenden();
  const [gespeichert, setGespeichert] = useState(false);
  const p = s.probleme;
  const offen = REIHE.filter((a) => a !== 'zusammenfassung' && !s.besucht.includes(a));
  const keineProbleme = !Object.values(p).some((l) => l?.length) && !offen.length;
  return (
    <Rahmen aktiv={NR.zusammenfassung} titel={t('einrichtung.zf.titel')} unter={t('einrichtung.zf.unter')} leiste={leiste}>
      {offen.length > 0 && (
        <div className="hinweis info">
          <p>{t('einrichtung.zf.offen', { schritte: offen.map((a) => SCHRITTE[NR[a]]).join(', ') })}</p>
        </div>
      )}
      <div className="stapel">
        <Abschnitt titel={t('einrichtung.zf.ablage')} ziel="ablage" probleme={p.ablage}>
          <p>{s.ablage || <span className="leise">{t('einrichtung.zf.fehlt')}</span>}</p>
        </Abschnitt>
        <Abschnitt titel={t('einrichtung.zf.konto')} ziel="konto" probleme={p.konto}>
          <p>{[s.konto.name, s.konto.email].filter(Boolean).join(' · ') || <span className="leise">{t('einrichtung.zf.fehlt')}</span>}</p>
          <p className="leise klein">
            {geheim.konto ? t('einrichtung.zf.passwort.gesetzt') : t('einrichtung.zf.passwort.fehlt')} · {t('einrichtung.zf.konto.recht')}
          </p>
        </Abschnitt>
        <Abschnitt titel={t('einrichtung.zf.nutzung')} ziel="nutzung" probleme={p.nutzung}>
          <ZfNutzung s={s} />
        </Abschnitt>
        <Abschnitt titel={t('einrichtung.zf.darf')} ziel="darf" probleme={p.darf}>
          <ZfDarf s={s} />
        </Abschnitt>
        <Abschnitt titel={t('einrichtung.zf.pakete')} ziel="pakete" probleme={p.pakete}>
          <ZfPakete s={s} />
        </Abschnitt>
        <Abschnitt titel={t('einrichtung.zf.optional')} ziel="optional" probleme={p.optional}>
          <ZfOptional s={s} />
        </Abschnitt>
        <div className="hinweis info">
          <p>{t('einrichtung.zf.schluessel')}</p>
        </div>
      </div>
      <ZfDatei x={x} gespeichert={gespeichert} setGespeichert={setGespeichert} />
      <Navigation
        sendet={x.sendet}
        fehler={x.fehler}
        zurueck={() => zurueckVon('zusammenfassung', zurWahl)}
        weiterText={t('einrichtung.zf.los')}
        kannWeiter={!offen.length}
        weiter={() =>
          void x.los(async () => {
            const probleme = await pruefeAlles();
            if (Object.values(probleme).some((l) => l?.length)) return;
            setzeStand((a) => ({ ...a, lauf: neuerLauf() }));
            void ausfuehren();
          })
        }
      />
      {!keineProbleme && !offen.length && <p className="leise klein">{t('einrichtung.zf.erst')}</p>}
    </Rahmen>
  );
}

function ZfNutzung({ s }: { s: Sammlung }) {
  return s.nutzung ? (
    <>
      <p>{t(`einrichtung.nutzung.${s.nutzung}`)}</p>
      <p className="leise klein">
        {t('einrichtung.nutzung.vorlage', {
          vorlage: VORLAGEN[s.werkbank ?? vorlageFuer({ beruflich: beruflichBei(s.nutzung) })].name,
        })}
      </p>
      {beruflichBei(s.nutzung) && (
        <p>
          {t('einrichtung.zf.organisation')}:{' '}
          {s.organisation ? (
            [
              s.organisation.name,
              [s.organisation.strasse, s.organisation.hausnummer].filter(Boolean).join(' '),
              [s.organisation.plz, s.organisation.ort].filter(Boolean).join(' '),
              s.organisation.email,
              s.organisation.telefon,
            ]
              .filter(Boolean)
              .join(' · ')
          ) : (
            <span className="leise">{t('einrichtung.zf.organisation.keine')}</span>
          )}
        </p>
      )}
    </>
  ) : (
    <p className="leise">{t('einrichtung.zf.fehlt')}</p>
  );
}

/** Was Ablago darf (#1566): beide Antworten als die zwei Sätze der Werkbank-Karte. */
function ZfDarf({ s }: { s: Sammlung }) {
  const d = { ...DARF_VORGABE, ...s.darf };
  return (
    <p>
      {t.frei(`werkbank.darf.pakete.${d.pakete}.satz`)} {t.frei(`werkbank.darf.selbst.${d.selbst}.satz`)}
    </p>
  );
}

function ZfPakete({ s }: { s: Sammlung }) {
  const autoAn = s.pakete?.pakete.reduce((n, q) => n + Object.values(q.automatisierungen).filter(Boolean).length, 0) ?? 0;
  return s.pakete?.pakete.length ? (
    <>
      <p>
        {s.pakete.pakete.map((q) => q.name).join(', ')}
        {autoAn ? ` (${t('einrichtung.zf.pakete.automatisierungen', { anzahl: autoAn })})` : ''}
      </p>
      {s.paketeAuswahl === 'ablago' && <p className="leise klein">{t('einrichtung.zf.pakete.ablago')}</p>}
    </>
  ) : s.paketeVorgabe?.length ? (
    <p>
      {s.paketeVorgabe.map((q) => q.id).join(', ')} <span className="leise">– {t('einrichtung.zf.pakete.vorgabe')}</span>
    </p>
  ) : (
    <p className="leise">{t('einrichtung.zf.pakete.keine')}</p>
  );
}

function ZfOptional({ s }: { s: Sammlung }) {
  const m = s.optional.mail;
  return (
    <dl className="eigenschaften klein">
      <dt>{t('einrichtung.optional.adresse')}</dt>
      <dd>{s.optional.adresse.trim() || <span className="leise">{t('einrichtung.zf.adresse.keine')}</span>}</dd>
      <dt>{t('einrichtung.optional.bundesland')}</dt>
      <dd>
        {s.optional.bundesland ? (
          BUNDESLAENDER[s.optional.bundesland as keyof typeof BUNDESLAENDER]
        ) : (
          <span className="leise">{t('einrichtung.optional.bundesland.keins')}</span>
        )}
      </dd>
      <dt>{t('einrichtung.optional.beispiele.titel')}</dt>
      <dd>{s.optional.beispielablage ? t('einrichtung.zf.beispielablage') : t('einrichtung.zf.nein')}</dd>
      <dt>{t('einrichtung.optional.notfall.titel')}</dt>
      <dd>
        {s.optional.notfallkontakte?.length ? (
          s.optional.notfallkontakte.map((k) => `${k.name} (${k.email})`).join(', ')
        ) : (
          <span className="leise">{t('einrichtung.zf.notfall.keine')}</span>
        )}
      </dd>
      <dt>{t('einrichtung.optional.mail')}</dt>
      <dd>
        {m ? (
          `${m.host}:${m.port}${m.benutzer ? ` · ${m.benutzer}` : ''} · ${m.mitPasswort && geheim.mail ? t('einrichtung.zf.passwort.gesetzt') : t('einrichtung.zf.mail.ohne')}${m.aktiv ? '' : ` · ${t('einrichtung.zf.mail.aus')}`}`
        ) : (
          <span className="leise">{t('einrichtung.zf.mail.keine')}</span>
        )}
      </dd>
    </dl>
  );
}

/** Konfigurationsdatei speichern (#806) – Senden und Fehler teilt sie mit „Jetzt einrichten“. */
function ZfDatei({
  x,
  gespeichert,
  setGespeichert,
}: {
  x: ReturnType<typeof useSenden>;
  gespeichert: boolean;
  setGespeichert: (g: boolean) => void;
}) {
  return (
    <section className="blatt stapel" aria-label={t('einrichtung.zf.datei')}>
      <h2 className="h3">{t('einrichtung.zf.datei')}</h2>
      <p className="leise klein">{t('einrichtung.zf.datei.text')}</p>
      <div>
        <Knopf
          symbol="herunterladen"
          onClick={() =>
            x.los(async () => {
              await speichereDatei();
              setGespeichert(true);
            })
          }>
          {t('einrichtung.zf.datei.knopf')}
        </Knopf>
      </div>
      {gespeichert && (
        <p className="gutertext klein" role="status">
          {t('einrichtung.zf.datei.fertig')}
        </p>
      )}
    </section>
  );
}
