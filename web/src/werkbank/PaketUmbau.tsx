/**
 * Paket-Update baut um (#1041): Vorschau des Umbaus in der Paket-Vorschau – je Schritt, welche Mappen wohin ziehen,
 * welche Werte in welche Felder, was als Notiz bleibt, eine Rückfrage je Feld, das der Administrator selbst angelegt
 * oder geändert hat, und was sich an Rechten und KI-Freigabe ändert. Darunter „Vorher sichern“ (vorausgewählt) und die
 * Bestätigung. Bestätigen darf nur „Gesamte Verwaltung“; der Server verlangt dafür eine frische Anmeldung.
 */
import { Feld, HakenFeld } from '../bausteine';
import type { UmbauEntscheidungen, UmbauPlan } from '../../../shared/src/umbau';
import { t } from '../sprache';

export interface UmbauStand {
  entscheidungen: UmbauEntscheidungen;
  bestaetigt: boolean;
  sichern: boolean;
}

/** Anfangsstand: je Rückfrage der Vorschlag, „Vorher sichern“ an, noch nicht bestätigt. */
export function umbauStart(plaene: UmbauPlan[]): UmbauStand {
  return {
    entscheidungen: Object.fromEntries(plaene.map((p) => [p.von.kennung, Object.fromEntries(p.rueckfragen.map((r) => [r.feld, r.vorschlag]))])),
    bestaetigt: false,
    sichern: true,
  };
}

export function UmbauVorschau({ plaene, stand, setze, gesamt }: { plaene: UmbauPlan[]; stand: UmbauStand; setze(s: UmbauStand): void; gesamt: boolean }) {
  if (!plaene.length) return null;
  return (
    <section className="stapel" aria-label={t('pakete.umbau.vorschau.titel')}>
      <h3>{t('pakete.umbau.vorschau.titel')}</h3>
      <p className="leise">{t('pakete.umbau.vorschau.einleitung')}</p>
      <div className="stapel">
        {plaene.map((p) => (
          <div key={p.von.kennung} className="blatt stapel">
            <p><strong>{p.art === 'uebernehmen' ? t('pakete.umbau.vorschau.uebernehmen', { von: p.von.name, nach: p.nach.name }) : t('pakete.umbau.vorschau.zusammenlegen', { von: p.von.name, nach: p.nach.name })}</strong>
              {' '}<span className="leise">{t('pakete.umbau.vorschau.mappen', { anzahl: p.mappen, paket: p.von.paket ?? '' })}</span></p>
            {p.felder.length > 0 && (
              <ul className="klein">
                {p.felder.map((f) => (
                  <li key={f.von}>{t('pakete.umbau.vorschau.feld', { von: f.von, nach: f.nach, anzahl: f.anzahl })}{f.notiz > 0 && <> {' '}<span className="leise">{t('pakete.umbau.vorschau.feld-notiz', { anzahl: f.notiz })}</span></>}</li>
                ))}
              </ul>
            )}
            {p.setzen.length > 0 && <p className="klein">{t('pakete.umbau.vorschau.setzen', { liste: p.setzen.map((s) => `„${s.feld}“ = ${s.wert}`).join(', ') })}</p>}
            {p.notiz.length > 0 && <p className="klein">{t('pakete.umbau.vorschau.notiz', { liste: p.notiz.map((n) => `„${n.feld}“ (${n.anzahl})`).join(', ') })}</p>}
            {p.rueckfragen.map((r) => (
              <Feld key={r.feld} beschriftung={t(r.grund === 'eigen' ? 'pakete.umbau.vorschau.rueckfrage-eigen' : 'pakete.umbau.vorschau.rueckfrage-geaendert', { feld: r.label, anzahl: r.anzahl })}>
                <select value={stand.entscheidungen[p.von.kennung]?.[r.feld] ?? r.vorschlag}
                  onChange={(e) => setze({ ...stand, entscheidungen: { ...stand.entscheidungen, [p.von.kennung]: { ...stand.entscheidungen[p.von.kennung], [r.feld]: e.target.value } } })}>
                  {r.moeglich.map((m) => <option key={m.wahl} value={m.wahl}>{m.text}</option>)}
                </select>
              </Feld>
            ))}
            {(p.rechte.regeln || p.rechte.ki || p.rechte.verwehrt.length > 0) && (
              <div className="hinweis info"><ul>
                {p.rechte.regeln && <li>{t('pakete.umbau.vorschau.regeln', { von: p.von.name, nach: p.nach.name })}</li>}
                {p.rechte.ki && <li>{t('pakete.umbau.vorschau.ki', { von: p.von.name, nach: p.nach.name })}</li>}
                {p.rechte.verwehrt.length > 0 && <li>{t('pakete.umbau.vorschau.verwehrt', { von: p.von.name, nach: p.nach.name, pakete: p.rechte.verwehrt.join(', ') })}</li>}
              </ul></div>
            )}
            {(p.umgeleitet.felder > 0 || p.umgeleitet.ansichten > 0) && (
              <p className="leise klein">{t('pakete.umbau.vorschau.umgeleitet', { nach: p.nach.name, liste: [
                p.umgeleitet.felder ? t('pakete.umbau.vorschau.n-felder', { anzahl: p.umgeleitet.felder }) : '',
                p.umgeleitet.ansichten ? t('pakete.umbau.vorschau.n-ansichten', { anzahl: p.umgeleitet.ansichten }) : '',
              ].filter(Boolean).join(', ') })}</p>
            )}
            {p.imPapierkorb > 0 && <p className="leise klein">{t('pakete.umbau.vorschau.papierkorb', { anzahl: p.imPapierkorb, von: p.von.name })}</p>}
          </div>
        ))}
      </div>
      <div className="hinweis warn stapel">
        {!gesamt && <p>{t('pakete.umbau.vorschau.nur-gesamt')}</p>}
        <HakenFeld beschriftung={t('pakete.umbau.vorschau.sichern')} hinweis={t('pakete.umbau.vorschau.sichern-hinweis')}>
          <input type="checkbox" checked={stand.sichern} disabled={!gesamt} onChange={(e) => setze({ ...stand, sichern: e.target.checked })} />
        </HakenFeld>
        <HakenFeld beschriftung={t('pakete.umbau.vorschau.bestaetigen')} hinweis={t('pakete.umbau.vorschau.bestaetigen-hinweis')}>
          <input type="checkbox" checked={stand.bestaetigt} disabled={!gesamt} onChange={(e) => setze({ ...stand, bestaetigt: e.target.checked })} />
        </HakenFeld>
      </div>
    </section>
  );
}
