import { useState, type ReactNode } from 'react';
import { anlageText } from '../../../shared/src/anlagen';
import type { Dokument } from '../../../shared/src/model';
import { api } from '../api';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import s from './Anlagen.module.css';

/**
 * Anlagen (#998) in der Liste der Dokumente: das Kennzeichen „Anlage“, die eingeklappte Zeile unter dem Hauptdokument
 * („Anlage 1 · HU/AU-Protokoll · 2 Seiten“, ein Klick zeigt sie in der Vorschau), „Als Anlage an … hängen“,
 * „Zum eigenen Dokument machen“, umbenennen, nach oben – und „mit Anlagen?“ beim Herunterladen (Vorgabe ja).
 * Rechte wie beim Hauptdokument: Wer die Mappe bearbeiten darf, ändert Anlagen; herunterladen braucht das Exportrecht.
 */

/**
 * Kennzeichen „Anlage“ – überall, wo Dokumente gelistet werden. Die abgeholte E-Mail selbst (#999) trägt stattdessen
 * „Original-E-Mail“, als Anlage wie als Hauptdokument (E-Mail ohne Anhänge).
 */
export function AnlageMarke({ d }: { d: Pick<Dokument, 'anlageZu' | 'originalEmail'> }) {
  if (d.originalEmail) return <span className="chip" title={t('ablage.anlagen.original-email-titel')}>{t('ablage.anlagen.original-email')}</span>;
  if (!d.anlageZu) return null;
  return <span className="chip" title={t('ablage.anlagen.marke-titel')}>{t('ablage.anlagen.marke')}</span>;
}

/**
 * „Anlage 1 · HU/AU-Protokoll · 2 Seiten“. Die Original-E-Mail (#999) zählt nicht als „Anlage n“ – nur ihr Name, das
 * Kennzeichen daneben sagt „Original-E-Mail“.
 */
export function anlageZeilentext(a: Dokument): string {
  const seiten = a.ocr?.seiten ? t('ablage.anlagen.seiten', { anzahl: a.ocr.seiten }) : '';
  return [a.originalEmail ? '' : anlageText(a.anlageNr ?? 1), a.name, seiten].filter(Boolean).join(' · ');
}

/**
 * Eingeklappte Zeile einer Anlage unter ihrem Hauptdokument. `auf` und `umschalten` teilen sich die Vorschau mit den
 * übrigen Dokumenten (eine offen); `vorschau` ist die Anzeige darunter, `herunterladen` der Weg zum Mitnehmen.
 */
export function AnlageZeile({ a, haupt, auf, umschalten, vorschau, herunterladen, bearbeitbar, weg, erste, fertig }: {
  a: Dokument; haupt: Dokument; auf: boolean; umschalten?: () => void; vorschau?: ReactNode; herunterladen?: ReactNode;
  bearbeitbar: boolean; weg: boolean; erste: boolean; fertig(meldung?: string): void | Promise<void>;
}) {
  const [name, setName] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string>();
  async function benenne() {
    if (name === null) return;
    setFehler(undefined);
    try { await api.anlageUmbenennen(haupt.id, a.id, name); setName(null); await fertig(); } catch (x) { setFehler((x as Error).message); }
  }
  return (
    <li className={`${s.zeile} ${auf ? 'an' : ''} ${weg ? 'weg' : ''}`} data-anlage={a.anlageNr ?? undefined}>
      <div className={s.kopf}>
        {umschalten && !weg
          ? <Knopf art="link" className={s.titel} aria-expanded={auf} onClick={umschalten}>{anlageZeilentext(a)}</Knopf>
          : <span className={s.titel}>{anlageZeilentext(a)}</span>}
        <AnlageMarke d={a} />
        {weg && <span className="leise klein">{t('ablage.anlagen.geht-mit')}</span>}
        {!weg && (
          <span className={`${s.aktionen} klein`}>
            {herunterladen}
            {bearbeitbar && !erste && <Knopf art="link" groesse="klein" title={t('ablage.anlagen.nach-oben-titel')} onClick={async () => { await api.anlagenSortieren(haupt.id, nachOben(await api.anlagen(haupt.id), a.id)); await fertig(); }}>{t('ablage.anlagen.nach-oben')}</Knopf>}
            {bearbeitbar && name === null && <Knopf art="link" groesse="klein" onClick={() => setName(a.name)}>{t('ablage.anlagen.umbenennen')}</Knopf>}
            {bearbeitbar && <Knopf art="link" groesse="klein" title={t('ablage.anlagen.loesen-titel')} onClick={async () => { await api.anlageLoesen(haupt.id, a.id); await fertig(t('ablage.anlagen.geloest', { name: a.name })); }}>{t('ablage.anlagen.loesen')}</Knopf>}
          </span>
        )}
      </div>
      {name !== null && (
        <div className={s.form}>
          <Feld beschriftung={t('ablage.anlagen.name')} fehler={fehler}>
            <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void benenne(); } }} />
          </Feld>
          <Knopf art="haupt" groesse="klein" gesperrt={!name.trim()} onClick={benenne}>{t('ablage.anlagen.speichern')}</Knopf>
          <Knopf art="link" groesse="klein" onClick={() => { setName(null); setFehler(undefined); }}>{t('ablage.anlagen.abbrechen')}</Knopf>
        </div>
      )}
      {auf && vorschau}
    </li>
  );
}

