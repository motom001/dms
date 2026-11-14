import { ANREDE_BEISPIEL, ANREDE_NAME, ANREDEN, textDritte, type Anrede } from '../../../shared/src/anrede';
import { istRechteStandard, rechteStandard, type Datenschutz } from '../../../shared/src/auskunft';
import { Feld, FeldGruppe, Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';

/** Was die Vorgaben der Auskunft ändern (#1183): Anrede, Rechte der Person, Empfänger. */
export type Vorgaben = Pick<Datenschutz, 'anrede' | 'rechte' | 'empfaenger'>;
export const vorgabenAus = (d: Datenschutz): Vorgaben => ({ anrede: d.anrede, rechte: d.rechte, empfaenger: d.empfaenger });

/**
 * Datenschutz-Auskünfte: Vorgaben für jede Auskunft (#668, #994; seit #1183 auf „Eigene Organisation“, damit die
 * Einrichtung in einem Zug erledigt ist). Gespeichert wird mit der Speicherleiste der Seite.
 *
 * - Anrede zuerst: Der Text „Rechte der Person“ folgt der Wahl, solange er nicht von Hand geändert wurde; danach lässt er
 *   sich anpassen und mit „Auf Vorschlag zurücksetzen“ wieder auf den Text zur Anrede setzen.
 * - „Empfänger“ mit Hilfetext und Beispielen (keine Rechtsberatung); „Vorschlag“ heißt: je Auskunft noch änderbar.
 */
export function AuskunftVorgaben({ w, setze }: { w: Vorgaben; setze(x: Vorgaben): void }) {
  const eigen = !istRechteStandard(w.rechte);
  return (
    <section className="blatt stapel" id="auskunft-vorgaben" aria-labelledby="auskunft-vorgaben-titel">
      <h2 className="h3" id="auskunft-vorgaben-titel">{t('werkbank.auskunft.vorgaben.titel')} <Hilfe ort="werkbank.auskunft.vorgaben" /></h2>
      <p className="leise klein">{t('werkbank.auskunft.einstellungen.text')} <Link to="/werkbank/auskuenfte" className="verweis">{t('werkbank.auskunft.vorgaben.zu-auskuenften')}</Link></p>
      <AnredeWahl anrede={w.anrede} setAnrede={(anrede) => setze({ ...w, anrede, rechte: eigen ? w.rechte : rechteStandard(anrede) })} />
      <Feld beschriftung={t('werkbank.datenschutz.rechte-der-person')} id="auskunft-rechte"
        hinweis={eigen ? t('werkbank.auskunft.vorgaben.rechte-eigen') : t('werkbank.auskunft.vorgaben.rechte-folgt')}>
        <textarea rows={5} value={w.rechte} onChange={(x) => setze({ ...w, rechte: x.target.value })} />
      </Feld>
      {eigen && <p><Knopf onClick={() => setze({ ...w, rechte: rechteStandard(w.anrede) })}>{t('werkbank.auskunft.vorgaben.zuruecksetzen')}</Knopf></p>}
      <Feld beschriftung={t('werkbank.auskunft.vorgaben.empfaenger')} id="auskunft-empfaenger" hinweis={t('werkbank.auskunft.vorgaben.empfaenger.hinweis')}>
        <textarea rows={2} value={w.empfaenger} onChange={(x) => setze({ ...w, empfaenger: x.target.value })} />
      </Feld>
    </section>
  );
}

/**
 * Anrede in Unterlagen für Dritte (#474): du oder Sie für alles, was an die Person geht – Deckblatt, Übersicht,
 * LIESMICH, Abrufseite, E-Mails. Die Oberfläche bleibt beim „du“. Vorschau: ein Satz in beiden Formen.
 */
function AnredeWahl({ anrede, setAnrede }: { anrede: Anrede; setAnrede(a: Anrede): void }) {
  return (
    <div id="anrede">
      <FeldGruppe beschriftung={t('werkbank.datenschutz.anrede-in-unterlagen-fuer')} hilfe="werkbank.datenschutz.anrede" hinweis={t('werkbank.datenschutz.gilt-fuer-alles-was')} className="anrede-dritte">
        <div className="anrede-dritte-wahl">
          {ANREDEN.map((a) => (
            <label key={a} className={`anrede-dritte-form${a === anrede ? ' gewaehlt' : ''}`}>
              <span className="anrede-dritte-kopf"><input type="radio" name="anrede-dritte" checked={a === anrede} onChange={() => setAnrede(a)} /><strong>{ANREDE_NAME[a]}</strong>{a === 'du' && <span className="leise klein"> {' '}{t('werkbank.datenschutz.vorgabe')}</span>}</span>
              <q className="klein">{textDritte(a, ANREDE_BEISPIEL)}</q>
            </label>
          ))}
        </div>
      </FeldGruppe>
    </div>
  );
}
