import { useEffect, useState } from 'react';
import type { Dokument } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { EMAIL_WARNUNG } from './Aktionen';
import { alsWunsch, stempelFehler, StempelFelder, stempelStart, stempelVon, useStempelVorlagen, type StempelWahl } from './Stempel';
import { VerkleinertWahl } from './VerkleinertWahl';
import type { Stufe } from '../../../shared/src/verkleinern';
import { FassungWahl, hatArchivfassung, type Fassung } from './FassungWahl';
import { t, tn } from '../sprache';
import { gruppiere } from '../../../shared/src/anlagen';
import { AnlageMarke, OriginalEmailWahl } from './Anlagen';

/**
 * Mehrere Mappen per E-Mail (#151): eine E-Mail, je Mappe ihre Angaben als PDF und – wählbar – ihre
 * Dokumente. Gleiche Maske wie an der Mappe (#58).
 */
const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const EMAIL_HOECHSTENS = 50_000_000;
export const EMAIL_MAPPEN_HOECHSTENS = 100;

interface MappeMitDokumenten { id: string; titel: string; typId: string; dokumente: Dokument[] }

export function EmailMehrere({ ids, fertig }: { ids: string[]; fertig(meldung?: string): void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [liste, setListe] = useState<MappeMitDokumenten[] | null>(null);
  const [an, setAn] = useState('');
  const [betreff, setBetreff] = useState('');
  const [nachricht, setNachricht] = useState('');
  const [angaben, setAngaben] = useState(true);
  const [umfang, setUmfang] = useState<'alle' | 'keine' | 'auswahl'>('alle');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<{ id: string; typId: string }>();
  const zuViele = ids.length > EMAIL_MAPPEN_HOECHSTENS;

  useEffect(() => { api.emailBereit().then((r) => setBereit(r.bereit), () => setBereit(false)); }, []);
  useEffect(() => {
    if (zuViele) return;
    let ab = false;
    void (async () => {
      const x: MappeMitDokumenten[] = [];
      for (const id of ids) {
        try { const m = await api.mappe(id); x.push({ id, titel: titelOder(m.mappe.titel), typId: m.mappe.typId, dokumente: m.dokumente }); } catch { /* nicht lesbar: der Server lehnt ab */ }
      }
      if (ab) return;
      setListe(x);
      setGewaehlt(new Set(x.flatMap((m) => m.dokumente.map((y) => y.id))));
      if (x.length === 1) setBetreff(x[0].titel);
    })();
    return () => { ab = true; };
    // Die Auswahl kommt als neues Feld bei jedem Zeichnen; neu laden nur, wenn sie sich ändert.
  }, [ids.join(','), zuViele]); // eslint-disable-line react-hooks/exhaustive-deps -- Auswahl als Text verglichen, siehe Kommentar darüber

  const alleDocs = (liste ?? []).flatMap((m) => m.dokumente);
  // Original-E-Mails (#999) bei „alle Dokumente“: stehen mit Kennzeichen da und lassen sich mit einem Haken abwählen.
  const [eml, setEml] = useState(true);
  const emails = alleDocs.filter((x) => x.originalEmail);
  const docs = umfang === 'alle' ? alleDocs.filter((x) => eml || !x.originalEmail) : umfang === 'keine' ? [] : alleDocs.filter((x) => gewaehlt.has(x.id));
  const summe = docs.reduce((a, x) => a + x.groesse, 0);
  // Verkleinert senden (#393): die Größe danach prüft der Server vor dem Versand.
  const [klein, setKlein] = useState<Stufe | null>(null);
  // Archivfassung oder Original (#715), Vorgabe wie beim Herunterladen.
  const [fassung, setFassung] = useState<Fassung>('archiv');
  const mitPdf = docs.some((x) => x.mime === 'application/pdf' || (fassung === 'archiv' && hatArchivfassung(x)));
  const kleinAn = !!klein && mitPdf;
  const zuGross = summe > EMAIL_HOECHSTENS && !kleinAn;
  // Stempel (#394): je Mappentyp vorgeschlagen oder Pflicht; Pflicht gilt dann für Mappen dieses Typs.
  const vorlagen = useStempelVorlagen();
  const typStempel = liste ? stempelVon(liste.map((m) => d.typ(m.typId))) : null;
  const [stempel, setStempel] = useState<StempelWahl | null>(null);
  useEffect(() => { if (vorlagen && liste && !stempel) setStempel(stempelStart(vorlagen, typStempel)); }, [vorlagen, liste, stempel, typStempel]);
  const stempelProblem = docs.length ? stempelFehler(stempel, an) : null;
  const umschalten = (id: string) => setGewaehlt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function senden() {
    setFehler(undefined); setLaeuft(true);
    try {
      const r = await api.emailMehrere({ ids, an, betreff, nachricht, angaben, dokumente: umfang === 'alle' ? 'alle' : umfang === 'keine' ? [] : [...gewaehlt], mitAnlagen: umfang !== 'auswahl', ...(umfang === 'alle' && !eml ? { originalEmail: false } : {}), stempel: alsWunsch(stempel), verkleinern: kleinAn ? klein : null, fassung });
      setErgebnis(r); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }

  return (
    <section className="exportdialog blatt" role="dialog" aria-label={t('ablage.emailmehrere.per-e-mail-versenden')}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{tn('ablage.emailmehrere.mappen-per-e-mail', { anzahl: ids.length, hilfe: <Hilfe ort="ablage.email" /> })}</h2>
        <button type="button" className="textknopf" onClick={() => fertig(ergebnis ? t('ablage.emailmehrere.die-e-mail-ist') : undefined)}>{t('ablage.emailmehrere.schliessen')}</button></div>
      {ergebnis ? (
        <>
          <p className="gutertext" role="status">{t('ablage.emailmehrere.die-e-mail-ist')}</p>
          <p className="leise">{t('ablage.emailmehrere.sie-ist-als-post', { ids: ids.length })}</p>
          <div className="knoepfe"><Link to={`/ablage/${ergebnis.typId}/${ergebnis.id}`} className="knopf">{t('ablage.emailmehrere.e-mail-oeffnen')}</Link></div>
        </>
      ) : zuViele ? (
        <div className="hinweis warn"><p>{t('ablage.emailmehrere.hoechstens-mappen-in-einer', { EMAIL_MAPPEN_HOECHSTENS })}</p></div>
      ) : bereit === false ? (
        <div className="hinweis warn"><p>{t('ablage.emailmehrere.der-e-mail-versand')}{ich?.rolle === 'admin' ? <> {' '}{tn('ablage.emailmehrere.das-geht-unter', { link: <Link to="/werkbank/betrieb" className="verweis">{t('ablage.emailmehrere.werkbank-e-mail-und')}</Link> })}</> : t('ablage.emailmehrere.bitte-einen-administrator-ihn')}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void senden(); }}>
          <div className="raster">
            <label className="eigenschaft breit"><span>{tn('ablage.emailmehrere.an', { klein: <small>{t('ablage.emailmehrere.mehrere-durch-komma-getrennt')}</small> })}</span><input type="text" inputMode="email" autoComplete="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" required /></label>
            <label className="eigenschaft breit"><span>{t('ablage.emailmehrere.betreff')}</span><input value={betreff} maxLength={250} onChange={(e) => setBetreff(e.target.value)} placeholder={t('ablage.emailmehrere.z-b-belege-2026')} required /></label>
            <label className="eigenschaft breit"><span>{t('ablage.emailmehrere.nachricht')}</span><textarea rows={4} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
          </div>
          <fieldset className="anhaenge">
            <legend>{t('ablage.emailmehrere.anhaenge')}</legend>
            <label className="haken"><input type="checkbox" checked={angaben} onChange={(e) => setAngaben(e.target.checked)} /><span>{tn('ablage.emailmehrere.angaben-je-mappe-als', { klein: <small className="leise">{t('ablage.emailmehrere.titel-pdf-mit-allen')}</small> })}</span></label>
            <fieldset className="wahl"><legend className="klein">{t('ablage.emailmehrere.dokumente')}</legend>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'alle'} onChange={() => setUmfang('alle')} /><span>{t('ablage.emailmehrere.alle-dokumente-der-mappen', { wert: liste ? ` (${alleDocs.length})` : '' })}</span></label>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')} /><span>{t('ablage.emailmehrere.auswaehlen')}</span></label>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'keine'} onChange={() => setUmfang('keine')} /><span>{t('ablage.emailmehrere.keine-dokumente')}</span></label>
            </fieldset>
            {umfang === 'alle' && <OriginalEmailWahl emails={emails} an={eml} setze={setEml} />}
            {umfang === 'auswahl' && (liste === null ? <p className="leise klein">{t('ablage.emailmehrere.lade-dokumente')}</p> : (
              <ul className="emailmappen">
                {liste.map((m) => (
                  <li key={m.id}><strong className="klein">{m.titel}</strong>
                    {!m.dokumente.length ? <p className="leise klein">{t('ablage.emailmehrere.keine-dokumente-2')}</p> : <ul>{gruppiere(m.dokumente).flatMap((g) => [g.haupt, ...g.anlagen]).map((x) => (
                      <li key={x.id} className={x.anlageZu ? 'eingerueckt' : undefined}><label className="haken"><input type="checkbox" checked={gewaehlt.has(x.id)} onChange={() => umschalten(x.id)} /><span>{x.name} <AnlageMarke d={x} /> <small className="leise">{groesse(x.groesse)}</small></span></label></li>
                    ))}</ul>}
                  </li>
                ))}
              </ul>
            ))}
            {docs.length > 0 && stempel && vorlagen && <StempelFelder wahl={stempel} setze={setStempel} vorlagen={vorlagen} empfaengerErsatz={an.trim() || t('ablage.emailmehrere.die-adressen-unter-an')} id="emails-stempel" />}
            {docs.length > 0 && typStempel?.modus === 'pflicht' && <p className="leise klein">{t('ablage.emailmehrere.mappen-deren-mappentyp-einen')}</p>}
            {docs.length > 0 && <FassungWahl wert={fassung} setze={setFassung} dokumente={docs} id="emails-fassung" />}
            {mitPdf && <VerkleinertWahl wert={klein} setze={setKlein} id="emails-verkleinert" />}
            {liste && <p className={`klein ${summe > EMAIL_WARNUNG && !kleinAn ? 'fehlertext' : 'leise'}`}>
              {t('ablage.emailmehrere.dokumente-zusammen', { groesse: groesse(summe), wert: kleinAn ? t('ablage.emailmehrere.vor-dem-verkleinern') : '', wert2: angaben ? t('ablage.emailmehrere.dazu-kleine-pdfs-mit', { ids: ids.length }) : '', wert3: zuGross ? t('ablage.emailmehrere.das-ist-zu-gross') : summe > EMAIL_WARNUNG && !kleinAn ? t('ablage.emailmehrere.viele-mailserver-nehmen-e', { wert: mitPdf ? t('ablage.emailmehrere.tipp-pdfs-verkleinert-senden') : '' }) : '' })}</p>}
          </fieldset>
          <p className="leise klein">{t('ablage.emailmehrere.eine-e-mail-an', { email: ich?.email })}</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          {stempelProblem && <p className="leise klein">{stempelProblem}</p>}
          <div className="knoepfe">
            <button type="button" className="knopf" onClick={() => fertig()}>{t('ablage.emailmehrere.abbrechen')}</button>
            <button className="knopf primaer" disabled={laeuft || bereit === null || !liste || !an.trim() || !betreff.trim() || zuGross || !!stempelProblem}>{laeuft ? t('ablage.emailmehrere.wird-verschickt') : t('ablage.emailmehrere.senden')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
