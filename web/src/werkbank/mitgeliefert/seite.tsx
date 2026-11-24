import type { ReactNode } from 'react';
import { Etikett, PaketChip, Schalter } from '../../bausteine';
import type { MitgelieferterAnbieter } from '../../../../shared/src/leistungen';
import { KATALOG_LINK_REL } from '../../../../shared/src/pakete';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Kopf } from '../Kopf';
import { dateitypenText, folgeDesAusschaltens, type MitgeliefertZustand } from './zustand';

/**
 * Seite eines mitgelieferten Anbieters (#1570) unter Werkbank → Pakete: Schalter an/aus (Muster A7, kein Entfernen),
 * was er macht, und seine Einstellungen – die aus den früheren Bereichen (Suche und Volltext, Archivfassung, andere
 * Dateitypen, „Neue PDFs automatisch verkleinern“) hierher umgezogen sind (`children`). Vor dem Ausschalten sagt eine
 * Rückfrage die Folge, ob es Ersatz gibt, und führt in den Katalog; ausgeschaltet steht das oben auf der Seite.
 */
export function MitgeliefertSeite({
  z,
  id,
  darfSchalten,
  children,
}: {
  z: MitgeliefertZustand;
  id: string;
  darfSchalten: boolean;
  children?: ReactNode;
}) {
  if (z.fehler)
    return (
      <div className="hinweis schlecht">
        <p>{z.fehler}</p>
      </div>
    );
  if (!z.stand) return <p className="leise">{t('werkbank.pakete.mitgeliefert.lade')}</p>;
  const a = z.stand.mitgeliefert.find((x) => x.id === id);
  if (!a)
    return (
      <div className="leer">
        <p>{t('werkbank.pakete.mitgeliefert.unbekannt')}</p>
      </div>
    );
  return (
    <div className="einspaltig">
      <Kopf
        ueber={t('werkbank.pakete.mitgeliefert.ueber')}
        hilfe="werkbank.pakete.mitgeliefert"
        titel={
          <>
            {a.name} <PaketChip paket="ablago" />
            {!a.an && (
              <>
                {' '}
                <Etikett title={t('werkbank.pakete.mitgeliefert.aus.titel')}>{t('werkbank.pakete.mitgeliefert.aus')}</Etikett>
              </>
            )}
          </>
        }>
        <p className="leise">{t('werkbank.pakete.mitgeliefert.text')}</p>
      </Kopf>
      <AnAus a={a} z={z} darfSchalten={darfSchalten} />
      <Macht a={a} />
      {children ?? (
        <section className="blatt" id="einstellungen">
          <h2 className="h3">{t('werkbank.pakete.mitgeliefert.einstellungen')}</h2>
          <p className="leise">{t('werkbank.pakete.mitgeliefert.keine-einstellungen')}</p>
        </section>
      )}
    </div>
  );
}

function KatalogLink({ href }: { href: string }) {
  return (
    <a className="verweis" href={href} target="_blank" rel={KATALOG_LINK_REL}>
      {t('werkbank.pakete.mitgeliefert.katalog')} <Symbol name="extern" />
    </a>
  );
}

/** Schalter (Muster A7): Einschalten sofort, Ausschalten erst nach der Rückfrage mit Folge und Ersatz. */
function AnAus({ a, z, darfSchalten }: { a: MitgelieferterAnbieter; z: MitgeliefertZustand; darfSchalten: boolean }) {
  const f = folgeDesAusschaltens(a);
  const setze = async (an: boolean) => {
    if (!an) {
      const ja = await rueckfrage({
        titel: t('werkbank.pakete.mitgeliefert.ausschalten.titel', { name: a.name }),
        ja: t('werkbank.pakete.mitgeliefert.ausschalten.ja'),
        text: (
          <>
            {f.folge} {f.ersatz} <KatalogLink href={f.katalog} />
          </>
        ),
      });
      if (!ja) return;
    }
    await z.schalten(a.id, an);
  };
  return (
    <section className="blatt" id="schalter" data-anker="werkbank.pakete.mitgeliefert.schalter">
      <Schalter
        an={a.an}
        setze={setze}
        gesperrt={!darfSchalten}
        beschriftung={t('werkbank.pakete.mitgeliefert.schalter')}
        hinweis={darfSchalten ? t('werkbank.pakete.mitgeliefert.schalter.hinweis') : t('werkbank.pakete.mitgeliefert.schalter.nur-pakete')}
      />
      {!a.an && (
        <div className="hinweis warn" role="status">
          <p>
            {t('werkbank.pakete.mitgeliefert.ist-aus', { folge: f.folge, ersatz: f.ersatz })} <KatalogLink href={f.katalog} />
          </p>
        </div>
      )}
    </section>
  );
}

/** Was er macht: Tätigkeiten als Verben mit Dateitypen; technische Namen nur aufgeklappt für Fachleute. */
function Macht({ a }: { a: MitgelieferterAnbieter }) {
  return (
    <section className="blatt" id="macht">
      <h2 className="h3">{t('werkbank.pakete.mitgeliefert.bietet')}</h2>
      <table className="tabelle klein">
        <thead>
          <tr>
            <th>{t('werkbank.pakete.mitgeliefert.taetigkeit')}</th>
            <th>{t('werkbank.pakete.mitgeliefert.dateitypen')}</th>
          </tr>
        </thead>
        <tbody>
          {a.taetigkeiten.map((x) => (
            <tr key={x.leistung}>
              <td>{x.name}</td>
              <td>
                {dateitypenText(x.dateitypen)}
                {x.nur.map((n) => (
                  <span key={n} className="leise">
                    {' – '}
                    {t('werkbank.pakete.mitgeliefert.nur', { text: n })}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="klein">
        <summary>{t('werkbank.pakete.mitgeliefert.fachleute')}</summary>
        <ul>
          {a.taetigkeiten.map((x) => (
            <li key={x.leistung}>
              <code>{x.leistung}</code>
            </li>
          ))}
          <li>
            <code>{a.id}</code>
          </li>
        </ul>
      </details>
    </section>
  );
}
