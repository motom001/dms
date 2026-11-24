/**
 * Dokument umbenennen (#1594): Name ohne Endung im Feld, die Endung steht fest daneben und bleibt (der Server hängt
 * sie ebenso an). Wie die Archivnummer direkt an der Zeile; gilt sofort, ohne „Mappe speichern“.
 */
import { useState } from 'react';
import { stammUndEndung } from '../../../../shared/src/anlagen';
import type { Dokument } from '../../../../shared/src/model';
import { dokumenteApi } from '../../api/dokumente';
import { Feld, Knopf } from '../../bausteine';
import { t } from '../../sprache';

export function DokumentUmbenennen({
  d,
  schliessen,
  fertig,
}: {
  d: Pick<Dokument, 'id' | 'name'>;
  schliessen(): void;
  fertig(meldung: string): void | Promise<void>;
}) {
  const [stamm, endung] = stammUndEndung(d.name);
  const [name, setName] = useState(stamm);
  const [fehler, setFehler] = useState<string>();
  async function benenne() {
    setFehler(undefined);
    try {
      const neu = await dokumenteApi.umbenennen(d.id, `${name.trim()}${endung}`);
      schliessen();
      await fertig(t('ablage.dokumente.umbenennen.fertig', { vorher: d.name, name: neu.name }));
    } catch (x) {
      setFehler((x as Error).message);
    }
  }
  return (
    <form
      className="asnform"
      onSubmit={(e) => {
        e.preventDefault();
        void benenne();
      }}>
      <Feld
        beschriftung={t('ablage.dokumente.umbenennen.name')}
        hinweis={endung ? t('ablage.dokumente.umbenennen.endung', { endung }) : undefined}
        fehler={fehler}>
        <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} />
      </Feld>
      {endung && (
        <span className="mono" aria-hidden="true">
          {endung}
        </span>
      )}
      <Knopf art="haupt" groesse="klein" type="submit" gesperrt={!name.trim()}>
        {t('ablage.dokumente.umbenennen.speichern')}
      </Knopf>
      <Knopf groesse="klein" onClick={schliessen}>
        {t('ablage.dokumente.abbrechen')}
      </Knopf>
    </form>
  );
}
