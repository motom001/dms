import { useEffect, useState } from 'react';
import { vorschauUrl } from '../api';

/**
 * Kleines Vorschaubild der ersten Seite (#332), 40 × 52 px.
 * Gibt es (noch) keins, steht dort ein Dateisymbol mit der Endung. Direkt nach dem Hochladen
 * entsteht das Bild im Hintergrund – deshalb zwei weitere Versuche nach kurzer Zeit.
 */
const MIT_VORSCHAU = ['application/pdf', 'image/jpeg', 'image/png'];

const endung = (name: string, mime: string) => {
  const e = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1];
  if (e) return e.toUpperCase();
  return mime === 'application/pdf' ? 'PDF' : mime.startsWith('image/') ? 'BILD' : 'DATEI';
};

export function Vorschaubild({ d }: { d: { id: string; name: string; mime: string; sha256: string } }) {
  const moeglich = MIT_VORSCHAU.includes(d.mime);
  const [versuch, setVersuch] = useState(0);
  const [fehlt, setFehlt] = useState(!moeglich);
  useEffect(() => { setVersuch(0); setFehlt(!moeglich); }, [d.id, d.sha256, moeglich]);
  useEffect(() => {
    if (!fehlt || !moeglich || versuch >= 2) return;
    const t = setTimeout(() => { setVersuch((v) => v + 1); setFehlt(false); }, 2500 * (versuch + 1));
    return () => clearTimeout(t);
  }, [fehlt, moeglich, versuch]);
  return fehlt
    ? <span className="vorschaubild ohne" aria-hidden="true">{endung(d.name, d.mime)}</span>
    : <img className="vorschaubild" src={vorschauUrl(d, versuch)} alt="" width={40} height={52} loading="lazy" decoding="async" onError={() => setFehlt(true)} />;
}
