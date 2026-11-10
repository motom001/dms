import { KB, MB } from '../grenzen';
/** Zeichen, die die Standardschriften (WinAnsi) kennen; alles andere wird „?“. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function pdfSicher(s: string): string {
  let r = '';
  for (const ch of s.replace(/\t/g, '    ')) {
    const c = ch.codePointAt(0)!;
    r += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : ch === '\n' ? '\n' : c === 0x2009 || c === 0x202f ? ' ' : '?';
  }
  return r;
}

/** Dateigröße lesbar: „512 B“, „48 KB“, „2,4 MB“. */
export const groesseText = (n: number) => (n < KB ? `${n} B` : n < MB ? `${(n / KB).toFixed(0)} KB` : `${(n / MB).toFixed(1).replace('.', ',')} MB`);
