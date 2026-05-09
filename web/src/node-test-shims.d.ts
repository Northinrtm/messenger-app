declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: string): string;
}

declare module "node:vm" {
  export type Context = object;

  export function createContext(contextObject?: object): Context;

  export class Script {
    constructor(code: string);

    runInContext(context: Context): unknown;
  }
}
