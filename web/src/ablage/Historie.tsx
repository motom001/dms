import { useEffect, useState, type ReactNode } from 'react';
import { AUFGABENARTEN, HISTORIENARTEN, type Aufgabenart, type Feldaenderung, type Historieneintrag } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Person } from '../Person';
import { Formatiert } from './Formatiert';

/** Änderungshistorie einer Mappe (#57): je Eintrag eine Zeile, Einzelheiten zum Aufklappen (#80). */
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function kurz(e: Historieneintrag): string {
  const d = e.daten;
  if (d.aenderungen?.length) return d.aenderungen.map((a) => a.label).join(', ');
  if (e.art === 'post_geteilt' && typeof d.text === 'string') return d.text;
  if (d.dokument) return d.dokument;
  if (d.feld) return d.feld;
  if (typeof d.text === 'string') return d.text;
  return '';
}

/** Einzelheiten eines Eintrags und ein kurzer Hinweis, wie viel dahintersteckt; null = nichts aufzuklappen. */
function einzelheiten(e: Historieneintrag, emailTyp: string | undefined): { hinweis: string; inhalt: ReactNode } | null {
  const d = e.daten;
  if (d.aenderungen?.length) {
    const n = d.aenderungen.length;
    return {
      hinweis: `${n} ${n === 1 ? 'Feld' : 'Felder'}`,
      inhalt: (
        <table className="aenderungen">
          <thead><tr><th>Feld</th><th>vorher</th><th>nachher</th></tr></thead>
          <tbody>{d.aenderungen.map((a: Feldaenderung) => (
            <tr key={a.feld}><td>{a.label}</td>{a.geheim ? <td colSpan={2} className="leise">geändert (Passwort, ohne Werte)</td> : <><td className={a.alt ? '' : 'leise'}>{a.alt || '–'}</td><td className={a.neu ? '' : 'leise'}>{a.neu || '–'}</td></>}</tr>
          ))}</tbody>
        </table>
      ),
    };
  }
  switch (e.art) {
    case 'notiz': {
      const alt = str(d.alt), neu = str(d.neu), voll = str(d.voll);
      if (alt !== undefined && neu !== undefined) return {
        hinweis: 'vorher/nachher',
        inhalt: <div className="vergleich"><div><p className="leise klein">vorher</p><Formatiert text={alt} /></div><div><p className="leise klein">nachher</p><Formatiert text={neu} /></div></div>,
      };
      if (voll) return { hinweis: 'ganze Notiz', inhalt: <div className="einzeln"><Formatiert text={voll} /></div> };
      return null;
    }
    case 'email': {
      const an = Array.isArray(d.an) ? (d.an as string[]) : undefined;
      if (!an) return null;
      const anhaenge = Array.isArray(d.anhaenge) ? (d.anhaenge as Array<{ name: string; groesse: number }>) : [];
      return {
        hinweis: anhaenge.length ? `${anhaenge.length} ${anhaenge.length === 1 ? 'Anhang' : 'Anhänge'}` : 'Einzelheiten',
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>An</dt><dd>{an.join(', ')}</dd>
            <dt>Betreff</dt><dd>{str(d.betreff)}</dd>
            {str(d.nachricht) && <><dt>Nachricht</dt><dd className="mehrzeilig">{str(d.nachricht)}</dd></>}
            {anhaenge.length > 0 && <><dt>Anhänge</dt><dd>{anhaenge.map((x) => `${x.name} (${groesse(x.groesse)})`).join(', ')}</dd></>}
            {emailTyp && str(d.email) && <><dt>E-Mail</dt><dd><Link to={`/ablage/${emailTyp}/${str(d.email)}`} className="verweis">als Mappe öffnen</Link></dd></>}
          </dl>
        ),
      };
    }
    case 'uebernommen': {
      // Eingangskanal (#195): gleicher Inhalt wie in anderen Mappen.
      // Seit #333 nur noch die Anzahl (Titel fremder Mappen bleiben verborgen); die Fundstellen zeigt „Zuordnen“.
      if (typeof d.doppelt === 'number' && d.doppelt > 0) return { hinweis: 'doppelt', inhalt: <p>Diese Datei liegt schon im DMS – beim Zuordnen stehen die Mappen, die du sehen darfst.</p> };
      const gleich = Array.isArray(d.gleicherInhalt) ? (d.gleicherInhalt as Array<{ mappeId: string; titel: string; name: string }>) : [];
      if (!gleich.length) return null;
      return {
        hinweis: 'gleicher Inhalt',
        inhalt: <ul className="einzeln">{gleich.map((g) => <li key={g.mappeId}>gleicher Inhalt wie „{g.name}“ in <Link to={`/ablage/eingang/${g.mappeId}`} className="verweis">{g.titel || 'Mappe'}</Link></li>)}</ul>,
      };
    }
    case 'zugeordnet': {
      // Post (#192): Link zur Zielmappe bzw. zur Post.
      const ziel = str(d.ziel) ?? str(d.post);
      const typ = str(d.zielTyp) ?? str(d.postTyp);
      if (!ziel || !typ) return null;
      return { hinweis: 'öffnen', inhalt: <p className="einzeln"><Link to={`/ablage/${typ}/${ziel}`} className="verweis">{str(d.ziel) ? 'Mappe öffnen' : 'Post öffnen'}</Link></p> };
    }
    case 'aufgabe': {
      const text = str(d.aufgabentext);
      if (!text) return null;
      const art = str(d.aufgabenart) as Aufgabenart | undefined;
      return {
        hinweis: 'Aufgabe',
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Aufgabe</dt><dd className="mehrzeilig">{text}</dd>
            {art && AUFGABENARTEN[art] && <><dt>Art</dt><dd>{AUFGABENARTEN[art]}</dd></>}
            {d.fuer !== undefined && <><dt>Für</dt><dd>{d.fuer ? <Person id={str(d.fuer)} /> : 'Administratoren'}</dd></>}
            {d.anId !== undefined && <><dt>Weitergegeben</dt><dd>{d.vonId ? <Person id={str(d.vonId)} /> : 'Administratoren'} → <Person id={str(d.anId)} /></dd></>}
          </dl>
        ),
      };
    }
    case 'dokument_version': {
      // Versionierung (#194): „Version 3 von Kassenbon gespeichert (ersetzt Kassenbon.jpg)“, „Version 1 zurückgeholt“.
      const nr = typeof d.version === 'number' ? d.version : null;
      return {
        hinweis: typeof d.zurueckgeholt === 'number' ? `Version ${d.zurueckgeholt} zurückgeholt` : `Version ${nr ?? '?'}`,
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Datei</dt><dd>{d.dokument}{str(d.vorher) && str(d.vorher) !== d.dokument && <> (ersetzt {str(d.vorher)})</>}</dd>
            {nr && <><dt>Version</dt><dd>{nr}{typeof d.zurueckgeholt === 'number' && <> – Version {d.zurueckgeholt} zurückgeholt</>}</dd></>}
            {typeof d.groesse === 'number' && <><dt>Größe</dt><dd>{groesse(d.groesse)}</dd></>}
            {str(d.register) && <><dt>Register</dt><dd>{str(d.register)}</dd></>}
          </dl>
        ),
      };
    }
    case 'dokument_hochgeladen': case 'dokument_geloescht': case 'dokument_papierkorb': {
      if (typeof d.groesse !== 'number') return null;
      return {
        hinweis: groesse(d.groesse),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Datei</dt><dd>{d.dokument}</dd>
            <dt>Größe</dt><dd>{groesse(d.groesse)}</dd>
            {str(d.verkleinert) && <><dt>Verkleinert</dt><dd>{str(d.verkleinert)}</dd></>}
            {str(d.mime) && <><dt>Typ</dt><dd>{str(d.mime)}</dd></>}
            {str(d.register) && <><dt>Register</dt><dd>{str(d.register)}</dd></>}
          </dl>
        ),
      };
    }
    case 'pdf_bearbeitet': {
      // PDF bearbeiten (#335): was geändert wurde bzw. was zusammengefügt wurde.
      const quellen = Array.isArray(d.zusammengefuegt) ? (d.zusammengefuegt as string[]) : [];
      return {
        hinweis: quellen.length ? `${quellen.length} zusammengefügt` : 'Einzelheiten',
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Datei</dt><dd>{d.dokument}</dd>
            {str(d.text) && <><dt>Was</dt><dd>{str(d.text)}</dd></>}
            {typeof d.seiten === 'number' && <><dt>Seiten</dt><dd>{typeof d.vorher === 'number' && d.vorher !== d.seiten ? `${d.vorher} → ` : ''}{d.seiten}</dd></>}
            {quellen.length > 0 && <><dt>Aus</dt><dd>{quellen.join(', ')}</dd></>}
          </dl>
        ),
      };
    }
    case 'geschwaerzt': {
      // Schwärzen (#392): nur Zahlen – die Suchbegriffe und der geschwärzte Text stehen nirgends.
      return {
        hinweis: typeof d.stellen === 'number' ? `${d.stellen} ${d.stellen === 1 ? 'Stelle' : 'Stellen'}` : 'Einzelheiten',
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Datei</dt><dd>{d.dokument}</dd>
            {str(d.quelle) && <><dt>Aus</dt><dd>{str(d.quelle)}</dd></>}
            {typeof d.version === 'number' && <><dt>Version</dt><dd>{d.version}</dd></>}
            {str(d.text) && <><dt>Was</dt><dd>{str(d.text)}</dd></>}
          </dl>
        ),
      };
    }
    case 'auskunft': {
      // Auskunft nach Art. 15 DSGVO (#396): nur Zahlen, keine Inhalte; Begründungen für zurückgehaltene Notizen.
      const n = (k: string) => (typeof d[k] === 'number' ? d[k] as number : 0);
      // Zustellen (#455): per E-Mail, Abruf-Link, Abruf – Zeitpunkt und Ergebnis, ohne IP und ohne Code.
      const zustellung = str(d.zustellung);
      if (zustellung) {
        const an = Array.isArray(d.an) ? (d.an as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        const wie = zustellung === 'email' ? 'per E-Mail (verschlüsselt)' : zustellung === 'link' ? 'Abruf-Link' : 'Abruf über den Link';
        return {
          hinweis: str(d.text) ?? wie,
          inhalt: (
            <dl className="eigenschaften einzeln">
              <dt>Weg</dt><dd>{wie}</dd>
              {an.length > 0 && <><dt>An</dt><dd>{an.join(', ')}</dd></>}
              {typeof d.erfolg === 'boolean' && <><dt>Ergebnis</dt><dd>{d.erfolg ? 'erfolgreich' : 'fehlgeschlagen'}</dd></>}
              {str(d.ablauf) && <><dt>Gültig bis</dt><dd>{new Date(str(d.ablauf)!).toLocaleDateString('de-DE')}</dd></>}
              {n('maxAbrufe') > 0 && <><dt>Abrufe</dt><dd>höchstens {n('maxAbrufe')}</dd></>}
            </dl>
          ),
        };
      }
      const gruende = Array.isArray(d.gruende) ? (d.gruende as unknown[]).filter((g): g is string => typeof g === 'string') : [];
      return {
        hinweis: `${n('mappen')} Mappen, ${n('dokumente')} Dokumente`,
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>Mappen</dt><dd>{n('mappen')}</dd><dt>Dokumente</dt><dd>{n('dokumente')}</dd>
            <dt>Notizen</dt><dd>{n('notizen')}{n('ohneNotizen') ? `, ${n('ohneNotizen')} zurückgehalten` : ''}</dd>
            <dt>Historie</dt><dd>von {n('historie')} {n('historie') === 1 ? 'Mappe' : 'Mappen'}</dd>
            <dt>Passwort</dt><dd>{d.verschluesselt ? 'ja (AES-256)' : 'nein'}</dd>
            {gruende.length > 0 && <><dt>Zurückgehalten, weil</dt><dd><ul className="einzeln">{gruende.map((g, i) => <li key={i}>{g}</li>)}</ul></dd></>}
          </dl>
        ),
      };
    }
    case 'volltext': {
      // Texterkennung als Paket (#338): welches Paket den Volltext geschrieben hat.
      return { hinweis: str(d.dokument) ?? 'Volltext', inhalt: <dl className="eigenschaften einzeln"><dt>Datei</dt><dd>{str(d.dokument)}</dd>{str(d.text) && <><dt>Von</dt><dd>{str(d.text)}</dd></>}</dl> };
    }
    case 'post_geteilt': {
      const typ = str(d.postTyp);
      const posten = Array.isArray(d.posten) ? (d.posten as string[]) : [];
      if (!typ) return null;
      if (posten.length) return { hinweis: `${posten.length} Posts`, inhalt: <ul className="einzeln">{posten.map((id, i) => <li key={id}><Link to={`/ablage/${typ}/${id}`} className="verweis">Teil {i + 1} öffnen</Link></li>)}</ul> };
      if (str(d.post)) return { hinweis: 'öffnen', inhalt: <p className="einzeln"><Link to={`/ablage/${typ}/${str(d.post)}`} className="verweis">Ausgangspost öffnen</Link></p> };
      return null;
    }
    case 'wiederhergestellt': {
      const n = typeof d.verweiseEntfallen === 'number' ? d.verweiseEntfallen : 0;
      if (!n) return null;
      return { hinweis: `${n} ${n === 1 ? 'Verweis entfallen' : 'Verweise entfallen'}`, inhalt: <p className="einzeln leise">{n === 1 ? 'Ein Verweis zeigte auf eine Mappe, die es nicht mehr gibt, und ist entfallen.' : `${n} Verweise zeigten auf Mappen, die es nicht mehr gibt, und sind entfallen.`}</p> };
    }
    default: return null;
  }
}

