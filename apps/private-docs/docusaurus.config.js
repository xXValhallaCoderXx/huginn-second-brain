const { themes: prismThemes } = require('prism-react-renderer')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Huginn Private Docs',
  tagline: 'Internal runbooks, architecture notes, and operating procedures',
  favicon: 'img/logo.svg',
  url: 'https://example.com',
  baseUrl: '/',
  organizationName: 'xXValhallaCoderXx',
  projectName: 'huginn-second-brain',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  future: {
    v4: true,
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/xXValhallaCoderXx/huginn-second-brain/edit/main/apps/private-docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  themeConfig: {
    image: 'img/logo.svg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Huginn Private Docs',
      logo: {
        alt: 'Huginn Private Docs',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Runbooks',
        },
        {
          href: 'https://github.com/xXValhallaCoderXx/huginn-second-brain',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Private docs',
          items: [
            {
              label: 'Overview',
              to: '/',
            },
            {
              label: 'Operations runbook',
              to: '/operations-runbook',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Repository',
              href: 'https://github.com/xXValhallaCoderXx/huginn-second-brain',
            },
            {
              label: 'Railway health',
              href: 'https://huginn-second-brain-production.up.railway.app/telegram/health',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Huginn internal docs. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
}

module.exports = config
