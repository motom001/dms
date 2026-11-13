import { useEffect, useRef, useState } from 'react';
import type { AktionsDialog, AktionsErgebnis, AktionsSchritt, AngeboteneAktion, DialogFeld } from '../../../shared/src/paketaktionen';
import { api, ApiFehler, type MappeDetails } from '../api';
import { Feld, FeldGruppe, HakenFeld, Knopf, KnopfLink, fehlerText } from '../bausteine';
import { Link } from '../ort';
import { Symbol } from '../Symbol';
import { t } from '../sprache';

/**
 * Aktion eines Pakets im Menü „Mappe“ (#1039): Ablago ruft das Paket auf und zeigt, was es als Daten beschreibt –
 * einen Dialog aus den Bausteinen (Text, Auswahl, Haken, Textfeld, Datum) oder das Ergebnis. Nie HTML aus dem Paket:
 * Texte stehen als Text da. Der Kopf nennt immer das Paket („Aktion von Verträge“), und das Blatt sieht anders aus als
 * Ablagos eigene Rückfragen (Ergänzung Sicherheit) – so kann kein Paket „Bitte melde dich erneut an“ vortäuschen.
 *
 * Kern-Dialoge (`dms:vorlage`) zeigt die Mappe selbst; dafür meldet `kern` den Lauf zurück.
 */
export function PaketAktion({ aktion, details, neuLaden, kern, schliessen }: {
  aktion: AngeboteneAktion; details: MappeDetails; neuLaden: () => Promise<void>;
  kern(s: Extract<AktionsSchritt, { kern: string }>): void; schliessen(): void;
}) {
  const mappe = details.mappe;
  const [schritt, setSchritt] = useState<AktionsSchritt | null>(null);
  const [fehler, setFehler] = useState<string>();
  const offen = useRef<string | null>(null);
  useEffect(() => {
    let aktuell = true;
    api.paketAktionStarten(mappe.id, aktion.paket.id, aktion.schluessel).then((s) => {
      if (!aktuell) { if (!('ergebnis' in s)) void api.paketAktionAbbrechen(s.lauf).catch(() => {}); return; }
      if ('kern' in s) { kern(s); return; }
      offen.current = 'dialog' in s ? s.lauf : null;
      setSchritt(s);
      if ('ergebnis' in s) void neuLaden();
    }, (e: unknown) => aktuell && setFehler(fehlerText(e)));
    return () => { aktuell = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- einmal je geöffneter Aktion; kern und neuLaden ändern daran nichts
  }, [mappe.id, aktion.paket.id, aktion.schluessel]);
  // Dialog geschlossen: Lauf beenden, damit die Bremse frei wird.
  useEffect(() => () => { if (offen.current) void api.paketAktionAbbrechen(offen.current).catch(() => {}); }, []);

  const weiter = async (antworten: Record<string, unknown>) => {
    if (!schritt) return;
    const s = await api.paketAktionWeiter(schritt.lauf, antworten);
    offen.current = 'dialog' in s ? s.lauf : null;
    setSchritt(s);
    if ('ergebnis' in s) await neuLaden();
  };

  const titel = schritt && 'dialog' in schritt && schritt.dialog.titel ? schritt.dialog.titel : aktion.name;
  return (
    <section className="blatt paketdialog" aria-label={t('ablage.paketaktion.von', { paket: aktion.paket.name })} data-anker="mappe.paketaktion">
      <div className="blattkopf zeile-zwischen">
        <div>
          <p className="paketdialog-kopf"><Symbol name="paket" /> {t('ablage.paketaktion.von', { paket: aktion.paket.name })}</p>
          <h2 className="h3">{titel}</h2>
        </div>
        <Knopf art="link" onClick={schliessen}>{t('ablage.aktionen.schliessen')}</Knopf>
      </div>
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      {!schritt && !fehler && <p className="leise" role="status">{t('ablage.paketaktion.arbeitet', { paket: aktion.paket.name })}</p>}
      {schritt && 'dialog' in schritt && <Dialog key={`${schritt.lauf}-${schritt.schritt}`} dialog={schritt.dialog} absenden={weiter} />}
      {schritt && 'ergebnis' in schritt && <Ergebnis ergebnis={schritt.ergebnis} lauf={schritt.lauf} mappe={mappe} />}
      <p className="leise klein">{t('ablage.paketaktion.hinweis', { paket: aktion.paket.name })}</p>
    </section>
  );
}

/** Ein Dialog aus der Beschreibung des Pakets – nur Bausteine, Texte als Text, Hauptknopf unten. */
function Dialog({ dialog, absenden }: { dialog: AktionsDialog; absenden(w: Record<string, unknown>): Promise<void> }) {
  const [werte, setWerte] = useState<Record<string, unknown>>(() => Object.fromEntries(dialog.felder.filter((f) => f.schluessel).map((f) => [f.schluessel!, f.standard ?? (f.art === 'haken' ? false : f.mehrfach ? [] : '')])));
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const setze = (k: string, v: unknown) => setWerte((w) => ({ ...w, [k]: v }));
  const los = async () => {
    setFeldFehler({});
    try { await absenden(werte); } catch (e) {
      const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) setFeldFehler(Object.fromEntries(Object.entries(ff).map(([k, v]) => [k, t.frei(`ablage.paketaktion.fehler.${v}`)])));
      throw e;
    }
  };
  return (
    <form className="stapel" onSubmit={(e) => e.preventDefault()}>
      {dialog.felder.map((f, i) => <Eingabe key={f.schluessel ?? `text-${i}`} f={f} wert={f.schluessel ? werte[f.schluessel] : undefined} setze={(v) => f.schluessel && setze(f.schluessel, v)} fehler={f.schluessel ? feldFehler[f.schluessel] : undefined} />)}
      <div className="knoepfe">
        {/* Gefahr (#1210, Leitsatz 5): Ein Schritt, den das Paket als gefährlich meldet, fragt vorher nach. */}
        {dialog.gefahr
          ? <Knopf art="gefahr" symbol="warnung" onClick={los} rueckfrage={{ titel: t('ablage.paketaktion.gefahr.titel', { knopf: dialog.knopf || t('ablage.paketaktion.weiter') }), text: t('ablage.paketaktion.gefahr.text'), ja: dialog.knopf || t('ablage.paketaktion.weiter') }}>{dialog.knopf || t('ablage.paketaktion.weiter')}</Knopf>
          : <Knopf art="haupt" type="submit" onClick={los}>{dialog.knopf || t('ablage.paketaktion.weiter')}</Knopf>}
      </div>
    </form>
  );
}

