/**
 * Kleine, einheitliche Piktogramme für das Benutzermenü (#430): 16 px, Strich in der Textfarbe.
 * Rein schmückend (`aria-hidden`) – der Text daneben bleibt die Beschriftung.
 */
export type Piktogramm = 'person' | 'hilfe' | 'fehler' | 'info' | 'abmelden';

const PFADE: Record<Piktogramm, string> = {
  person: 'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8Zm-5 6c0-2.5 2.2-4.25 5-4.25s5 1.75 5 4.25',
  hilfe: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM6.2 6.2a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8M8 11.4v.1',
  fehler: 'M3.5 14.5V2M3.5 2.5h8l-1.75 3 1.75 3h-8',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.3v4M8 4.8v.1',
  abmelden: 'M9.5 2.5h-5v11h5M7 8h7m-2.5-2.5L14 8l-2.5 2.5',
};

export function Pikto({ name }: { name: Piktogramm }) {
  return (
    <svg className="pikto" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={PFADE[name]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
