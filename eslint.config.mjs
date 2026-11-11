// Análisis estático con el motor de reglas de SonarSource (SonarJS) + reglas de seguridad.
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js', 'legacy/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    plugins: { sonarjs, security },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...security.configs.recommended.rules,
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      'no-var': 'error',
      eqeqeq: 'error',
      'no-empty': 'error',
    },
  },
];
