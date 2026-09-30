// Mutation spec for the BSIntegrationsPage.jsx extraction (2026-09-30).
// Run: node scripts/mutate.mjs --spec tests/mutations/integrations-page-module.mutations.mjs
export default {
  test: 'node --test tests/integrations-page-module.test.mjs tests/integrations-name-token.test.mjs',
  mutations: [
    { name: 'page reads its window globals at module top (React #130 on first open)', file: 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx',
      find: 'export function BSIntegrationsPage({ onBack }) {\n  const { BSDetailHeader, BSEyebrow, BSFooter, BSPage, BSSection, useBS } = window;\n',
      replace: 'const { BSDetailHeader, BSEyebrow, BSFooter, BSPage, BSSection, useBS } = window;\nexport function BSIntegrationsPage({ onBack }) {\n' },
    { name: 'reconcile sheet reads useBS at module top', file: 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx',
      find: 'export function BSReconcile({ onBack, clientId }) {\n  const { useBS } = window;\n',
      replace: 'const { useBS } = window;\nexport function BSReconcile({ onBack, clientId }) {\n' },
    { name: 'tr passed as a prop instead of bound from useShapeTr (drops out of the i18n ratchet)', file: 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx',
      find: 'export function BSIntegrationsPage({ onBack }) {\n  const { BSDetailHeader, BSEyebrow, BSFooter, BSPage, BSSection, useBS } = window;\n  const t = useBS();\n  const tr = useShapeTr();',
      replace: 'export function BSIntegrationsPage({ onBack, tr = (k, o) => o?.defaultValue ?? k }) {\n  const { BSDetailHeader, BSEyebrow, BSFooter, BSPage, BSSection, useBS } = window;\n  const t = useBS();' },
    { name: 'module imports the translator from the client module (import cycle)', file: 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx',
      find: "import React from 'react';\n", replace: "import React from 'react';\nimport { useShapeTr as _clientTr } from './iosAppBroadsheetClient.jsx';\n" },
    { name: 'client module stops importing the page', file: 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
      find: "import { BSIntegrationsPage, BSReconcile } from './BSIntegrationsPage.jsx';\n", replace: '' },
    { name: 'BSReconcile no longer exposed on window (the coach module reads it there)', file: 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
      find: '  BSReconcile,\n', replace: '' },
    { name: 'a second copy of the page re-inlined into the client module', file: 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
      find: "import { BSIntegrationsPage, BSReconcile } from './BSIntegrationsPage.jsx';\n",
      replace: "import { BSReconcile } from './BSIntegrationsPage.jsx';\nfunction BSIntegrationsPage({ onBack }) { const runAction = async () => {}; return null; }\n" },
  ],
};
