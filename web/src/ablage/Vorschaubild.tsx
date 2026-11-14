import { useEffect, useState } from 'react';
import { kernTyp } from '../../../shared/src/dateiumwandlung';
import { vorschauUrl } from '../api';
import { t } from '../sprache';
import { Symbol } from '../Symbol';

/**
 * Kleines Vorschaubild der ersten Seite (#332), 40 × 52 px.
 * Gibt es (noch) keins, steht dort ein Dateisymbol mit der Endung. Direkt nach dem Hochladen
 * entsteht das Bild im Hintergrund – deshalb zwei weitere Versuche nach kurzer Zeit.
 * Andere Dateitypen (#577) haben eins, wenn ein Paket sie umgewandelt hat: ein Versuch; das Bild ist als Vorschau
 * aus der umgewandelten Fassung gekennzeichnet.
 * Archivfassung (#1216, z. B. E-Mails): Ist sie fertig, entsteht das Bild daraus – Versuche wie direkt nach dem
 * Hochladen. Wartet sie noch, wenige weitere Versuche in größeren Abständen; kommt sie mit dem nächsten Abruf der
 * Liste als fertig, beginnt es von vorn – ohne die Mappe neu zu laden.
 */

const endung = (name: string, mime: string) => {
  const e = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1];
  if (e) return e.toUpperCase();
  return mime === 'application/pdf' ? 'PDF' : mime.startsWith('image/') ? 'BILD' : 'DATEI';
};

export function Vorschaubild({ d }: { d: { id: string; name: string; mime: string; sha256: string; archivfassung?: { stand: string } | null } }) {
  const kern = kernTyp(d.mime);
  const archiv = d.archivfassung?.stand;
  const moeglich = kern || archiv === 'fertig';
  // Wartet die Archivfassung, kommt das Bild erst mit ihr (#1216): seltener nachsehen (5, 10, 20, 40, 80 s).
  const wartet = !moeglich && archiv === 'wartet';
  const versuche = moeglich ? 2 : wartet ? 5 : 0;
  const [versuch, setVersuch] = useState(0);
  // Ohne erkannten Dateityp (octet-stream) gibt es auch keine Fassung: gleich das Dateisymbol – außer mit Archivfassung
  // (#946: E-Mails liegen oft als octet-stream mit Endung .eml da).
  const ohne = d.mime === 'application/octet-stream' && !archiv;
  const [fehlt, setFehlt] = useState(ohne);
  useEffect(() => { setVersuch(0); setFehlt(ohne); }, [d.id, d.sha256, moeglich, ohne]);
  useEffect(() => {
    if (!fehlt || versuch >= versuche) return;
    const timer = setTimeout(() => { setVersuch((v) => v + 1); setFehlt(false); }, wartet ? 5000 * 2 ** versuch : 2500 * (versuch + 1));
    return () => clearTimeout(timer);
  }, [fehlt, versuche, wartet, versuch]);
  return fehlt
    // Ohne Bild (#1212): Dateisymbol (Lucide) mit der Endung darunter, statt nur Schrift.
    ? <span className="vorschaubild ohne" aria-hidden="true"><Symbol name="dokument" /><span>{endung(d.name, d.mime)}</span></span>
    : <img className="vorschaubild" src={vorschauUrl(d, versuch)} alt="" title={kern ? undefined : t('volltext.vorschau.fassung')} width={40} height={52} loading="lazy" decoding="async" onError={() => setFehlt(true)} />;
}