/** Reihenfolge mit dieser Anlage eine Stelle weiter vorn. */
function nachOben(stand: { anlagen: Dokument[] }, id: string): string[] {
  const ids = stand.anlagen.map((x) => x.id);
  const i = ids.indexOf(id);
  if (i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
  return ids;
}

/** „Als Anlage an … hängen“: ein anderes Dokument desselben Registers wird das Hauptdokument. */
export function AlsAnlage({ d, ziele, schliessen, fertig }: { d: Dokument; ziele: Dokument[]; schliessen(): void; fertig(meldung?: string): void | Promise<void> }) {
  const [ziel, setZiel] = useState(ziele[0]?.id ?? '');
  const z = ziele.find((x) => x.id === ziel);
  return (
    <div className={s.form} role="group" aria-label={t('ablage.anlagen.als-anlage-titel', { name: d.name })}>
      <Feld beschriftung={t('ablage.anlagen.an-welches')} hinweis={t('ablage.anlagen.an-welches-hinweis')} hilfe="dokumente.anlagen">
        <select value={ziel} onChange={(e) => setZiel(e.target.value)}>
          {ziele.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Feld>
      <Knopf art="haupt" groesse="klein" gesperrt={!z} onClick={async () => { await api.anlageAnhaengen(ziel, d.id); await fertig(t('ablage.anlagen.angehaengt', { name: d.name, haupt: z?.name ?? '' })); }}>{t('ablage.anlagen.anhaengen')}</Knopf>
      <Knopf art="link" groesse="klein" onClick={schliessen}>{t('ablage.anlagen.abbrechen')}</Knopf>
    </div>
  );
}

/**
 * „mit Anlagen?“ beim Herunterladen eines Dokuments mit Anlagen (Vorgabe ja): mit Haken ein ZIP „… mit Anlagen.zip“,
 * ohne der gewohnte Weg (`ohne`, z. B. Original oder Archivfassung).
 */
export function HerunterladenMitAnlagen({ d, anzahl, archiv, ohne }: { d: Dokument; anzahl: number; archiv: boolean; ohne: ReactNode }) {
  const [mit, setMit] = useState(true);
  return (
    <span className={s.mitAnlagen}>
      {mit
        ? <Knopf art="link" onClick={() => api.herunterladenMitAnlagen(d.id, t('ablage.anlagen.zip-name', { name: d.name.replace(/\.[^.]{1,5}$/, '') }), archiv ? 'archiv' : undefined)}>{t('ablage.anlagen.herunterladen')}</Knopf>
        : ohne}
      <HakenFeld beschriftung={t('ablage.anlagen.mit-anlagen', { anzahl })}>
        <input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} />
      </HakenFeld>
      <Hilfe ort="dokumente.anlagen" />
    </span>
  );
}
