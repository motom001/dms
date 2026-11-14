import { useRef, useState } from 'react';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import { werkbankApi, type TypVorschlaege } from '../api/werkbank';
import { Hilfe } from '../Hilfe';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { istTouch, verkleinere } from './PostKamera';
import { t } from '../sprache';

/**
 * „Aus Dokument ausfüllen“ (#391, Stufe 1): Foto machen oder Datei wählen (mehrere, z. B. Vorder- und
 * Rückseite einer Visitenkarte) bzw. ein Dokument der Mappe nehmen – die eingebaute Erkennung schlägt Werte
 * für die Felder vor. Gespeichert wird nichts: Das Formular trägt die Vorschläge ein, „Mappe speichern“
 * übernimmt sie (und legt die Bilder auf Wunsch im Dokumentenregister ab).
 */
export interface AusDokumentErgebnis { r: TypVorschlaege; dateien: File[]; ablegen: string | null }

export function AusDokument({ typ, titel, mappeId, dokumente, fertig, schliessen }: {
  typ: Mappentyp; titel: string; mappeId?: string;
  /** Dokumente der Mappe mit Volltext (nur bestehende Mappen). */
  dokumente: Dokument[];
  fertig(e: AusDokumentErgebnis): void; schliessen(): void;
}) {
  const kamera = useRef<HTMLInputElement>(null);
  const wahl = useRef<HTMLInputElement>(null);
  const [dateien, setDateien] = useState<File[]>([]);
  const [dokId, setDokId] = useState('');
  const register = typ.register.filter((r) => r.art === 'dokumente');
  const [ablegen, setAblegen] = useState(register.length > 0);
  const [laeuft, setLaeuft] = useState<string>();
  const [fehler, setFehler] = useState<string>();
  const dazu = (l: FileList | null) => { const f = [...(l ?? [])]; if (f.length) { setDateien((x) => [...x, ...f].slice(0, 6)); setDokId(''); } };

  async function erkennen() {
    setFehler(undefined);
    try {
      let r: TypVorschlaege;
      if (dokId) {
        setLaeuft(t('ablage.ausdokument.lese-das-dokument'));
        r = await werkbankApi.vorschlaege(typ.id, { dokumente: [dokId], mappe: mappeId });
      } else {
        // Fotos vorher verkleinern (wie „Post fotografieren“): schneller, und die Texterkennung braucht nicht mehr.
        const texte: string[] = [];
        let letzte: (TypVorschlaege & { text: string }) | undefined;
        for (const [i, f] of dateien.entries()) {
          setLaeuft(dateien.length > 1 ? t('ablage.ausdokument.lese-von', { wert: i + 1, dateien: dateien.length }) : t('ablage.ausdokument.lese-die-datei'));
          const blob = f.type.startsWith('image/') ? await verkleinere(f) : f;
          letzte = await werkbankApi.vorschlaegeDatei(typ.id, blob, f.name, mappeId);
          texte.push(letzte.text);
        }
        r = dateien.length > 1 ? await werkbankApi.vorschlaege(typ.id, { text: texte.join('\n\n'), mappe: mappeId }) : letzte!;
      }
      if (!r.zeichen) { setFehler(t('ablage.ausdokument.auf-dem-bild-bzw')); return; }
      fertig({ r, dateien: dokId ? [] : dateien, ablegen: ablegen && !dokId && register.length ? register[0].key : null });
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(undefined); }
  }

  return (
    <section className="blatt ad-blatt" aria-label={titel}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{titel} <Hilfe ort="mappe.ausdokument" /></h2><Knopf art="link" onClick={schliessen}>{t('ablage.ausdokument.schliessen')}</Knopf></div>
      <p className="leise">{t('ablage.ausdokument.mach-ein-foto-oder')}</p>
      <div className="knoepfe ad-wahl">
        {/* Blau ist nur „Angaben erkennen“ (Leitsatz 1); Foto und Datei sind Nebenknöpfe. */}
        {istTouch() && <Knopf symbol="kamera" gesperrt={!!laeuft} onClick={() => kamera.current?.click()}>{dateien.length ? t('ablage.ausdokument.weiteres-foto') : t('ablage.ausdokument.foto-aufnehmen')}</Knopf>}
        <Knopf gesperrt={!!laeuft} onClick={() => wahl.current?.click()}>{istTouch() ? t('ablage.ausdokument.foto-oder-datei-waehlen') : t('ablage.ausdokument.datei-waehlen')}</Knopf>
        <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { dazu(e.target.files); e.target.value = ''; }} />
        <input ref={wahl} type="file" accept="image/*,application/pdf,.vcf,text/vcard,.xml,application/xml,text/xml" multiple hidden onChange={(e) => { dazu(e.target.files); e.target.value = ''; }} />
      </div>
      {dateien.length > 0 && (
        <ul className="ad-dateien">{dateien.map((f, i) => (
          <li key={`${f.name}-${i}`}><span>{f.name}</span><Knopf art="link" groesse="klein" aria-label={t('ablage.ausdokument.entfernen', { name: f.name })} onClick={() => setDateien((x) => x.filter((_, j) => j !== i))}>{t('ablage.ausdokument.entfernen-2')}</Knopf></li>
        ))}</ul>
      )}
      {dokumente.length > 0 && !dateien.length && (
        <Feld beschriftung={t('ablage.ausdokument.oder-ein-dokument-dieser')}>
          <select value={dokId} onChange={(e) => setDokId(e.target.value)}>
            <option value="">{t('ablage.ausdokument.keins')}</option>
            {dokumente.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Feld>
      )}
      {dateien.length > 0 && register.length > 0 && (
        <HakenFeld beschriftung={t('ablage.ausdokument.die-dateien-im-register', { anzahl: dateien.length, name: register[0].name })}>
          <input type="checkbox" checked={ablegen} onChange={(e) => setAblegen(e.target.checked)} />
        </HakenFeld>
      )}
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={!dateien.length && !dokId} laeuft={!!laeuft} laeuftText={laeuft ?? undefined} onClick={() => void erkennen()}>{t('ablage.ausdokument.angaben-erkennen')}</Knopf>
      </div>
    </section>
  );
}
