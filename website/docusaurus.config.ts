import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import prismTheme from './src/prism-theme';

const config: Config = {
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

  clientModules: ['./src/client/fonts.ts'],

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mmacy/bxvtt/edit/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
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
      theme: prismTheme,
      darkTheme: prismTheme,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
