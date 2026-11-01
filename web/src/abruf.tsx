import { useEffect, useState, type FormEvent } from 'react';
import { CODE_LAENGE } from '../../shared/src/auskunft';

/**
 * Öffentliche Abrufseite einer Auskunft (#455): ohne Anmeldung, ohne Menü, ohne Logo oder Namen des
 * Haushalts – nichts verrät, was es im DMS sonst gibt. Der Schlüssel steht im Fragment der Adresse
 * (/abruf#…) und geht nur mit dem Abrufcode per POST an den Server. Stimmen beide, startet der Download
 * über ein Einmal-Ticket. Die Seite lädt sonst nichts (kein Kontostatus, keine Diagnose).
 */

const schluesselAus = () => decodeURIComponent(location.hash.replace(/^#/, '')).trim();

export function Abrufseite() {
  const [schluessel] = useState(schluesselAus);
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<{ groesse: number; verschluesselt: boolean; rest: number } | null>(null);

  useEffect(() => {
    document.title = 'Auskunft abrufen';
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
        headers: { 'content-type': 'application/json', 'x-dms': '1' },
        body: JSON.stringify({ schluessel, code }),
      });
      const d = await r.json().catch(() => null) as { fehler?: string; ticket?: string; groesse?: number; verschluesselt?: boolean; abrufe?: number; maxAbrufe?: number } | null;
      if (!r.ok || !d?.ticket) { setFehler(d?.fehler ?? 'Das hat gerade nicht geklappt. Bitte versuche es später noch einmal.'); return; }
      setFertig({ groesse: d.groesse ?? 0, verschluesselt: !!d.verschluesselt, rest: Math.max(0, (d.maxAbrufe ?? 1) - (d.abrufe ?? 0) - 1) });
      setCode('');
      // Download über ein Einmal-Ticket (zwei Minuten gültig); die Seite bleibt stehen.
      location.assign(`/api/abruf/datei?ticket=${encodeURIComponent(d.ticket)}`);
    } catch {
      setFehler('Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es noch einmal.');
    } finally { setLaeuft(false); }
  }

  const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

  return (
    <main className="kartenseite abruf-seite">
      <div className="karte abruf-karte">
        <h1>Auskunft abrufen</h1>
        {!schluessel ? (
          <p className="hinweis schlecht">Dieser Link ist unvollständig. Öffne bitte den ganzen Link aus der E-Mail – er endet mit einer langen Zeichenfolge nach dem #.</p>
        ) : fertig ? (
          <div className="abruf-fertig" role="status">
            <p className="hinweis gut">Der Download startet ({mb(fertig.groesse)}). Speichere die ZIP-Datei an einem sicheren Ort.</p>
            {fertig.verschluesselt && <p>Die Datei ist mit einem Passwort geschützt. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip.</p>}
            <p className="leise">{fertig.rest > 0 ? `Du kannst sie mit diesem Link noch ${['', 'einmal', 'zweimal', 'dreimal'][fertig.rest] ?? `${fertig.rest}-mal`} herunterladen.` : 'Damit ist der Link aufgebraucht.'} Startet nichts, gib deinen Abrufcode bitte noch einmal ein.</p>
            {fertig.rest > 0 && <button type="button" className="knopf" onClick={() => setFertig(null)}>Noch einmal abrufen</button>}
          </div>
        ) : (
          <form onSubmit={(e) => void abrufen(e)} className="abruf-form">
            <p>Du hast eine Auskunft nach Art. 15 DSGVO über die hier gespeicherten Daten angefordert. Zur Sicherheit gib bitte deinen Abrufcode ein.</p>
            <p className="leise klein">Den Code hast du getrennt von diesem Link bekommen – zum Beispiel per Brief, Telefon oder SMS.</p>
            <label className="eigenschaft"><span>Abrufcode</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required
                maxLength={64} placeholder={'XXXX-XXXX'.slice(0, CODE_LAENGE + 1)} className="mono abruf-code" autoFocus /></label>
            {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
            <button className="knopf primaer" disabled={laeuft || !code.trim()}>{laeuft ? 'Prüfe …' : 'Auskunft herunterladen'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
