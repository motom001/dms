import { t, tn } from '../../sprache';
import { AUFGABENARTEN, type Aufgabenart, type Feldaenderung, type Historieneintrag, type Mappentyp } from '../../../../shared/src/model';
import { Link } from '../../ort';
import { Person } from '../../Person';
import { Formatiert } from '../Formatiert';
import { beschrifte, groesse, str, type Einzelheiten } from './hilfen';

/** Geänderte Felder (#57): vorher und nachher je Feld, dazu der Anlass. */
export function aenderungenTabelle(e: Historieneintrag, typ?: Pick<Mappentyp, 'felder'>): Einzelheiten {
  const d = e.daten;
  const aenderungen = d.aenderungen ?? [];
  const n = aenderungen.length;
  return {
    hinweis: t('ablage.historie.felder', { anzahl: n }),
    inhalt: (
      <>
        {/* Anlass, z. B. die Umwandlung nach einem Paket-Update (#534). */}
        {str(d.text) && <p className="leise klein">{str(d.text)}</p>}
        <table className="aenderungen">
          <thead>
            <tr>
              <th>{t('ablage.historie.feld')}</th>
              <th>{t('ablage.historie.vorher')}</th>
              <th>{t('ablage.historie.nachher')}</th>
            </tr>
          </thead>
          <tbody>
            {aenderungen.map((a: Feldaenderung) => (
              <tr key={a.feld}>
                <td>{beschrifte(a, typ)}</td>
                {a.geheim ? (
                  <td colSpan={2} className="leise">
                    {t('ablage.historie.geaendert-passwort-ohne-werte')}
                  </td>
                ) : (
                  <>
                    <td className={a.alt ? '' : 'leise'}>{a.alt || '–'}</td>
                    <td className={a.neu ? '' : 'leise'}>{a.neu || '–'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  };
}

export function notiz(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const alt = str(d.alt),
    neu = str(d.neu),
    voll = str(d.voll);
  if (alt !== undefined && neu !== undefined)
    return {
      hinweis: t('ablage.historie.vorher-nachher'),
      inhalt: (
        <div className="vergleich">
          <div>
            <p className="leise klein">{t('ablage.historie.vorher')}</p>
            <Formatiert text={alt} />
          </div>
          <div>
            <p className="leise klein">{t('ablage.historie.nachher')}</p>
            <Formatiert text={neu} />
          </div>
        </div>
      ),
    };
  if (voll)
    return {
      hinweis: t('ablage.historie.ganze-notiz'),
      inhalt: (
        <div className="einzeln">
          <Formatiert text={voll} />
        </div>
      ),
    };
  return null;
}

export function email(e: Historieneintrag, emailTyp: string | undefined): Einzelheiten {
  const d = e.daten;
  const an = Array.isArray(d.an) ? (d.an as string[]) : undefined;
  if (!an) return null;
  const anhaenge = Array.isArray(d.anhaenge) ? (d.anhaenge as Array<{ name: string; groesse: number }>) : [];
  return {
    hinweis: anhaenge.length ? t('ablage.historie.anhaenge', { anzahl: anhaenge.length }) : t('ablage.historie.einzelheiten'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.an')}</dt>
        <dd>{an.join(', ')}</dd>
        <dt>{t('ablage.historie.betreff')}</dt>
        <dd>{str(d.betreff)}</dd>
        {str(d.nachricht) && (
          <>
            <dt>{t('ablage.historie.nachricht')}</dt>
            <dd className="mehrzeilig">{str(d.nachricht)}</dd>
          </>
        )}
        {anhaenge.length > 0 && (
          <>
            <dt>{t('ablage.historie.anhaenge-2')}</dt>
            <dd>{anhaenge.map((x) => `${x.name} (${groesse(x.groesse)})`).join(', ')}</dd>
          </>
        )}
        {emailTyp && str(d.email) && (
          <>
            <dt>{t('ablage.historie.e-mail')}</dt>
            <dd>
              <Link to={`/ablage/${emailTyp}/${str(d.email)}`} className="verweis">
                {t('ablage.historie.als-mappe-oeffnen')}
              </Link>
            </dd>
          </>
        )}
      </dl>
    ),
  };
}

export function uebernommen(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  // Eingangskanal (#195): gleicher Inhalt wie in anderen Mappen.
  // Seit #333 nur noch die Anzahl (Titel fremder Mappen bleiben verborgen); die Fundstellen zeigt „Zuordnen“.
  if (typeof d.doppelt === 'number' && d.doppelt > 0)
    return { hinweis: t('ablage.historie.doppelt'), inhalt: <p>{t('ablage.historie.diese-datei-liegt-schon')}</p> };
  const gleich = Array.isArray(d.gleicherInhalt) ? (d.gleicherInhalt as Array<{ mappeId: string; titel: string; name: string }>) : [];
  if (!gleich.length) return null;
  return {
    hinweis: t('ablage.historie.gleicher-inhalt'),
    inhalt: (
      <ul className="einzeln">
        {gleich.map((g) => (
          <li key={g.mappeId}>
            {tn('ablage.historie.gleicher-inhalt-wie-in', {
              name: g.name,
              link: (
                <Link to={`/ablage/eingang/${g.mappeId}`} className="verweis">
                  {g.titel || t('ablage.historie.mappe')}
                </Link>
              ),
            })}
          </li>
        ))}
      </ul>
    ),
  };
}

export function zugeordnet(e: Historieneintrag, emailTyp: string | undefined): Einzelheiten {
  const d = e.daten;
  // Post (#192): Link zur Zielmappe bzw. zur Post. Aufgelöst mit abgetrenntem Teil (#936, #1010): dazu der Link
  // zur neuen Post; sie hat den Typ der aufgelösten Post.
  const ziel = str(d.ziel) ?? str(d.post);
  const typ = str(d.zielTyp) ?? str(d.postTyp);
  const abgetrennt = d.aufgeloest === true ? str(d.abgetrennt) : undefined;
  const abgetrenntTyp = str(d.postTyp) ?? emailTyp;
  const links: { zu: string; text: string }[] = [];
  if (ziel && typ)
    links.push({
      zu: `/ablage/${typ}/${ziel}`,
      text: str(d.ziel) ? t('ablage.historie.mappe-oeffnen') : t('ablage.historie.post-oeffnen'),
    });
  if (abgetrennt && abgetrenntTyp)
    links.push({ zu: `/ablage/${abgetrenntTyp}/${abgetrennt}`, text: t('ablage.historie.abgetrennte-post-oeffnen') });
  if (!links.length) return null;
  return {
    hinweis: t('ablage.historie.oeffnen-2'),
    inhalt: (
      <ul className="einzeln">
        {links.map((l) => (
          <li key={l.zu}>
            <Link to={l.zu} className="verweis">
              {l.text}
            </Link>
          </li>
        ))}
      </ul>
    ),
  };
}

export function aufgabe(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const text = str(d.aufgabentext);
  if (!text) return null;
  const art = str(d.aufgabenart) as Aufgabenart | undefined;
  return {
    hinweis: t('ablage.historie.aufgabe'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.aufgabe')}</dt>
        <dd className="mehrzeilig">{text}</dd>
        {art && AUFGABENARTEN[art] && (
          <>
            <dt>{t('ablage.historie.art')}</dt>
            <dd>{AUFGABENARTEN[art]}</dd>
          </>
        )}
        {d.fuer !== undefined && (
          <>
            <dt>{t('ablage.historie.fuer')}</dt>
            <dd>{d.fuer ? <Person id={str(d.fuer)} /> : t('konten.verwaltende.ohneEmpfaenger')}</dd>
          </>
        )}
        {d.anId !== undefined && (
          <>
            <dt>{t('ablage.historie.weitergegeben')}</dt>
            <dd>
              {d.vonId ? <Person id={str(d.vonId)} /> : t('konten.verwaltende.ohneEmpfaenger')} → <Person id={str(d.anId)} />
            </dd>
          </>
        )}
      </dl>
    ),
  };
}

export function postGeteilt(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const typ = str(d.postTyp);
  const posten = Array.isArray(d.posten) ? (d.posten as string[]) : [];
  // Abgetrennt beim Auflösen (#936): Die Ausgangspost liegt im Papierkorb – der Link führt zur Mappe, die aus ihr wurde.
  if (str(d.ziel) && str(d.zielTyp)) return einLink(`/ablage/${str(d.zielTyp)}/${str(d.ziel)}`, t('ablage.historie.mappe-oeffnen'));
  if (!typ) return null;
  // „Ab hier abtrennen“ (#934): Link zur neuen Post mit den abgetrennten Dokumenten.
  if (str(d.abgetrennt)) return einLink(`/ablage/${typ}/${str(d.abgetrennt)}`, t('ablage.historie.abgetrennte-post-oeffnen'));
  if (posten.length)
    return {
      hinweis: t('ablage.historie.posts', { posten: posten.length }),
      inhalt: (
        <ul className="einzeln">
          {posten.map((id, i) => (
            <li key={id}>
              <Link to={`/ablage/${typ}/${id}`} className="verweis">
                {t('ablage.historie.teil-oeffnen', { wert: i + 1 })}
              </Link>
            </li>
          ))}
        </ul>
      ),
    };
  if (str(d.post)) return einLink(`/ablage/${typ}/${str(d.post)}`, t('ablage.historie.ausgangspost-oeffnen'));
  return null;
}

/** „öffnen“ mit einem einzelnen Link (Post geteilt). */
const einLink = (zu: string, text: string): Einzelheiten => ({
  hinweis: t('ablage.historie.oeffnen-2'),
  inhalt: (
    <p className="einzeln">
      <Link to={zu} className="verweis">
        {text}
      </Link>
    </p>
  ),
});

export function wiederhergestellt(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const n = typeof d.verweiseEntfallen === 'number' ? d.verweiseEntfallen : 0;
  if (!n) return null;
  return {
    hinweis: t('ablage.historie.verweise-entfallen', { anzahl: n }),
    inhalt: <p className="einzeln leise">{t('ablage.historie.verweise-zeigten-auf-mappen', { anzahl: n })}</p>,
  };
}
