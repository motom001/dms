import { useState } from 'react';
import type { Anker } from '../../../shared/src/entdecken';
import type { WerkbankRundgaengeStand } from '../../../shared/src/entdecken-werkbank';
import { Feld, Knopf, Suchfeld } from '../bausteine';
import { t } from '../sprache';

/**
 * Hilfe beim Schreiben von Rundgängen und Tipps (#941, #942): alle Ankerpunkte mit kurzer Beschreibung, dazu die
 * echten Felder und Register eines gewählten Mappentyps (`mappe.feld:<key>`, `mappe.register:<key>`) und die Bereiche
 * der Werkbank (`werkbank.bereich:<route>`). Ein Klick setzt den Anker ein – im Rundgang an der Schreibmarke, im Tipp
 * als Ziel. Niemand muss Ankernamen auswendig kennen.
 */
export function AnkerHilfe({
  anker,
  typen,
  bereiche,
  einsetzen,
  nurMitSeite,
}: Pick<WerkbankRundgaengeStand, 'anker' | 'typen' | 'bereiche'> & {
  einsetzen(anker: string): void;
  /** Tipps: nur Anker mit fester Seite (Mappen-Anker gehen dort nur mit Mappentyp). */
  nurMitSeite?: boolean;
}) {
  const [such, setSuch] = useState('');
  const [typ, setTyp] = useState(typen[0]?.kennung ?? '');
  const woerter = such.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const passt = (...x: string[]) => woerter.every((w) => x.some((y) => y.toLowerCase().includes(w)));
  const feste = anker.filter((a: Anker) => !a.muster && (!nurMitSeite || a.seite) && passt(a.anker, a.beschreibung));
  const gewaehlt = typen.find((x) => x.kennung === typ);
  const teile = gewaehlt
    ? [
        ...gewaehlt.felder.map((f) => ({ anker: `mappe.feld:${f.key}`, text: t('werkbank.rundgaenge.hilfe.feld', { name: f.name }) })),
        ...gewaehlt.register.map((r) => ({
          anker: `mappe.register:${r.key}`,
          text: t('werkbank.rundgaenge.hilfe.register', { name: r.name }),
        })),
      ].filter((x) => passt(x.anker, x.text))
    : [];
  const werkbank = bereiche.map((b) => ({ anker: `werkbank.bereich:${b.pfad}`, text: b.name })).filter((x) => passt(x.anker, x.text));
  return (
    <aside className="anker-hilfe" aria-labelledby="anker-hilfe-titel">
      <h2 id="anker-hilfe-titel" className="h4">
        {t('werkbank.rundgaenge.hilfe.titel')}
      </h2>
      <p className="leise klein">{t('werkbank.rundgaenge.hilfe.text')}</p>
      <Suchfeld
        wert={such}
        setze={setSuch}
        beschriftung={t('werkbank.rundgaenge.hilfe.suche')}
        platzhalter={t('werkbank.rundgaenge.hilfe.suche')}
      />
      <h3 className="ueber">{t('werkbank.rundgaenge.hilfe.allgemein')}</h3>
      <ul className="anker-liste">
        {feste.map((a) => (
          <Eintrag key={a.anker} a={a.anker} text={a.beschreibung} einsetzen={einsetzen} />
        ))}
      </ul>
      {typen.length > 0 && (
        <>
          <h3 className="ueber">{t('werkbank.rundgaenge.hilfe.typ.titel')}</h3>
          <Feld
            beschriftung={t('werkbank.rundgaenge.hilfe.typ')}
            hinweis={nurMitSeite ? t('werkbank.rundgaenge.hilfe.typ.tipp') : t('werkbank.rundgaenge.hilfe.typ.hinweis')}>
            <select value={typ} onChange={(e) => setTyp(e.target.value)}>
              {typen.map((x) => (
                <option key={x.kennung} value={x.kennung}>
                  {x.name}
                </option>
              ))}
            </select>
          </Feld>
          <ul className="anker-liste">
            {teile.map((x) => (
              <Eintrag key={x.anker} a={x.anker} text={x.text} einsetzen={einsetzen} />
            ))}
          </ul>
        </>
      )}
      {!nurMitSeite && (
        <>
          <h3 className="ueber">{t('werkbank.rundgaenge.hilfe.bereiche')}</h3>
          <ul className="anker-liste">
            {werkbank.map((x) => (
              <Eintrag key={x.anker} a={x.anker} text={x.text} einsetzen={einsetzen} />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

/** Ein Anker zum Anklicken: Name und kurze Beschreibung. */
function Eintrag({ a, text, einsetzen }: { a: string; text: string; einsetzen(anker: string): void }) {
  return (
    <li>
      <Knopf art="link" onClick={() => einsetzen(a)} title={t('werkbank.rundgaenge.hilfe.einsetzen', { anker: a })}>
        <code>{a}</code> <span className="leise">{text}</span>
      </Knopf>
    </li>
  );
}
