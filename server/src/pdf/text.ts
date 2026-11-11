import { KB, MB } from '../grenzen';

/** Dateigröße lesbar: „512 B“, „48 KB“, „2,4 MB“. */
export const groesseText = (n: number) => (n < KB ? `${n} B` : n < MB ? `${(n / KB).toFixed(0)} KB` : `${(n / MB).toFixed(1).replace('.', ',')} MB`);
