import { useEffect, useState, type FormEvent } from 'react';
import { liesAnrede, textDritte, type Anrede, type TextDritte } from '../../shared/src/anrede';
import { CODE_LAENGE } from '../../shared/src/auskunft';
import { Feld, Knopf } from './bausteine';
import { sprache } from '../../shared/src/sprache';

/**
 * Öffentliche Abrufseite einer Auskunft (#455): ohne Anmeldung, ohne Menü, ohne Logo oder Namen des
 * Haushalts – nichts verrät, was es im DMS sonst gibt. Der Schlüssel steht im Fragment der Adresse
 * (/abruf#…) und geht nur mit dem Abrufcode per POST an den Server. Stimmen beide, startet der Download
 * über ein Einmal-Ticket. Die Seite lädt sonst nur die Anrede für Dritte (#474: du oder Sie) – keinen
 * Kontostatus, keine Diagnose. Alle Texte stehen in shared/src/anrede.ts.
 */

const schluesselAus = () => {
  let s = location.hash.replace(/^#/, '');
  try { s = decodeURIComponent(s); } catch { /* kaputtes Fragment: so lassen, der Server lehnt es ab */ }
  return s.trim();
};

export function Abrufseite() {
  const [schluessel] = useState(schluesselAus);
  // Den Schlüssel nicht im Verlauf des Browsers stehen lassen – er bleibt nur im Speicher dieser Seite.
  useEffect(() => { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch { /* egal */ } }, []);
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<{ groesse: number; verschluesselt: boolean; rest: number } | null>(null);
  // Anrede (#474): bis sie da ist, bleibt die Karte leer (kein Wechsel von „du“ zu „Sie“ vor den Augen).
  const [anrede, setAnrede] = useState<Anrede | null>(null);
  const eintrag = (k: TextDritte, w?: Record<string, string | number>) => textDritte(anrede ?? 'du', k, w);
  useEffect(() => {
    fetch('/api/abruf/anrede', { credentials: 'omit', cache: 'no-store' }).then((r) => r.json()).then((d: { anrede?: unknown }) => setAnrede(liesAnrede(d?.anrede)), () => setAnrede('du'));
  }, []);

  useEffect(() => {
    document.title = textDritte('du', 'abruf.titel');
    // Kein Hinweis auf das DMS im Tab: das Symbol des Designs bleibt außen vor.
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', 'data:,');
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
  }, []);

  async function abrufen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await fetch('/api/abruf', {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-dms': '1', 'x-sprache': sprache() },
        body: JSON.stringify({ schluessel, code }),
      });
      const d = await r.json().catch(() => null) as { fehler?: string; ticket?: string; groesse?: number; verschluesselt?: boolean; abrufe?: number; maxAbrufe?: number } | null;
      if (!r.ok || !d?.ticket) { setFehler(d?.fehler ?? eintrag('abruf.fehler')); return; }
      setFertig({ groesse: d.groesse ?? 0, verschluesselt: !!d.verschluesselt, rest: Math.max(0, (d.maxAbrufe ?? 1) - (d.abrufe ?? 0) - 1) });
      setCode('');
      // Download über ein Einmal-Ticket (zwei Minuten gültig); die Seite bleibt stehen.
      location.assign(`/api/abruf/datei?ticket=${encodeURIComponent(d.ticket)}`);
    } catch {
      setFehler(eintrag('abruf.fehler.verbindung'));
    } finally { setLaeuft(false); }
  }

  const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

  return (
    <main className="kartenseite abruf-seite">
      <div className="karte abruf-karte">
        <h1>{eintrag('abruf.titel')}</h1>
        {!anrede ? (
          <p className="leise" aria-busy="true">…</p>
        ) : !schluessel ? (
          <p className="hinweis schlecht">{eintrag('abruf.unvollstaendig')}</p>
        ) : fertig ? (
          <div className="abruf-fertig" role="status">
            <p className="hinweis gut">{eintrag('abruf.download', { groesse: mb(fertig.groesse) })}</p>
            {fertig.verschluesselt && <p>{eintrag('abruf.passwort')}</p>}
            <p className="leise">{fertig.rest > 0 ? eintrag('abruf.rest', { wieOft: ['', 'einmal', 'zweimal', 'dreimal'][fertig.rest] ?? `${fertig.rest}-mal` }) : eintrag('abruf.aufgebraucht')} {eintrag('abruf.startet.nicht')}</p>
            {fertig.rest > 0 && <Knopf onClick={() => setFertig(null)}>{eintrag('abruf.nochmal')}</Knopf>}
          </div>
        ) : (
          <form onSubmit={(e) => void abrufen(e)} className="abruf-form">
            <p>{eintrag('abruf.einleitung')}</p>
            <p className="leise klein">{eintrag('abruf.code.herkunft')}</p>
            <Feld beschriftung={eintrag('abruf.code')} hinweis={eintrag('abruf.code.schreibweise')}>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required
                maxLength={64} placeholder={'XXXX-XXXX'.slice(0, CODE_LAENGE + 1)} className="mono abruf-code" autoFocus /></Feld>
            {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
            <Knopf art="haupt" type="submit" laeuft={laeuft} laeuftText={eintrag('abruf.knopf.laeuft')} gesperrt={!code.trim()}>{eintrag('abruf.knopf')}</Knopf>
          </form>
        )}
      </div>
    </main>
  );
}