function Eingabe({ f, wert, setze, fehler }: { f: DialogFeld; wert: unknown; setze(v: unknown): void; fehler?: string }) {
  if (f.art === 'text') return <p className="paketdialog-text">{f.text}</p>;
  const optional = !f.pflicht;
  if (f.art === 'haken') return (
    <HakenFeld beschriftung={f.name} hinweis={f.hilfe} fehler={fehler}>
      <input type="checkbox" checked={wert === true} onChange={(e) => setze(e.target.checked)} />
    </HakenFeld>
  );
  if (f.art === 'auswahl' && f.mehrfach) {
    const l = Array.isArray(wert) ? wert.map(String) : [];
    return (
      <FeldGruppe beschriftung={f.name} optional={optional} hinweis={f.hilfe} fehler={fehler}>
        {(f.optionen ?? []).map((o) => (
          <label key={o.wert} className="haken klein"><input type="checkbox" checked={l.includes(o.wert)} onChange={(e) => setze(e.target.checked ? [...l, o.wert] : l.filter((x) => x !== o.wert))} /><span>{o.name}</span></label>
        ))}
      </FeldGruppe>
    );
  }
  return (
    <Feld beschriftung={f.name} optional={optional} hinweis={f.hilfe} fehler={fehler}>
      {(v) => f.art === 'auswahl' ? (
        <select {...v} value={String(wert ?? '')} onChange={(e) => setze(e.target.value)}>
          <option value="">{t('ablage.paketaktion.keine-auswahl')}</option>
          {(f.optionen ?? []).map((o) => <option key={o.wert} value={o.wert}>{o.name}</option>)}
        </select>
      ) : f.art === 'datum' ? <input {...v} type="date" value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />
        : <input {...v} type="text" autoComplete="off" value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />}
    </Feld>
  );
}

/** Ergebnis mit nächstem Schritt (B2): Dokument öffnen, Datei herunterladen, angelegte Mappen. */
function Ergebnis({ ergebnis, lauf, mappe }: { ergebnis: AktionsErgebnis; lauf: string; mappe: MappeDetails['mappe'] }) {
  return (
    <div className="hinweis gut" role="status">
      <p>{ergebnis.meldung}</p>
      {!!ergebnis.geaendert?.length && <p className="klein">{t('ablage.paketaktion.geaendert', { felder: ergebnis.geaendert.join(', ') })}</p>}
      {!!ergebnis.mappen?.length && (
        <ul className="klein">{ergebnis.mappen.map((m) => <li key={m.id}><Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{m.titel || t('ablage.paketaktion.ohne-titel')}</Link></li>)}</ul>
      )}
      <div className="knoepfe">
        {ergebnis.dokument && <KnopfLink art="haupt" to={`/ablage/${mappe.typId}/${mappe.id}?dokument=${encodeURIComponent(ergebnis.dokument.id)}`}>{t('ablage.paketaktion.dokument-oeffnen')}</KnopfLink>}
        {ergebnis.datei && <Knopf art="haupt" onClick={() => api.paketAktionDatei(lauf, ergebnis.datei!.name)}>{t('ablage.paketaktion.herunterladen', { name: ergebnis.datei.name })}</Knopf>}
      </div>
    </div>
  );
}
