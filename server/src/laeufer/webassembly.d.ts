/**
 * Typen für das globale WebAssembly (Node), soweit der Paket-Läufer (#338) sie braucht. Der Server baut ohne
 * die DOM-Bibliothek von TypeScript, und @types/node beschreibt WebAssembly nicht. Kommt später „DOM“ in
 * server/tsconfig.json, diese Datei löschen.
 */
declare namespace WebAssembly {
  type ImportValue = Function | Global | Memory | Table | number;
  type Imports = Record<string, Record<string, ImportValue>>;
  type Exports = Record<string, Function | Global | Memory | Table>;
  interface ModuleImportDescriptor { module: string; name: string; kind: 'function' | 'table' | 'memory' | 'global' | 'tag' }
  interface ModuleExportDescriptor { name: string; kind: 'function' | 'table' | 'memory' | 'global' | 'tag' }
  class Module {
    constructor(bytes: ArrayBufferView | ArrayBuffer);
    static imports(m: Module): ModuleImportDescriptor[];
    static exports(m: Module): ModuleExportDescriptor[];
  }
  class Instance { constructor(m: Module, imports?: Imports); readonly exports: Exports }
  class Memory { constructor(d: { initial: number; maximum?: number; shared?: boolean }); readonly buffer: ArrayBuffer; grow(seiten: number): number }
  class Table { readonly length: number }
  class Global { value: unknown }
  class RuntimeError extends Error {}
  class CompileError extends Error {}
  class LinkError extends Error {}
  function compile(bytes: ArrayBufferView | ArrayBuffer): Promise<Module>;
  function validate(bytes: ArrayBufferView | ArrayBuffer): boolean;
}
