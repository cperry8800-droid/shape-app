// Global Privacy Control (GPC). California (CCPA/CPRA) and ~11 other US state
// laws require honoring the GPC opt-out signal regardless of whether a business
// sells or shares data. Shape does NOT sell or share personal information, so GPC
// is functionally a no-op — but we detect it (server header + client navigator)
// and treat it as a valid opt-out so the choice is recognized and recorded.
//
// Browsers/extensions send `Sec-GPC: 1` on every request and expose
// `navigator.globalPrivacyControl === true` to scripts.

export function gpcOptOut(request: Request): boolean {
  return request.headers.get('sec-gpc') === '1';
}
