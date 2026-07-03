// Config ESLint « plate » (ESLint 9, requis par eslint-config-next 16).
// eslint-config-next 16 fournit directement des configs plates natives — on les
// importe telles quelles (PAS via FlatCompat, qui plante sur la référence
// circulaire du plugin Next). Mêmes règles qu'avant : core-web-vitals + typescript.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // Règles best-practice nouvellement APPLIQUÉES par eslint-plugin-react-hooks
    // (ère React 19). Le code tournait déjà sans souci sous React 18 sur des
    // patterns légitimes (ex. arrêt auto de l'enregistrement à la durée max). On
    // les garde en « warn » (visibles, non bloquantes) plutôt que de refactorer du
    // code runtime qui marche — à nettoyer progressivement.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // public/ = assets statiques et workers vendored/minifiés (ex. opus) : jamais lintés
    // (next lint ne scannait que le code source app/lib/components).
    ignores: ['.next/**', 'node_modules/**', 'public/**'],
  },
];

export default eslintConfig;
