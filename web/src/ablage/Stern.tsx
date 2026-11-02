import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { Symbol } from '../Symbol';

/**
 * Favorit (#62): Stern zum Merken einer Mappe. Persönlich – ändert weder „zuletzt geändert“
 * noch das Protokoll. Nach dem Umschalten werden Zähler und Listen neu geladen.
 */
export function Stern({ mappeId, an, titel, klein }: { mappeId: string; an: boolean; titel?: string; klein?: boolean }) {
  const d = useDaten();
  const [jetzt, setJetzt] = useState(an);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => setJetzt(an), [an]);
  async function umschalten(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (laeuft) return;
    const neu = !jetzt;
    setJetzt(neu); setLaeuft(true);
    try { await api.favorit(mappeId, neu); await d.neuLaden(); } catch { setJetzt(!neu); } finally { setLaeuft(false); }
  }
  const text = jetzt ? 'Aus den Favoriten entfernen' : 'Zu den Favoriten';
  return (
    <button type="button" className={`stern ${jetzt ? 'an' : ''} ${klein ? 'klein' : ''}`} aria-pressed={jetzt}
      aria-label={titel ? `${titel}: ${text}` : text} title={text} onClick={(e) => void umschalten(e)}>
      {/* #507: Symbol statt Textzeichen; gesetzt = gefüllt. */}
      <Symbol name="stern" className={jetzt ? 'sym-voll' : undefined} />
    </button>
  );
}
