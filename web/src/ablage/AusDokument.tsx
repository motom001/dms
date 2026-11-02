import { useRef, useState } from 'react';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import { api, type TypVorschlaege } from '../api';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { istTouch, verkleinere } from './PostKamera';

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
        setLaeuft('Lese das Dokument …');
        r = await api.vorschlaege(typ.id, { dokumente: [dokId], mappe: mappeId });
      } else {
        // Fotos vorher verkleinern (wie „Post fotografieren“): schneller, und die Texterkennung braucht nicht mehr.
        const texte: string[] = [];
        let letzte: (TypVorschlaege & { text: string }) | undefined;
        for (const [i, f] of dateien.entries()) {
          setLaeuft(dateien.length > 1 ? `Lese ${i + 1} von ${dateien.length} …` : 'Lese die Datei …');
          const blob = f.type.startsWith('image/') ? await verkleinere(f) : f;
          letzte = await api.vorschlaegeDatei(typ.id, blob, f.name, mappeId);
          texte.push(letzte.text);
        }
        r = dateien.length > 1 ? await api.vorschlaege(typ.id, { text: texte.join('\n\n'), mappe: mappeId }) : letzte!;
      }
      if (!r.zeichen) { setFehler('Auf dem Bild bzw. im Dokument war kein Text zu lesen. Versuch es mit einem schärferen Foto bei gutem Licht.'); return; }
      fertig({ r, dateien: dokId ? [] : dateien, ablegen: ablegen && !dokId && register.length ? register[0].key : null });
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(undefined); }
  }

  return (
    <section className="blatt ad-blatt" aria-label={titel}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{titel} <Hilfe ort="mappe.ausdokument" /></h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <p className="leise">Mach ein Foto oder wähle eine Datei (Foto, PDF, vCard) – Vorder- und Rückseite gehen zusammen. Die erkannten Angaben stehen danach als Vorschlag in den Feldern; übernommen wird erst mit „Mappe speichern“.</p>
      <div className="knoepfe ad-wahl">
        {istTouch() && <button type="button" className="knopf primaer" disabled={!!laeuft} onClick={() => kamera.current?.click()}><Symbol name="kamera" /> {dateien.length ? 'Weiteres Foto' : 'Foto aufnehmen'}</button>}
        <button type="button" className="knopf" disabled={!!laeuft} onClick={() => wahl.current?.click()}>{istTouch() ? 'Foto oder Datei wählen' : 'Datei wählen …'}</button>
        <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { dazu(e.target.files); e.target.value = ''; }} />
        <input ref={wahl} type="file" accept="image/*,application/pdf,.vcf,text/vcard" multiple hidden onChange={(e) => { dazu(e.target.files); e.target.value = ''; }} />
      </div>
      {dateien.length > 0 && (
        <ul className="ad-dateien">{dateien.map((f, i) => (
          <li key={`${f.name}-${i}`}><span>{f.name}</span><button type="button" className="textknopf klein gefahr" aria-label={`${f.name} entfernen`} onClick={() => setDateien((x) => x.filter((_, j) => j !== i))}>Entfernen</button></li>
        ))}</ul>
      )}
      {dokumente.length > 0 && !dateien.length && (
        <label className="eigenschaft"><span>oder ein Dokument dieser Mappe</span>
          <select value={dokId} onChange={(e) => setDokId(e.target.value)}>
            <option value="">– keins –</option>
            {dokumente.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
      )}
      {dateien.length > 0 && register.length > 0 && (
        <label className="haken klein"><input type="checkbox" checked={ablegen} onChange={(e) => setAblegen(e.target.checked)} />
          <span>{dateien.length === 1 ? 'Die Datei' : 'Die Dateien'} im Register „{register[0].name}“ ablegen</span></label>
      )}
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      <div className="knoepfe">
        <button type="button" className="knopf gruen" disabled={!!laeuft || (!dateien.length && !dokId)} onClick={() => void erkennen()}>{laeuft ?? 'Angaben erkennen'}</button>
      </div>
    </section>
  );
}
