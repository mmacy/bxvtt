import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Directories whose controls haven't moved to the kit's hover help yet (issue #16). The hover help rules below
 * skip them. When you convert a directory, delete its line here so the rules cover it, and run `npm run lint`.
 */
const hoverHelpPending = [
  'apps/web/src/features/combat/**',
  'apps/web/src/features/compendium/**',
  'apps/web/src/features/explore/**',
  'apps/web/src/features/feed/**',
  'apps/web/src/features/journal/**',
  'apps/web/src/features/referee/**',
  'apps/web/src/features/sheet/**',
  'apps/web/src/features/town/**',
  'apps/web/src/features/wizard/**',
];

const TITLE_MESSAGE =
  'A native title shows only to a mouse user, after a delay, and never on keyboard focus. Pass `tooltip` to the ' +
  'kit control, or `disabledReason` with `disabled`. See "Hover help" in apps/web/src/ui/README.md.';

/**
 * Selectors for `no-restricted-syntax` that find a native `title` on an interactive element: a kit control (whose
 * name ends in Button, Link, or Trigger), a native control, a Radix part, or any element that takes a click, a key,
 * or an interactive role. A `title` prop that is a heading, such as on Banner, Dialog, Card, or Panel, passes.
 */
const hoverHelpRules = [
  {
    selector:
      "JSXOpeningElement[name.name=/^(a|button|input|select|textarea|summary)$|(Button|Link|Trigger)$/] > JSXAttribute[name.name='title']",
    message: TITLE_MESSAGE,
  },
  {
    selector:
      "JSXOpeningElement[name.property.name=/(Button|Link|Trigger|Item)$/] > JSXAttribute[name.name='title']",
    message: TITLE_MESSAGE,
  },
  {
    selector:
      "JSXOpeningElement[name.name=/^[a-z]/]:has(> JSXAttribute[name.name=/^(onClick|onKeyDown|onPointerDown|tabIndex)$/]) > JSXAttribute[name.name='title']",
    message: TITLE_MESSAGE,
  },
  {
    selector:
      "JSXOpeningElement:has(> JSXAttribute[name.name='role'][value.value=/^(button|link|tab|menuitem|checkbox|radio|switch|option|slider|spinbutton|combobox|textbox)$/]) > JSXAttribute[name.name='title']",
    message: TITLE_MESSAGE,
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.data/**',
      '.bxapi/**',
      'packages/shared/src/bxapi/schema.d.ts',
      'playwright-report/**',
      'test-results/**',
      'website/.docusaurus/**',
      'website/build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Hover help comes from the kit, which shows it on hover and on keyboard focus and keeps a disabled control's
    // reason reachable. See "Hover help" in apps/web/src/ui/README.md.
    files: ['apps/web/src/**/*.tsx'],
    ignores: hoverHelpPending,
    rules: { 'no-restricted-syntax': ['error', ...hoverHelpRules] },
  },
);
