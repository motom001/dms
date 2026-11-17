import { useState } from 'react';
import { PASSWORT_MINDESTLAENGE } from '../../../shared/src/model';
import { beruflichBei, leereOrganisation, NUTZUNGEN, type Nutzung } from '../../../shared/src/einrichtungsplan';
import { STUFEN as WERKBANK_STUFEN, VORLAGEN, vorlageFuer, type Vorlage } from '../../../shared/src/werkbankansicht';
import { Feld, FeldGruppe } from '../bausteine';
import { t } from '../sprache';
import { Navigation, Probleme, pruefeSchritt, useSenden, weiterVon, zurueckVon } from './ablauf';
import { OrganisationFelder } from './Organisation';
import { NR, Rahmen, type Leiste } from './rahmen';
import { geheim, setzeSammlung, type Sammlung } from './stand';

/** Schritte „Ablage“, „Dein Konto“ und „Wofür nutzt du Ablago?“ (#1279 aus Schritte.tsx gezogen). */

export function AblageSchritt({
  s,
  zurWahl,
  leiste,
  datei,
}: {
  s: Sammlung;
  zurWahl: () => void;
  leiste: Leiste;
  datei?: { imEinrichtungsmodus?: boolean };
}) {
  const [name, setName] = useState(s.ablage);
  return (
    <Rahmen aktiv={NR.ablage} titel={t('einrichtung.ablage.titel')} unter={t('einrichtung.ablage.unter')} leiste={leiste} datei={datei}>
      <form className="stapel" onSubmit={(e) => e.preventDefault()}>
        {s.hinweise.length > 0 && (
          <div className="hinweis info">
            <ul>
              {s.hinweise.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        <Probleme liste={s.probleme.ablage} />
        <Feld
          beschriftung={t('einrichtung.ablage.name')}
          hinweis={[t('einrichtung.ablage.name.beispiel'), t('einrichtung.ablage.hinweis')]}>
          <input value={name} onChange={(x) => setName(x.target.value)} maxLength={30} autoFocus required />
        </Feld>
        <Navigation
          zurueck={() => {
            setzeSammlung((x) => ({ ...x, ablage: name }));
            zurueckVon('ablage', zurWahl);
          }}
          kannWeiter={!!name.trim()}
          weiter={() => {
            setzeSammlung((x) => ({ ...x, ablage: name.replace(/\s+/g, ' ').trim() }));
            weiterVon('ablage');
          }}
        />
      </form>
    </Rahmen>
  );
}

/**
 * „Dein Konto“ (#821): Name, E-Mail und Passwort der Person, die einrichtet – direkt gesetzt, kein Einladungslink. Sie
 * bekommt „Gesamte Verwaltung“ und arbeitet im Alltag trotzdem ohne Verwaltungsrechte. Zwei-Faktor bietet der Assistent
 * nach „Jetzt einrichten“ an (dann gibt es das Konto).
 */
export function KontoSchritt({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  const [name, setName] = useState(s.konto.name);
  const [email, setEmail] = useState(s.konto.email);
  const [pw, setPw] = useState(geheim.konto);
  const [pw2, setPw2] = useState(geheim.konto);
  const [probleme, setProbleme] = useState<string[] | undefined>(s.probleme.konto);
  const x = useSenden();
  const merke = () => setzeSammlung((a) => ({ ...a, konto: { name: name.trim(), email: email.trim() } }));
  return (
    <Rahmen aktiv={NR.konto} titel={t('einrichtung.konto.titel')} leiste={leiste} unter={t('einrichtung.konto.unter')}>
      <form className="stapel" onSubmit={(e) => e.preventDefault()}>
        <Probleme liste={probleme} />
        {s.verweise.konto && <p className="leise klein">{t('einrichtung.konto.verweis', { verweis: s.verweise.konto })}</p>}
        <Feld beschriftung={t('einrichtung.konto.name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder={t('einrichtung.konto.name.beispiel')}
            autoFocus
          />
        </Feld>
        <Feld beschriftung={t('einrichtung.konto.email')} hinweis={t('einrichtung.konto.email.hilfe')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Feld>
        <Feld
          beschriftung={t('einrichtung.konto.passwort')}
          hinweis={t('einrichtung.konto.passwort.hilfe', { anzahl: PASSWORT_MINDESTLAENGE })}>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
        </Feld>
        <Feld beschriftung={t('einrichtung.konto.passwort2')}>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
        </Feld>
        <div className="hinweis info">
          <p>{t('einrichtung.konto.alltag')}</p>
        </div>
        <p className="leise klein">{t('einrichtung.konto.zweifaktor')}</p>
        <p className="leise klein">{t('einrichtung.konto.erst')}</p>
        <Navigation
          sendet={x.sendet}
          fehler={x.fehler}
          zurueck={() => {
            merke();
            zurueckVon('konto', zurWahl);
          }}
          weiter={() =>
            void x.los(async () => {
              if (pw !== pw2) throw new Error(t('einrichtung.konto.passwort.ungleich'));
              merke();
              const p = await pruefeSchritt('konto', pw);
              setProbleme(p);
              if (p.length) return;
              geheim.konto = pw;
              weiterVon('konto');
            })
          }
        />
      </form>
    </Rahmen>
  );
}

/**
 * „Wofür nutzt du Ablago?“ (#1045): privat, beruflich oder beides – in Lenas Worten (Hinweis Qualität). Beruflich und
 * beides setzen das Merkmal „beruflich genutzt“ (#1032) und fragen nach der eigenen Organisation (#995); die Antwort
 * wählt im nächsten Schritt Pakete vor. Ohne Antwort geht es nicht weiter – es gibt keine versteckte Vorgabe (#803);
 * eine ältere Datei mit `beruflich: true` schlägt „Beides“ sichtbar vor.
 */
export function NutzungSchritt({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  const [wahl, setWahl] = useState<Nutzung | null>(s.nutzung ?? (s.optional.beruflich ? 'beides' : null));
  const [org, setOrg] = useState(s.organisation ?? leereOrganisation());
  // Stufe der Werkbank (#987): ohne eigene Wahl die Vorgabe zur Nutzung – privat Einsteiger, beruflich Selbständig.
  const [stufe, setStufe] = useState<Vorlage | null>(s.werkbank ?? null);
  const [probleme, setProbleme] = useState<string[] | undefined>(s.probleme.nutzung);
  const x = useSenden();
  const beruflich = !!wahl && beruflichBei(wahl);
  // Leer gelassen heißt: keine Organisation (später in der Ablage). Nur der Name ist Pflicht, sobald etwas dasteht.
  const mitOrg = beruflich && Object.values(org).some((v) => v.trim());
  const merke = () =>
    setzeSammlung((a) => ({
      ...a,
      nutzung: wahl,
      organisation: mitOrg ? org : null,
      werkbank: stufe ?? undefined,
      optional: { ...a.optional, beruflich: beruflich || undefined },
    }));
  const gewaehlt = stufe ?? vorlageFuer({ beruflich });
  const namensfehler = probleme?.find((p) => p === t('einrichtung.plan.organisation.name'));
  return (
    <Rahmen aktiv={NR.nutzung} titel={t('einrichtung.nutzung.titel')} unter={t('einrichtung.nutzung.unter')} leiste={leiste}>
      <form className="stapel" onSubmit={(e) => e.preventDefault()}>
        <Probleme liste={probleme?.filter((p) => p !== namensfehler)} />
        <FeldGruppe beschriftung={t('einrichtung.nutzung.frage')} hinweis={t('einrichtung.nutzung.spaeter')}>
          <div className="wahlkarten">
            {NUTZUNGEN.map((n) => (
              <label key={n} className={`wahlkarte${wahl === n ? ' gewaehlt' : ''}`}>
                <input type="radio" name="nutzung" value={n} checked={wahl === n} onChange={() => setWahl(n)} />
                <span className="wahlkarte-text">
                  <strong>{t(`einrichtung.nutzung.${n}`)}</strong>
                  <span className="leise klein">{t(`einrichtung.nutzung.${n}.text`)}</span>
                </span>
              </label>
            ))}
          </div>
        </FeldGruppe>
        {beruflich && (
          <section className="blatt stapel" aria-label={t('einrichtung.nutzung.organisation.titel')}>
            <h2 className="h3">{t('einrichtung.nutzung.organisation.titel')}</h2>
            <p className="leise klein">{t('einrichtung.nutzung.organisation.text')}</p>
            <OrganisationFelder wert={org} setze={setOrg} fehler={namensfehler} />
            <p className="leise klein">{t('einrichtung.nutzung.organisation.basis')}</p>
          </section>
        )}
        {wahl && (
          <FeldGruppe beschriftung={t('einrichtung.nutzung.stufe')} hinweis={t('einrichtung.nutzung.stufe.hinweis')}>
            <div className="wahlkarten">
              {WERKBANK_STUFEN.map((v) => (
                <label key={v} className={`wahlkarte${gewaehlt === v ? ' gewaehlt' : ''}`}>
                  <input type="radio" name="stufe" value={v} checked={gewaehlt === v} onChange={() => setStufe(v)} />
                  <span className="wahlkarte-text">
                    <strong>{VORLAGEN[v].name}</strong>
                    <span className="leise klein">{t.frei(`einrichtung.nutzung.stufe.${v}`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </FeldGruppe>
        )}
        <Navigation
          sendet={x.sendet}
          fehler={x.fehler}
          kannWeiter={!!wahl}
          zurueck={() => {
            merke();
            zurueckVon('nutzung', zurWahl);
          }}
          weiter={() =>
            void x.los(async () => {
              merke();
              const p = await pruefeSchritt('nutzung');
              setProbleme(p);
              if (!p.length) weiterVon('nutzung');
            })
          }
        />
      </form>
    </Rahmen>
  );
}
