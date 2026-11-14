import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { Knopf } from '../bausteine';

/**
 * Favorit (#62): Stern zum Merken einer Mappe. Persönlich – ändert weder „zuletzt geändert“
 * noch das Protokoll. Nach dem Umschalten werden Zähler und Listen neu geladen.
 */
export function Stern({ mappeId, an, titel, anker }: { mappeId: string; an: boolean; titel?: string; anker?: string }) {
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
  const text = jetzt ? t('ablage.stern.aus-den-favoriten-entfernen') : t('ablage.stern.zu-den-favoriten');
  return (
    // Baustein Knopf (#1211): eine Größe überall (Liste und Mappe), 24 px am Rechner, 44 px am Handy.
    <Knopf art="link" className={`stern ${jetzt ? 'an' : ''}`} data-anker={anker} aria-pressed={jetzt}
      nurSymbol={titel ? `${titel}: ${text}` : text} title={text} onClick={(e) => void umschalten(e)}>
      {/* #507: Symbol statt Textzeichen; gesetzt = gefüllt. */}
      <Symbol name="stern" className={jetzt ? 'sym-voll' : undefined} />
    </Knopf>
  );
}
