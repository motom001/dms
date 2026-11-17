import { t, tn } from '../../sprache';
import type { Historieneintrag } from '../../../../shared/src/model';
import { groesse, str, type Einzelheiten } from './hilfen';

export function dokumentVersion(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // Versionierung (#194): „Version 3 von Kassenbon gespeichert (ersetzt Kassenbon.jpg)“, „Version 1 zurückgeholt“.
  const nr = typeof d.version === 'number' ? d.version : null;
  return {
    hinweis:
      typeof d.zurueckgeholt === 'number'
        ? t('ablage.historie.version-zurueckgeholt', { zurueckgeholt: d.zurueckgeholt })
        : t('ablage.historie.version', { wert: nr ?? '?' }),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>
          {d.dokument}
          {str(d.vorher) && str(d.vorher) !== d.dokument && <> {tn('ablage.historie.ersetzt', { str: str(d.vorher) })}</>}
        </dd>
        {nr && (
          <>
            <dt>{t('ablage.historie.version-2')}</dt>
            <dd>
              {nr}
              {typeof d.zurueckgeholt === 'number' && (
                <> {t('ablage.historie.version-zurueckgeholt-2', { zurueckgeholt: d.zurueckgeholt })}</>
              )}
            </dd>
          </>
        )}
        {typeof d.groesse === 'number' && (
          <>
            <dt>{t('ablage.historie.groesse')}</dt>
            <dd>{groesse(d.groesse)}</dd>
          </>
        )}
        {str(d.register) && (
          <>
            <dt>{t('ablage.historie.register')}</dt>
            <dd>{str(d.register)}</dd>
          </>
        )}
      </dl>
    ),
  };
}

/** Hochgeladen, gelöscht, in den Papierkorb: Datei, Größe, Verkleinerung, Typ und Register. */
export function dokumentDatei(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  if (typeof d.groesse !== 'number') return null;
  return {
    hinweis: groesse(d.groesse),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>{d.dokument}</dd>
        <dt>{t('ablage.historie.groesse')}</dt>
        <dd>{groesse(d.groesse)}</dd>
        {str(d.verkleinert) && (
          <>
            <dt>{t('ablage.historie.verkleinert')}</dt>
            <dd>{str(d.verkleinert)}</dd>
          </>
        )}
        {str(d.mime) && (
          <>
            <dt>{t('ablage.historie.typ')}</dt>
            <dd>{str(d.mime)}</dd>
          </>
        )}
        {str(d.register) && (
          <>
            <dt>{t('ablage.historie.register')}</dt>
            <dd>{str(d.register)}</dd>
          </>
        )}
      </dl>
    ),
  };
}

export function pdfBearbeitet(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // PDF bearbeiten (#335): was geändert wurde bzw. was zusammengefügt wurde.
  const quellen = Array.isArray(d.zusammengefuegt) ? (d.zusammengefuegt as string[]) : [];
  return {
    hinweis: quellen.length ? t('ablage.historie.zusammengefuegt', { quellen: quellen.length }) : t('ablage.historie.einzelheiten'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>{d.dokument}</dd>
        {str(d.text) && (
          <>
            <dt>{t('ablage.historie.was')}</dt>
            <dd>{str(d.text)}</dd>
          </>
        )}
        {typeof d.seiten === 'number' && (
          <>
            <dt>{t('ablage.historie.seiten')}</dt>
            <dd>
              {typeof d.vorher === 'number' && d.vorher !== d.seiten ? `${d.vorher} → ` : ''}
              {d.seiten}
            </dd>
          </>
        )}
        {quellen.length > 0 && (
          <>
            <dt>{t('ablage.historie.aus')}</dt>
            <dd>{quellen.join(', ')}</dd>
          </>
        )}
      </dl>
    ),
  };
}

export function geschwaerzt(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // Schwärzen (#392): nur Zahlen – die Suchbegriffe und der geschwärzte Text stehen nirgends.
  return {
    hinweis: typeof d.stellen === 'number' ? t('ablage.historie.stellen', { anzahl: d.stellen }) : t('ablage.historie.einzelheiten'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>{d.dokument}</dd>
        {str(d.quelle) && (
          <>
            <dt>{t('ablage.historie.aus')}</dt>
            <dd>{str(d.quelle)}</dd>
          </>
        )}
        {typeof d.version === 'number' && (
          <>
            <dt>{t('ablage.historie.version-2')}</dt>
            <dd>{d.version}</dd>
          </>
        )}
        {str(d.text) && (
          <>
            <dt>{t('ablage.historie.was')}</dt>
            <dd>{str(d.text)}</dd>
          </>
        )}
      </dl>
    ),
  };
}

export function volltext(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // Texterkennung als Paket (#338): welches Paket den Volltext geschrieben hat.
  return {
    hinweis: str(d.dokument) ?? t('ablage.historie.volltext'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>{str(d.dokument)}</dd>
        {str(d.text) && (
          <>
            <dt>{t('ablage.historie.von')}</dt>
            <dd>{str(d.text)}</dd>
          </>
        )}
      </dl>
    ),
  };
}

export function umgewandelt(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // Dateien umwandeln (#577): welches Paket aus welcher Datei welche Fassung gemacht hat; das Original bleibt.
  return {
    hinweis: str(d.dokument) ?? t('ablage.historie.fassung'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.datei')}</dt>
        <dd>{str(d.dokument)}</dd>
        {str(d.text) && (
          <>
            <dt>{t('ablage.historie.fassung')}</dt>
            <dd>{str(d.text)}</dd>
          </>
        )}
      </dl>
    ),
  };
}

/** Abrufe (#800): Weg, Datei bzw. Fassung; beim Export die Dateien der Mappe. */
export function abruf(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const dateien = Array.isArray(d.dokumente) ? (d.dokumente as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const fassung = str(d.fassung);
  const weg = str(d.weg) ?? (e.art === 'abruf_webdav' ? 'webdav' : e.art === 'abruf_api' ? 'api' : 'oberflaeche');
  return {
    hinweis: dateien.length
      ? t('ablage.historie.abruf-dateien', { anzahl: dateien.length })
      : t.frei(`ablage.historie.abruf-fassung.${fassung ?? 'original'}`),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.weg')}</dt>
        <dd>
          {t.frei(`ablage.historie.abruf-weg.${weg}`)}
          {str(d.schluessel) && <> {t('ablage.historie.abruf-schluessel', { name: str(d.schluessel)! })}</>}
        </dd>
        {dateien.length > 0 ? (
          <>
            <dt>{t('ablage.historie.dateien')}</dt>
            <dd>{dateien.join(', ')}</dd>
          </>
        ) : (
          <>
            <dt>{t('ablage.historie.datei')}</dt>
            <dd>
              {d.dokument}
              {str(d.datei) && <> {t('ablage.historie.abruf-als', { name: str(d.datei)! })}</>}
            </dd>
          </>
        )}
        {fassung && (
          <>
            <dt>{t('ablage.historie.fassung')}</dt>
            <dd>
              {t.frei(`ablage.historie.abruf-fassung.${fassung}`)}
              {typeof d.version === 'number' && <> {d.version}</>}
            </dd>
          </>
        )}
        <dt>{t('ablage.historie.stempel')}</dt>
        <dd>{d.gestempelt ? t('ablage.historie.mit-stempel') : t('ablage.historie.ohne-stempel')}</dd>
      </dl>
    ),
  };
}
