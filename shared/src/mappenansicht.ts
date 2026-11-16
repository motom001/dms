/**
 * Kopf und Register einer geöffneten Mappe (#427) – als reine Funktionen, damit sie testbar sind.
 */
import type { Aufgabe, Aufgabenart, Register } from './model';
import { t } from './texte';

/** Schlüssel des System-Registers „Notizen“ (#427); beginnt mit „_“, damit er keinem Register eines Typs gleicht. */
export const NOTIZEN_REGISTER = '_notizen';

export interface NotizenRegister {
  key: typeof NOTIZEN_REGISTER;
  name: 'Notizen';
  art: 'notizen';
}
export type AnsichtsRegister = Register | NotizenRegister;

/**
 * Register der Mappe mit „Notizen“ (#427): fester System-Register bei jedem Mappentyp,
 * vor dem ersten Register „Historie“ – ohne Historie am Ende.
 */
export function mitNotizen(register: Register[]): AnsichtsRegister[] {
  const notizen: NotizenRegister = { key: NOTIZEN_REGISTER, name: 'Notizen', art: 'notizen' };
  const i = register.findIndex((r) => r.art === 'protokoll');
  return i < 0 ? [...register, notizen] : [...register.slice(0, i), notizen, ...register.slice(i)];
}

/** Erwähnung in einer Notiz? Ihr feldKey lautet „notiz:<id>“ (siehe Dienst.erwaehnungenAbgleichen). */
export const ausNotiz = (a: Pick<Aufgabe, 'art' | 'feldKey'>) => a.art === 'erwaehnung' && !!a.feldKey?.startsWith('notiz:');

/**
 * Welches Register beim Öffnen aktiv ist: ?register=… aus der Adresse (Sprung aus der Suche, #345,
 * oder auf Notizen), sonst „Notizen“, wenn mich eine offene Erwähnung in einer Notiz hierher bringt (#427),
 * sonst das erste.
 */
export function startRegister(
  register: AnsichtsRegister[],
  wunsch: string | null | undefined,
  aufgaben: Aufgabe[] = [],
  ich?: string,
): string | undefined {
  if (wunsch && register.some((r) => r.key === wunsch)) return wunsch;
  if (ich && aufgaben.some((a) => !a.erledigt && a.empfaengerId === ich && ausNotiz(a)) && register.some((r) => r.key === NOTIZEN_REGISTER))
    return NOTIZEN_REGISTER;
  return register[0]?.key;
}

/**
 * Was im Aufgaben-Banner vorne steht (#427), passend zur Art. Für mich vollständig („Deine Aufgabe“,
 * „Post für dich“ …), für andere der Anfang, hinter den die Oberfläche den Namen setzt („Aufgabe für“).
 */
export function aufgabenBeschriftung(art: Aufgabenart, fuerMich: boolean, anlass?: Aufgabe['anlass']): string {
  // Ein Favorit wurde erwähnt (#889): nicht „Du wurdest erwähnt“.
  if (art === 'erwaehnung' && anlass?.art === 'favorit')
    return fuerMich ? t('gemeinsam.mappenansicht.favorit-erwaehnt') : t('gemeinsam.mappenansicht.favorit-erwaehnt-fuer');
  switch (art) {
    case 'post':
      return fuerMich ? t('gemeinsam.mappenansicht.post-fuer-dich') : t('gemeinsam.mappenansicht.post-fuer');
    case 'erwaehnung':
      return fuerMich ? t('gemeinsam.mappenansicht.du-wurdest-erwaehnt') : t('gemeinsam.mappenansicht.erwaehnung-fuer');
    case 'erinnerung':
      return fuerMich ? t('gemeinsam.mappenansicht.deine-erinnerung') : t('gemeinsam.mappenansicht.erinnerung-fuer');
    case 'zugeordnet':
      return fuerMich ? t('gemeinsam.mappenansicht.bitte-pruefen') : t('gemeinsam.mappenansicht.zu-pruefen-von');
    default:
      return fuerMich ? t('gemeinsam.mappenansicht.deine-aufgabe') : t('gemeinsam.mappenansicht.aufgabe-fuer');
  }
}
