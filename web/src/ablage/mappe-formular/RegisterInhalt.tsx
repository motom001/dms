import type { Register } from '../../../../shared/src/model';
import { t } from '../../sprache';
import { AehnlicheDokumente } from '../Aehnlich';
import { Dokumente } from '../Dokumente';
import { Historie } from '../Historie';
import { Notizen } from '../Notizen';
import { FelderRegister, type FelderWege } from './FelderRegister';
import { neueUid, verknuepfungsGruppen } from './hilfen';
import type { Kern } from './kern';
import { Verknuepfungen } from './Verknuepfungen';

/** Was in der Fläche des gewählten Registers steht: Felder, Dokumente, Notizen, Historie oder Verknüpfungen. */
export function RegisterInhalt({ z, w }: { z: Kern; w: FelderWege }) {
  const { typ, mappe, details } = z.p;
  const reg = z.reg;
  if (!reg) return <p className="leise">{t('ablage.mappeformular.dieser-mappentyp-hat-keine')}</p>;
  if (reg.art === 'felder') return <FelderRegister z={z} r={reg} w={w} />;
  if (reg.art === 'dokumente') return <DokumenteRegister z={z} reg={reg} />;
  if (reg.art === 'notizen')
    return !mappe ? (
      <p className="leise">{t('ablage.mappeformular.notizen-gehen-nach-dem')}</p>
    ) : !details ? (
      <p className="leise">{t('ablage.mappeformular.lade')}</p>
    ) : (
      <Notizen
        mappeId={mappe.id}
        notizen={details.notizen ?? []}
        neuLaden={async () => {
          await z.p.neuLaden?.();
        }}
      />
    );
  if (reg.art === 'protokoll')
    return mappe ? (
      <Historie key={reg.key} mappeId={mappe.id} stand={mappe.geaendert} typ={typ} register={reg} />
    ) : (
      <p className="leise">{t('ablage.mappeformular.die-historie-beginnt-mit')}</p>
    );
  if (!mappe) return <p className="leise">{t('ablage.mappeformular.verknuepfungen-entstehen-sobald')}</p>;
  if (!details) return <p className="leise">{t('ablage.mappeformular.lade')}</p>;
  return <Verknuepfungen mappe={mappe} gruppen={verknuepfungsGruppen(z.d, mappe, typ.id, reg, details)} />;
}

/** Dokumentenregister: Dokumente der Mappe und neue Dateien bis zum Speichern; darunter ähnliche Dokumente (#442). */
function DokumenteRegister({ z, reg }: { z: Kern; reg: Register }) {
  const { typ, mappe, details } = z.p;
  const dokumenteIn = (details?.dokumente ?? []).filter((x) => x.registerKey === reg.key);
  const inhalt =
    mappe && !details ? (
      <p className="leise">{t('ablage.mappeformular.lade')}</p>
    ) : (
      <Dokumente
        key={reg.key}
        register={reg}
        dokumente={dokumenteIn}
        neue={z.neueDateien.filter((n) => n.register === reg.key)}
        entfernt={z.entfernt}
        hinzufuegen={(dateien) =>
          z.setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: neueUid(), datei, register: reg.key }))])
        }
        entferne={(id) => z.setEntfernt((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
        entferneMehrere={(ids) => z.setEntfernt((x) => [...x, ...ids.filter((id) => !x.includes(id))])}
        vergiss={(uid) => z.setNeueDateien((x) => x.filter((n) => n.uid !== uid))}
        nurLesen={z.nurLesen}
        setzeNeue={(uid, patch) => z.setNeueDateien((x) => x.map((n) => (n.uid === uid ? { ...n, ...patch } : n)))}
        neuLaden={
          mappe
            ? async () => {
                await z.p.neuLaden?.();
                await z.d.neuLaden();
              }
            : undefined
        }
        post={typ.system === 'post'}
        typ={typ}
        mappeTitel={mappe?.titel ?? ''}
        mitnehmen={details?.exportierbar !== false}
      />
    );
  // Ähnliche Dokumente (#442): nur mit einem Paket mit dms:vektoren und wenn hier Dokumente liegen.
  if (mappe && details && dokumenteIn.length > 0)
    return (
      <>
        {inhalt}
        <AehnlicheDokumente mappeId={mappe.id} />
      </>
    );
  return inhalt;
}
