import type { Luecke, Personenbezug, Personenverweis } from '../../../shared/src/loeschkonzept';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';

/** „über „Inhaber“ auf Person“, mehrere mit „und“ (#664). */
export function verweiseText(v: Personenverweis[]) {
  const teile = v.map((x) => t('werkbank.loeschkonzept.verweis', { feld: x.feld, ziel: x.ziel }));
  return teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')} ${t('werkbank.loeschkonzept.und')} ${teile[teile.length - 1]}`;
}

/** Grund als Satzteil nach „weil …“ (#664). */
export function grundSatz(b: Pick<Personenbezug, 'bezug' | 'verweise'>) {
  return b.bezug === 'person' ? t('werkbank.loeschkonzept.grundPerson')
    : b.bezug === 'verweis' ? t('werkbank.loeschkonzept.grundVerweis', { verweise: verweiseText(b.verweise) })
    : t('werkbank.loeschkonzept.grundZweck');
}

/** Springt zum Zweck-Feld eines Mappentyps unter „Personendaten in Mappentypen“ und setzt den Fokus. */
function zumZweck(typId: string) {
  const feld = document.getElementById(`zweck-${typId}`) as HTMLInputElement | null;
  if (!feld) return;
  feld.scrollIntoView({ behavior: 'smooth', block: 'center' });
  feld.focus({ preventScroll: true });
}

/**
 * Werkbank → Löschkonzept (#469, eigener Eintrag seit #668): das Löschkonzept als PDF oder Word-Datei, Abschnitt 2
 * „Datenarten und Fristen“ aus den Mappentypen. Lücken stehen hier – je Mappentyp eine Zeile mit Grund und
 * Knöpfen (#664) – und im Dokument als [Platzhalter].
 */
export function LoeschkonzeptBlatt({ luecken }: { luecken: Luecke[] }) {
  return (
    <section className="blatt" id="loeschkonzept">
      <h2 className="h3">{t('werkbank.loeschkonzept.loeschkonzept')} <Hilfe ort="werkbank.loeschkonzept" /></h2>
      <p className="leise klein">{t('werkbank.loeschkonzept.ablago-fuellt-die-vorlage')}</p>
      <p className="leise klein">{t('werkbank.loeschkonzept.wann')}</p>
      {luecken.length > 0 && (
        <div className="hinweis info stapel" role="region" aria-label={t('werkbank.loeschkonzept.ergaenzen')}>
          <p><strong>{t('werkbank.loeschkonzept.ergaenzen')}</strong> – {t('werkbank.loeschkonzept.fertig')}</p>
          <ul className="stapel loeschkonzept-luecken">{luecken.map((l, i) => (
            <li key={l.typId ?? `${l.art}-${i}`}>
              {l.art === 'typ' ? <>
                <span><strong>{l.typ}</strong>{t('werkbank.loeschkonzept.luecke', {
                  grund: grundSatz(l),
                  fehlt: l.fehlt.map((f) => t(f === 'zweck' ? 'werkbank.loeschkonzept.fehltZweck' : 'werkbank.loeschkonzept.fehltFrist')).join(' · '),
                })}</span>
                <span className="knoepfe klein">
                  {l.fehlt.includes('zweck') && <button type="button" className="knopf klein" onClick={() => zumZweck(l.typId)}>{t('werkbank.loeschkonzept.zweckEintragen')}</button>}
                  {l.fehlt.includes('frist') && <Link to={`/werkbank/typen/${l.typId}#archiv`} className="knopf klein">{t('werkbank.loeschkonzept.fristFestlegen')}</Link>}
                </span>
              </> : l.art === 'verantwortlicher'
                ? <Link to="/werkbank/auskuenfte/einstellungen" className="verweis">{l.text}</Link>
                : <a href="#personendaten" className="verweis">{l.text}</a>}
            </li>
          ))}</ul>
          {luecken.some((l) => l.art === 'typ' && l.fehlt.includes('frist')) && <p className="leise klein">{t('werkbank.loeschkonzept.fristHinweis')}</p>}
        </div>
      )}
      <p className="knoepfe">
        <a className="knopf primaer" href="/api/werkbank/datenschutz/loeschkonzept?format=pdf">{t('werkbank.loeschkonzept.als-pdf-erzeugen')}</a>
        <a className="knopf" href="/api/werkbank/datenschutz/loeschkonzept?format=docx">{t('werkbank.loeschkonzept.als-word-datei-docx')}</a>
      </p>
    </section>
  );
}
