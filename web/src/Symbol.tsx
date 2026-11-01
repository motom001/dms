import { createElement } from 'react';

/**
 * Einheitliche Symbole (#425): einfarbig in Textfarbe (`currentColor`), so groß wie die Schrift,
 * immer `aria-hidden` – die Bedeutung trägt die Beschriftung daneben. Statt Emoji, die je nach
 * System bunt gezeichnet werden. Nur die genutzten Symbole liegen hier, nichts wird aus dem Netz geladen.
 *
 * Formen aus Lucide (https://lucide.dev, lucide-static 0.460.0), ISC-Lizenz:
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this permission notice appear
 * in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
 *
 * Neues Symbol: SVG von lucide.dev öffnen und die Elemente hier eintragen (Name deutsch, nach Bedeutung).
 */
type Teil = ['path' | 'circle' | 'rect' | 'line', Record<string, string>];

const SYMBOLE = {
  'aufgabe': [['path', { d: 'M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5' }], ['path', { d: 'm9 11 3 3L22 4' }]], // square-check-big
  'erinnern': [['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }], ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }]], // bell
  'email': [['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }], ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }]], // mail
  'pdf': [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M12 18v-6' }], ['path', { d: 'm9 15 3 3 3-3' }]], // file-down
  'link': [['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }], ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]], // link
  'auskunft': [['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3' }], ['path', { d: 'm9 18-1.5-1.5' }], ['circle', { cx: '5', cy: '14', r: '3' }]], // file-search
  'notiz': [['path', { d: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z' }], ['path', { d: 'M15 3v4a2 2 0 0 0 2 2h4' }]], // sticky-note
  'auge': [['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }], ['circle', { cx: '12', cy: '12', r: '3' }]], // eye
  'auge-aus': [['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }], ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }], ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }], ['path', { d: 'm2 2 20 20' }]], // eye-off
  'warnung': [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]], // triangle-alert
  'stoppuhr': [['line', { x1: '10', x2: '14', y1: '2', y2: '2' }], ['line', { x1: '12', x2: '15', y1: '14', y2: '11' }], ['circle', { cx: '12', cy: '14', r: '8' }]], // timer
  'schloss': [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]], // lock
  'dokument': [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M10 9H8' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]], // file-text
  'historie': [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }], ['path', { d: 'M12 7v5l4 2' }]], // history
  'herz': [['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }]], // heart
  'info': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]], // info
  'geloescht': [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }], ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }]], // trash
  'verboten': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'm4.9 4.9 14.2 14.2' }]], // ban
  'bezug': [['path', { d: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48' }]], // paperclip
  'kamera': [['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }], ['circle', { cx: '12', cy: '13', r: '3' }]], // camera
  'haken': [['path', { d: 'M20 6 9 17l-5-5' }]], // check
} satisfies Record<string, Teil[]>;

export type SymbolName = keyof typeof SYMBOLE;

export const symbolNamen = Object.keys(SYMBOLE) as SymbolName[];

export function Symbol({ name, className }: { name: SymbolName; className?: string }) {
  return (
    <svg className={`sym${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {SYMBOLE[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
