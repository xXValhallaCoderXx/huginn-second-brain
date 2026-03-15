const { themes: prismThemes } = require('prism-react-renderer')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Huginn Public Docs',
  tagline: 'Public-facing docs for product users and contributors',
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
          editUrl: 'https://github.com/xXValhallaCoderXx/huginn-second-brain/edit/main/apps/public-docs/',
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
      title: 'Huginn Public Docs',
      logo: {
        alt: 'Huginn Public Docs',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
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
          title: 'Docs',
          items: [
            {
              label: 'Overview',
              to: '/',
            },
            {
              label: 'Getting started',
              to: '/getting-started',
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
              label: 'API service',
              href: 'https://huginn-second-brain-production.up.railway.app/telegram/health',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Huginn. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
}

module.exports = config
