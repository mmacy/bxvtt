import type { PrismTheme } from 'prism-react-renderer';

// Syntax colors come from the --code-* custom properties in src/css/custom.css, so one Prism theme
// serves both light and dark modes.
const theme: PrismTheme = {
  plain: { color: 'var(--code-plain)', backgroundColor: 'var(--code-background)' },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: { color: 'var(--code-comment)', fontStyle: 'italic' },
    },
    { types: ['punctuation'], style: { color: 'var(--code-punctuation)' } },
    {
      types: ['keyword', 'builtin', 'atrule', 'selector', 'important'],
      style: { color: 'var(--code-keyword)' },
    },
    { types: ['string', 'char', 'attr-value', 'inserted'], style: { color: 'var(--code-string)' } },
    { types: ['function', 'class-name', 'maybe-class-name'], style: { color: 'var(--code-function)' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: 'var(--code-number)' } },
    { types: ['property', 'tag', 'attr-name', 'variable'], style: { color: 'var(--code-property)' } },
    { types: ['operator', 'entity', 'url'], style: { color: 'var(--code-operator)' } },
    { types: ['deleted', 'regex'], style: { color: 'var(--code-deleted)' } },
    { types: ['bold'], style: { fontWeight: 'bold' } },
    { types: ['italic'], style: { fontStyle: 'italic' } },
  ],
};

export default theme;
