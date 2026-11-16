/**
 * Start (#1278, aus `ablago.ts`): Lasttest intern (#745, #909) und CPU und Speicher je Prozessgruppe (#895).
 */
import { setzeLasttestModus } from '../lasttest/protokollsammlung';
import { Prozessgruppen } from '../lasttest/prozessgruppen';
import type { Lasttestmodus } from '../lasttest/lasttestmodus';
import type { vorbereiten } from './vorbereiten';

/** Was bedieneProzessgruppen von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'verbund' | 'leiter'> & {
  lasttestSeite: Lasttestmodus | null;
  lasttestIntern: boolean;
  env: NodeJS.ProcessEnv;
};

/** Lasttest intern und Prozessgruppen. */
export function bedieneProzessgruppen(bisher: Bisher) {
  const { verbund, lasttestSeite, lasttestIntern, leiter, env } = bisher;

  verbund.bediene('lasttest.intern', () => !!lasttestSeite);
  // Sammlung für den Lasttest (#909): die Spur des Verwaltungsmodus der Mess-Sitzung nicht mitzählen – in jedem Prozess.
  if (lasttestSeite || lasttestIntern) setzeLasttestModus(true);
  // CPU und Speicher je Prozessgruppe (#895): nur im Leiter, nur wenn jemand fragt (der Lasttest alle 2 Sekunden).
  if (leiter) {
    const gruppen = new Prozessgruppen({ postgresImContainer: env.DMS_VARIANTE === 'komplett' });
    verbund.bediene('prozessgruppen.stand', () =>
      gruppen.stand({
        ablago: [
          ...(verbund.primaer ? [{ nr: 0, pid: verbund.primaer, rolle: 'haupt' as const }] : []),
          ...verbund.prozesse().map((p) => ({ nr: p.nr, pid: p.pid, rolle: p.leiter ? ('leiter' as const) : ('anfragen' as const) })),
        ],
        lastgenerator: lasttestSeite?.lastgenerator() ?? null,
      }),
    );
  }
  return {};
}
