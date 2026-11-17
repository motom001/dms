import type { ReactNode } from 'react';
import type { Benutzer } from '../../../../shared/src/model';
import { kontoApi } from '../../api/konto';
import { t, tn } from '../../sprache';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { geheZu, loeseWache } from '../../ort';
import { Hilfe } from '../../Hilfe';
import { rueckfrage } from '../../rueckfrage';
import { Bereich, Knopf, type BereicheZustand } from '../../bausteine';
import { datumZeit, type Aktion, type BenutzerBereich } from './hilfen';

/**
 * Zugang (#1000): Fehler nachstellen (#146) und Zugang sperren (#77) – deaktivieren nur mit Vertreter und ohne offene
 * Aufgaben (#78); der Vertreter wirkt danach dauerhaft. Löschen bleibt für Einladungen, die nie angenommen wurden.
 */
export function Zugang({
  b,
  b2,
  selbst,
  loeschbar,
  aktion,
}: {
  b: Benutzer;
  b2: BereicheZustand<BenutzerBereich>;
  selbst: boolean;
  loeschbar: boolean;
  aktion: Aktion;
}) {
  const d = useDaten();
  const { aktualisieren } = useKonto();
  const name = b.name || b.email;
  const vertreter = b.abwesenheit?.vertreterId ? d.person(b.abwesenheit.vertreterId) : null;
  const offen = b.offeneAufgaben ?? 0;
  if (!b.aktiv) return wiederFreigeben(b, b2, vertreter, aktion);
  if (selbst) return null;
  // „im Bereich Vertretung“ als Sprung: öffnet ihn, rollt hin und setzt den Fokus auf seinen Kopf.
  const bereich = <Knopf onClick={() => b2.oeffne(['vertretung'], true, true)}>{t('werkbank.benutzer.bereich.vertretung')}</Knopf>;
  const gruende: Array<[string, ReactNode]> = [];
  if (!vertreter) gruende.push(['vertreter', tn('werkbank.benutzer.es-ist-kein-vertreter', { bereich })]);
  if (offen > 0)
    gruende.push([
      'aufgaben',
      tn('werkbank.benutzer.hat-noch-offene-aufgaben', {
        anzahl: offen,
        name,
        wert: vertreter ? tn('werkbank.benutzer.gib-sie-oben-an', { vertreter, bereich }) : '.',
      }),
    ]);
  // Kein Rot für den Bereich (Musterkatalog C15): Rot heißt hier „Fehler beim Speichern“; die Gefahr zeigen der rote
  // Knopf (C14) und die Rückfrage (B4).
  return (
    <Bereich
      id="zugang"
      titel={t('werkbank.benutzer.bereich.zugang')}
      klappe={b2.klappe('zugang')}
      kurz={t('werkbank.benutzer.bereich.zugang.kurz')}>
      {fehlerNachstellen(b, aktion, aktualisieren)}
      <div>
        <h3 className="h4">
          {t('werkbank.benutzer.zugang-sperren')} <Hilfe ort="benutzer.sperren" />
        </h3>
        <ul className="leise">
          <li>{t('werkbank.benutzer.der-zugang-ist-sofort')}</li>
          <li>{t('werkbank.benutzer.die-mappe-bleibt-erhalten')}</li>
          <li>{t('werkbank.benutzer.der-vertreter-bleibt-hinterlegt', { name })}</li>
          <li>{tn('werkbank.benutzer.macht-es-jederzeit-rueckgaengig', { b: <strong>{t('werkbank.benutzer.aktivieren')}</strong> })}</li>
        </ul>
        {gruende.length > 0 && (
          <div className="hinweis warn stapel">
            <p>{t('konten.sperren.nochnicht')}</p>
            <ul>
              {gruende.map(([k, g]) => (
                <li key={k}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="knoepfe">
          {loeschbar && (
            <Knopf
              art="gefahr"
              symbol="geloescht"
              onClick={() => {
                void aktion(async () => {
                  await kontoApi.benutzerLoeschen(b.id);
                  loeseWache();
                  geheZu('/werkbank/benutzer');
                });
              }}
              rueckfrage={{
                titel: t('werkbank.benutzer.einladung-loeschen'),
                text: t('werkbank.benutzer.die-einladung-an-wird', { email: b.email }),
                ja: t('werkbank.benutzer.einladung-loeschen-2'),
              }}>
              {t('werkbank.benutzer.einladung-loeschen-2')}
            </Knopf>
          )}
          <Knopf
            art="gefahr"
            symbol="verboten"
            gesperrt={gruende.length > 0}
            rueckfrage={{
              titel: t('werkbank.benutzer.deaktivieren', { name }),
              text: t('werkbank.benutzer.der-zugang-ist-sofort-2', { name, vertreter: String(vertreter) }),
              ja: t('werkbank.benutzer.deaktivieren-2'),
            }}
            onClick={() => {
              void aktion(
                () => kontoApi.benutzerAendern(b.id, { aktiv: false }),
                t('werkbank.benutzer.deaktiviert-alle-sitzungen-beendet'),
              );
            }}>
            {t('werkbank.benutzer.benutzer-deaktivieren')}
          </Knopf>
        </div>
      </div>
    </Bereich>
  );
}

/** Deaktiviert: Zugang wieder freigeben. */
function wiederFreigeben(b: Benutzer, b2: BereicheZustand<BenutzerBereich>, vertreter: string | null, aktion: Aktion) {
  const name = b.name || b.email;
  return (
    <Bereich
      id="zugang"
      titel={t('werkbank.benutzer.zugang-wieder-freigeben')}
      klappe={b2.klappe('zugang')}
      kurz={t('werkbank.benutzer.status.deaktiviert')}>
      <p className="leise">
        {t('werkbank.benutzer.ist-deaktiviert-aktivieren-gibt', {
          name,
          wert: b.deaktiviert ? t('werkbank.benutzer.seit', { datumZeit: datumZeit(b.deaktiviert) }) : '',
          wert2: vertreter ? t('werkbank.benutzer.aufgaben-die-noch-fuer', { name, vertreter }) : '',
        })}
      </p>
      <div className="knoepfe">
        <Knopf art="haupt" onClick={() => aktion(() => kontoApi.benutzerAendern(b.id, { aktiv: true }), t('werkbank.benutzer.aktiviert'))}>
          {t('werkbank.benutzer.benutzer-aktivieren')}
        </Knopf>
      </div>
    </Bereich>
  );
}

/** Fehler nachstellen (#146): als dieser Benutzer anmelden – die eigene Sitzung endet. */
function fehlerNachstellen(b: Benutzer, aktion: Aktion, aktualisieren: () => Promise<unknown>) {
  const name = b.name || b.email;
  return (
    <div>
      <h3 className="h4">{t('werkbank.benutzer.fehler-nachstellen')}</h3>
      <p className="leise">{t('werkbank.benutzer.du-siehst-und-bedienst', { wert: name })}</p>
      <div className="knoepfe">
        <Knopf
          onClick={async () => {
            if (
              await rueckfrage({
                titel: t('werkbank.benutzer.als-anmelden', { wert: name }),
                text: t('werkbank.benutzer.deine-eigene-sitzung-endet'),
                ja: t('werkbank.benutzer.anmelden'),
              })
            ) {
              void aktion(async () => {
                await kontoApi.vertreten(b.id);
                geheZu('/ablage', true);
                await aktualisieren();
              });
            }
          }}>
          {t('werkbank.benutzer.als-anmelden-2', { wert: name })}
        </Knopf>
      </div>
    </div>
  );
}
