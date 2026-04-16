declare module "web3.storage" {
  export class Web3Storage {
    constructor(init: { token: string });
    put(files: File[], options?: { wrapWithDirectory?: boolean }): Promise<string>;
  }

  /** Polyfill File constructor aligned with the web3.storage client bundle */
  export const File: typeof globalThis.File;
}
