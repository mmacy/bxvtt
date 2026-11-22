// @ts-check
// Matte syntax colors for the dark theme, drawn from the same pigments as src/css/custom.css.

/** @type {import('prism-react-renderer').PrismTheme} */
const patina = {
  plain: {
    color: '#d9d1c3',
    backgroundColor: '#110e15',
  },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#8a8092', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator'], style: { color: '#a49aa8' } },
    { types: ['keyword', 'atrule', 'important', 'selector'], style: { color: '#ac9bc6' } },
    { types: ['string', 'char', 'attr-value', 'inserted', 'regex'], style: { color: '#93b59a' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: '#cf8a68' } },
    { types: ['function', 'class-name', 'builtin'], style: { color: '#c8b170' } },
    { types: ['property', 'attr-name', 'tag'], style: { color: '#8ba6ba' } },
    { types: ['variable', 'parameter'], style: { color: '#d9d1c3' } },
    { types: ['deleted'], style: { color: '#c46a5c' } },
    { types: ['bold'], style: { fontWeight: 'bold' } },
    { types: ['italic'], style: { fontStyle: 'italic' } },
  ],
};

export default patina;
