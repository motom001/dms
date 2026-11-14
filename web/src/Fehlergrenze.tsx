import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { jemandAngemeldet } from './konto';
import { ErreichbarkeitsBanner, erreichbarkeit, useNeuLadenBeiNeuerVersion } from './erreichbar';
import { t } from './sprache';
import { Knopf } from './bausteine';

/**
 * Fehlergrenze (#881): Wirft eine Komponente beim Zeichnen, zeigt React sonst eine leere weiße Seite. Stattdessen
 * eine kurze Meldung mit „Neu laden“ und „Fehler melden“ – angemeldet geht es zu Mein Konto → Fehler melden, sonst
 * (z. B. im Einrichtungsassistenten) kopiert der Knopf die technischen Angaben in die Zwischenablage.
 */
export class Fehlergrenze extends Component<{ children: ReactNode }, { fehler: Error | null }> {
  state: { fehler: Error | null } = { fehler: null };

  static getDerivedStateFromError(fehler: unknown) {
    return { fehler: fehler instanceof Error ? fehler : new Error(String(fehler)) };
  }

  componentDidCatch(fehler: unknown, info: ErrorInfo) {
    console.error(fehler, info.componentStack);
    // Oft steckt eine veraltete Oberfläche dahinter (#933): gleich nachsehen, ob der Server einen neuen Stand hat.
    void erreichbarkeit.pruefe();
  }

  render() {
    return this.state.fehler ? <FehlerAnzeige fehler={this.state.fehler} /> : this.props.children;
  }
}

/** Was in die Zwischenablage kommt: Meldung, Seite, Zeit, Browser und der Anfang des Stacks. */
export function fehlerAngaben(fehler: Error, wo = typeof location === 'undefined' ? '' : location.pathname, browser = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  return [
    `${t('oberflaeche.fehlergrenze.meldung')}: ${fehler.message}`,
    `${t('oberflaeche.fehlergrenze.seite')}: ${wo}`,
    `${t('oberflaeche.fehlergrenze.zeit')}: ${new Date().toISOString()}`,
    `${t('oberflaeche.fehlergrenze.browser')}: ${browser}`,
    ...(fehler.stack ? ['', ...fehler.stack.split('\n').slice(0, 12)] : []),
  ].join('\n');
}

export function FehlerAnzeige({ fehler }: { fehler: Error }) {
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);
  // Läuft inzwischen eine neue Version (#933), behebt Neuladen den Fehler meist – ohne Rückfrage, höchstens einmal je Minute.
  useNeuLadenBeiNeuerVersion();
  async function melden() {
    if (jemandAngemeldet()) { location.href = '/profil/fehler-melden'; return; }
    try { await navigator.clipboard.writeText(fehlerAngaben(fehler)); setKopiert('ja'); }
    catch { setKopiert('nein'); }
  }
  return (
    <>
    <ErreichbarkeitsBanner aussen ansichtNeuLaden={() => location.reload()} />
    <div className="kartenseite">
      <div className="karte fehlergrenze" role="alert">
        <h1>{t('oberflaeche.fehlergrenze.titel')}</h1>
        <p>{t('oberflaeche.fehlergrenze.text')}</p>
        <details className="klein">
          <summary>{t('oberflaeche.fehlergrenze.angaben')}</summary>
          <pre className="fehlergrenze-angaben">{fehler.message}</pre>
        </details>
        {kopiert === 'ja' && <p className="gutertext klein" role="status">{t('oberflaeche.fehlergrenze.kopiert')}</p>}
        {kopiert === 'nein' && <p className="fehlertext klein" role="status">{t('oberflaeche.fehlergrenze.nicht-kopiert')}</p>}
        <div className="knoepfe links">
          <Knopf art="haupt" symbol="neu-laden" onClick={() => location.reload()}>{t('oberflaeche.fehlergrenze.neu-laden')}</Knopf>
          <Knopf onClick={melden}>{t('oberflaeche.fehlergrenze.melden')}</Knopf>
        </div>
      </div>
    </div>
    </>
  );
}
