import { useState } from 'react';
import type { LinkErgebnis } from '../../api/konto';
import { t } from '../../sprache';
import { Feld, Knopf } from '../../bausteine';

export function LinkAnzeige({ e, schliessen }: { e: LinkErgebnis; schliessen?: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  if (e.mailVerschickt)
    return (
      <div className="hinweis gut">
        <p>{t('werkbank.benutzer.e-mail-an-ist', { email: e.benutzer.email })}</p>
        {schliessen && <Knopf onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</Knopf>}
      </div>
    );
  return (
    <div className="hinweis info stapel">
      <p>
        {t('werkbank.benutzer.er-funktioniert-nur-einmal', {
          wert: e.mailFehler
            ? t('werkbank.benutzer.die-e-mail-an', { email: e.benutzer.email, mailFehler: e.mailFehler })
            : t('werkbank.benutzer.schicke-diesen-link-an', { email: e.benutzer.email }),
        })}
      </p>
      <div className="linkzeile">
        <Feld beschriftung={t('werkbank.benutzer.link-zum-passwort-setzen')} beschriftungVerbergen>
          <input readOnly value={e.link} onFocus={(ev) => ev.target.select()} className="mono" />
        </Feld>
        <Knopf
          groesse="klein"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(e.link!);
              setKopiert(true);
            } catch {
              /* Feld ist markierbar */
            }
          }}>
          {kopiert ? t('werkbank.benutzer.kopiert') : t('werkbank.benutzer.kopieren')}
        </Knopf>
      </div>
      {schliessen && <Knopf onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</Knopf>}
    </div>
  );
}
