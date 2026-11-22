// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'bxvtt',
  tagline: 'A virtual tabletop for the 1981 B/X rules, powered by bxapi.',
  url: 'https://mmacy.github.io',
  baseUrl: '/',
  organizationName: 'mmacy',
  projectName: 'bxvtt',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    // Parse .md files as CommonMark so braces and angle brackets in prose don't need MDX escaping.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/mmacy/bxvtt/edit/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      docs: {
        sidebar: {
          hideable: true,
        },
      },
      navbar: {
        title: 'bxvtt',
        items: [
          {
            href: 'https://github.com/mmacy/bxvtt',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Quickstart', to: '/getting-started/quickstart' },
              { label: 'Player guide', to: '/playing' },
              { label: 'Architecture', to: '/architecture' },
            ],
          },
          {
            title: 'Projects',
            items: [
              { label: 'bxvtt on GitHub', href: 'https://github.com/mmacy/bxvtt' },
              { label: 'bxapi on GitHub', href: 'https://github.com/mmacy/bxapi' },
            ],
          },
        ],
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json'],
      },
    }),
};

export default config;