export function Historie({ mappeId, stand }: { mappeId: string; stand?: string }) {
  const d = useDaten();
  const [liste, setListe] = useState<Historieneintrag[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [alleOffen, setAlleOffen] = useState<boolean | null>(null);
  const emailTyp = d.typen.find((t) => t.system === 'post')?.id;
  useEffect(() => {
    api.historie(mappeId).then((h) => { setListe(h); setFehler(undefined); }, (e: Error) => setFehler(e.message));
  }, [mappeId, stand]);
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!liste) return <p className="leise">Lade …</p>;
  if (!liste.length) return <p className="leise">Noch keine Einträge. Die Historie beginnt mit Version 0.12; ältere Änderungen sind nicht erfasst.</p>;
  const mitEinzelheiten = liste.map((e) => ({ e, x: einzelheiten(e, emailTyp) }));
  const aufklappbar = mitEinzelheiten.some(({ x }) => x);
  return (
    <>
      {aufklappbar && (
        <div className="historie-kopf">
          <button type="button" className="textknopf" onClick={() => setAlleOffen(true)}>Alle aufklappen</button>
          <button type="button" className="textknopf" onClick={() => setAlleOffen(false)}>Alle zuklappen</button>
        </div>
      )}
      <ul className="historie">
        {mitEinzelheiten.map(({ e, x }) => {
          const kopf = (
            <>
              <span className="zeichen" aria-hidden="true" />
              <span className="wann">{zeit(e.zeit)}</span>
              <span className="wer"><Person id={e.benutzerId} ersatz={typeof e.daten.system === 'string' ? e.daten.system : undefined} /></span>
              <span className="was"><strong>{HISTORIENARTEN[e.art] ?? e.art}</strong>{kurz(e) ? `: ${kurz(e)}` : ''}
                {e.art === 'email' && typeof e.daten.email === 'string' && emailTyp && <> · <Link to={`/ablage/${emailTyp}/${e.daten.email}`} className="verweis">öffnen</Link></>}</span>
              {x && <span className="mehr chip">{x.hinweis}</span>}
            </>
          );
          return (
            <li key={e.id}>
              {x
                ? <details open={alleOffen ?? undefined} key={String(alleOffen)}>
                    <summary aria-label={`${HISTORIENARTEN[e.art] ?? e.art}, ${x.hinweis}, aufklappbar`}>{kopf}</summary>
                    <div className="einzelheiten">{x.inhalt}</div>
                  </details>
                : <div className="zeile">{kopf}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
