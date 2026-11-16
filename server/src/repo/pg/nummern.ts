import type { Werte } from '../../../../shared/src/model';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsDokument, alsKreis } from './zeilen';

/** Nummernkreise (#171) und Archivnummern (#345). */
export function pgNummern(k: PgKontext) {
  const { sql, haushaltId, DOK, zieheIn } = k;
  return {
    async listeNummernkreise() {
      return (await sql`SELECT * FROM nummernkreise WHERE haushalt_id = ${haushaltId} ORDER BY name`).map(alsKreis);
    },
    async speichereNummernkreis(k) {
      const [r] = await sql`
        INSERT INTO nummernkreise (haushalt_id, schluessel, name, muster, start) VALUES (${haushaltId}, ${k.schluessel}, ${k.name}, ${k.muster}, ${k.start})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET name = EXCLUDED.name, muster = EXCLUDED.muster, start = EXCLUDED.start
        RETURNING *`;
      return alsKreis(r);
    },
    async loescheNummernkreis(s) {
      await sql`DELETE FROM nummernkreise WHERE haushalt_id = ${haushaltId} AND schluessel = ${s}`;
    },
    async setzeZaehler(s, zeitraum, letzter) {
      const [r] = await sql`
        UPDATE nummernkreise SET staende = staende || ${json(sql, { [zeitraum]: letzter })}
        WHERE haushalt_id = ${haushaltId} AND schluessel = ${s} RETURNING *`;
      return r ? alsKreis(r) : undefined;
    },
    async vergebeNummer(mappeId, feldKey, kreis, jetzt) {
      return sql.begin(async (tx) => {
        // FOR NO KEY UPDATE (#928): sperrt gegen andere Änderungen der Mappe, nicht gegen neue Aufgaben, Notizen, Historie
        // und Favoriten (deren Fremdschlüssel prüft mit FOR KEY SHARE – das wartete bei FOR UPDATE bis zum Ende).
        const [m] = await tx`SELECT werte FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${mappeId} FOR NO KEY UPDATE`;
        const alt = (m?.werte as Werte | undefined)?.[feldKey];
        if (!m || (alt != null && alt !== '')) return null;
        const nummer = await zieheIn(tx, kreis, mappeId, jetzt);
        await tx`UPDATE mappen SET werte = werte || ${json(sql, { [feldKey]: nummer })} WHERE haushalt_id = ${haushaltId} AND id = ${mappeId}`;
        return nummer;
      });
    },
    async zieheNummern(kreis, anzahl, jetzt) {
      return sql.begin(async (tx) => {
        const erg: string[] = [];
        for (let i = 0; i < anzahl; i++) erg.push(await zieheIn(tx, kreis, null, jetzt));
        return erg;
      });
    },
    async setzeArchivnummer(dokumentId, nummer) {
      if (!istUuid(dokumentId)) return false;
      if (nummer) {
        const [x] =
          await sql`SELECT 1 FROM dokumente WHERE haushalt_id = ${haushaltId} AND lower(archivnummer) = lower(${nummer}) AND id <> ${dokumentId}`;
        if (x) return false;
      }
      try {
        await sql`UPDATE dokumente SET archivnummer = ${nummer} WHERE haushalt_id = ${haushaltId} AND id = ${dokumentId}`;
      } catch (e) {
        if ((e as { code?: string }).code === '23505') return false;
        throw e;
      }
      return true;
    },
    async findeArchivnummer(nummer) {
      const [r] = await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND lower(d.archivnummer) = lower(${nummer})`;
      return r ? alsDokument(r) : undefined;
    },
  } satisfies RepoTeil;
}
