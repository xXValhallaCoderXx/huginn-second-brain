/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Overview',
    },
    {
      type: 'category',
      label: 'Operate',
      items: ['operations-runbook', 'incident-playbook'],
    },
  ],
}

module.exports = sidebars
