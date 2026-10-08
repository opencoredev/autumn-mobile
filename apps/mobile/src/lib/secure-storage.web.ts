// Web is only used for local UI development. Browsers have no keychain, so the
// dev session token lives in localStorage there.
export const secureStorage = {
  get: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  remove: async (key: string) => globalThis.localStorage?.removeItem(key),
};
