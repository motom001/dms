/**
 * Mitgelieferte Sichten (#192, #725; #1076 aus dienst.ts): „Neue Post“, „Eingegangen“, „Versendet“ und „Favoriten“
 * einmal anlegen und ihre Ids nachschlagen. Schicht 3 – braucht nur den Kern.
 */
import { randomUUID } from 'node:crypto';
import { type Mappentyp, POST_RICHTUNG, POST_STAND } from '../../../shared/src/model';
import { ALLE_TYPEN } from '../../../shared/src/pakete';
import { kinderVon, zeigtAlleTypen } from '../../../shared/src/sichten';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';

export class Systemsichten {
  constructor(private readonly kern: Kern) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }

  /**
   * Sichten für Post (#192), einmal angelegt: „Neue Post“ ganz oben (Stand „Neu“), unter „Post“
   * „Eingegangen“ und „Versendet“. Löscht der Administrator sie, kommen sie nicht wieder.
   */
  async sicherePostSichten(post: Mappentyp) {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { sichten?: boolean; neu?: string } | null) : null;
    if (merk?.sichten) return;
    const alle = await this.repo.listeSichten();
    const typSicht = alle.find((s) => s.id === post.id);
    if (typSicht && (typSicht.name === 'E-Mail' || typSicht.name === 'E-Mail (System)')) {
      await this.repo.aendereSicht(typSicht.id, { ...typSicht, name: post.name, beschreibung: post.beschreibung });
    }
    const bed = (feld: string, wert: string) => [{ art: 'feld' as const, feld, op: 'einerVon' as const, wert: { art: 'fest' as const, wert: [wert] } }];
    let neu = alle.find((s) => s.typen.length === 1 && s.typen[0] === post.id && s.bedingungen.some((b) => b.art === 'feld' && b.feld === 'stand'));
    if (!neu) {
      const oben = kinderVon(alle, null).map((s) => s.position);
      neu = await this.repo.legeSichtAn(randomUUID(), {
        name: t('meldungen.dienst.neue-post'), beschreibung: t('meldungen.dienst.post-die-noch-niemand'), elternId: null,
        position: Math.min(10, ...oben) - 10, typen: [post.id], bedingungen: bed('stand', POST_STAND.neu), symbol: 'inbox',
      });
    }
    if (typSicht && !kinderVon(alle, typSicht.id).length) {
      await this.repo.legeSichtAn(randomUUID(), { name: 'Eingegangen', beschreibung: t('meldungen.dienst.post-die-in-ablago'), elternId: typSicht.id, position: 10, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.eingehend) });
      await this.repo.legeSichtAn(randomUUID(), { name: 'Versendet', beschreibung: t('meldungen.dienst.aus-ablago-verschickte-e'), elternId: typSicht.id, position: 20, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.ausgehend) });
    }
    await this.einstellungen?.schreibe('post', { sichten: true, neu: neu.id });
    protokoll.modul('werkbank').info('Ansichten für Post angelegt', { neu: neu.id });
  }

  /**
   * Mitgelieferte Ansicht „Favoriten“ (#725): alle Mappentypen, Bedingung „ist mein Favorit“, ganz oben unter
   * „Neue Post“. Einmal angelegt; löscht der Administrator sie, kommt sie nicht wieder (die Favoriten selbst
   * bleiben, der Stern an der Mappe auch).
   */
  async sichereFavoritenSicht() {
    if (!this.einstellungen) return;
    const merk = (await this.einstellungen.lies('favoriten_sicht')) as { id?: string } | null;
    if (merk?.id) return;
    const alle = await this.repo.listeSichten();
    let s = alle.find((x) => zeigtAlleTypen(x) && x.bedingungen.length === 1 && x.bedingungen[0].art === 'favorit');
    if (!s) {
      // Direkt unter „Neue Post“, sonst ganz oben.
      const postId = await this.neuePostSicht();
      const post = alle.find((x) => x.id === postId);
      const oben = kinderVon(alle, null).map((x) => x.position);
      s = await this.repo.legeSichtAn(randomUUID(), {
        name: 'Favoriten', beschreibung: t('meldungen.dienst.deine-mappen-mit-stern'), elternId: null,
        position: post ? post.position + 1 : Math.min(10, ...oben) - 10, typen: [ALLE_TYPEN], bedingungen: [{ art: 'favorit' }], symbol: 'star',
      });
      protokoll.modul('werkbank').info('Ansicht „Favoriten“ angelegt', { sicht: s.id });
    }
    await this.einstellungen.schreibe('favoriten_sicht', { id: s.id });
  }

  /** Id der mitgelieferten Ansicht „Favoriten“ (#725), solange es sie gibt. */
  async favoritenSicht(): Promise<string | null> {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('favoriten_sicht')) as { id?: string } | null) : null;
    if (!merk?.id) return null;
    return (await this.repo.listeSichten()).some((x) => x.id === merk.id) ? merk.id : null;
  }

  /** Id der Sicht „Neue Post“ (#192), damit die Oberfläche ihre Zahl hervorhebt. */
  async neuePostSicht(): Promise<string | null> {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { neu?: string } | null) : null;
    const alle = await this.repo.listeSichten();
    return alle.find((s) => s.id === merk?.neu)?.id ?? null;
  }
}
