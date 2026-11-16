import { umschluesseleTief } from '../../geheimnisse/tresor';
import type { RepoTeil } from '..';
import type { SpeicherKontext } from './kontext';

/** Verschlüsselte Werte: umschlüsseln und Fundstellen. */
export function speicherGeheimnisse(sp: SpeicherKontext) {
  const { mappen, korb } = sp;
  return {
    async umschluesseln(um) {
      // Arbeitsspeicher: Mappen und Papierkorb (Einstellungen liegen anderswo); erst rechnen, dann schreiben.
      let umgeschluesselt = 0;
      let unlesbar = 0;
      const neu = [...mappen.values()].map((m) => {
        const x = umschluesseleTief(m.werte, um);
        umgeschluesselt += x.geaendert;
        unlesbar += x.unlesbar;
        return [m, x.wert] as const;
      });
      const korbNeu = [...korb.values()].map((k) => {
        const x = umschluesseleTief(k.mappe.werte, um);
        umgeschluesselt += x.geaendert;
        unlesbar += x.unlesbar;
        return [k, x.wert] as const;
      });
      for (const [m, w] of neu) m.werte = w;
      for (const [k, w] of korbNeu) k.mappe.werte = w;
      return { umgeschluesselt, unlesbar };
    },
    async verschluesselteFundstellen() {
      // Arbeitsspeicher: nur Mappen und Papierkorb (Einstellungen liegen anderswo), wie umschluesseln.
      const hat = (w: unknown) => JSON.stringify(w).includes('dms1$');
      return [
        ...[...mappen.values()]
          .filter((m) => hat(m.werte))
          .map((m) => ({ quelle: 'mappe' as const, schluessel: m.id, wert: structuredClone(m.werte), titel: m.titel })),
        ...[...korb.values()]
          .filter((k) => hat(k.mappe.werte))
          .map((k) => ({
            quelle: 'papierkorb' as const,
            schluessel: k.mappe.id,
            wert: structuredClone(k.mappe.werte),
            titel: k.mappe.titel,
          })),
      ];
    },
  } satisfies RepoTeil;
}
