export type ExtensionType = 'component' | 'plugin' | 'module' | 'template' | 'library';

export interface ExtensionStructureInput {
  type: ExtensionType;
  name?: string;
}

export interface ExtensionStructureResult {
  type: ExtensionType;
  structure: DirectoryStructure;
  manifest: string;
  notes: string[];
}

export interface DirectoryStructure {
  name: string;
  type: 'dir' | 'file';
  children?: DirectoryStructure[];
  description?: string;
}

export function getExtensionStructure(input: ExtensionStructureInput): ExtensionStructureResult {
  const { type, name = 'example' } = input;

  switch (type) {
    case 'component':
      return getComponentStructure(name);
    case 'plugin':
      return getPluginStructure(name);
    case 'module':
      return getModuleStructure(name);
    case 'template':
      return getTemplateStructure(name);
    case 'library':
      return getLibraryStructure(name);
    default:
      throw new Error(`Unknown extension type: ${type}`);
  }
}

function getComponentStructure(name: string): ExtensionStructureResult {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    type: 'component',
    structure: {
      name: `com_${name}`,
      type: 'dir',
      children: [
        {
          name: 'administrator',
          type: 'dir',
          children: [
            { name: 'forms', type: 'dir', description: 'XML form definitions' },
            { name: 'services', type: 'dir', children: [
              { name: 'provider.php', type: 'file', description: 'DI service provider' }
            ]},
            { name: 'sql', type: 'dir', children: [
              { name: 'install.mysql.utf8.sql', type: 'file' },
              { name: 'uninstall.mysql.utf8.sql', type: 'file' }
            ]},
            { name: 'src', type: 'dir', children: [
              { name: 'Controller', type: 'dir' },
              { name: 'Extension', type: 'dir', children: [
                { name: `${ucName}Component.php`, type: 'file', description: 'Main component class' }
              ]},
              { name: 'Model', type: 'dir' },
              { name: 'Service', type: 'dir', children: [
                { name: 'HTML', type: 'dir' }
              ]},
              { name: 'Table', type: 'dir' },
              { name: 'View', type: 'dir' }
            ]},
            { name: 'tmpl', type: 'dir', description: 'Admin view templates' }
          ]
        },
        {
          name: 'site',
          type: 'dir',
          children: [
            { name: 'src', type: 'dir', children: [
              { name: 'Controller', type: 'dir' },
              { name: 'Model', type: 'dir' },
              { name: 'Service', type: 'dir', children: [
                { name: 'Router.php', type: 'file', description: 'SEF URL router' }
              ]},
              { name: 'View', type: 'dir' }
            ]},
            { name: 'tmpl', type: 'dir', description: 'Site view templates' }
          ]
        },
        { name: `${name}.xml`, type: 'file', description: 'Installation manifest' }
      ]
    },
    manifest: generateComponentManifest(name),
    notes: [
      'Components use PSR-4 autoloading with namespace Vendor\\Component\\ComponentName',
      'Service provider must implement Joomla\\DI\\ServiceProviderInterface',
      'Main component class extends Joomla\\CMS\\Extension\\MVCComponent',
      'Controllers extend Joomla\\CMS\\MVC\\Controller\\BaseController or FormController',
      'Models extend Joomla\\CMS\\MVC\\Model\\ListModel, FormModel, or AdminModel',
      'Views extend Joomla\\CMS\\MVC\\View\\HtmlView'
    ]
  };
}

function getPluginStructure(name: string): ExtensionStructureResult {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    type: 'plugin',
    structure: {
      name: `plg_system_${name}`,
      type: 'dir',
      children: [
        { name: 'services', type: 'dir', children: [
          { name: 'provider.php', type: 'file', description: 'DI service provider' }
        ]},
        { name: 'src', type: 'dir', children: [
          { name: 'Extension', type: 'dir', children: [
            { name: `${ucName}.php`, type: 'file', description: 'Main plugin class' }
          ]}
        ]},
        { name: `${name}.xml`, type: 'file', description: 'Installation manifest' }
      ]
    },
    manifest: generatePluginManifest(name),
    notes: [
      'Plugins use PSR-4 autoloading with namespace Vendor\\Plugin\\Group\\PluginName',
      'Plugin groups: system, content, user, authentication, editors, etc.',
      'Main class extends Joomla\\CMS\\Plugin\\CMSPlugin',
      'Use PHP 8 attributes for event subscription: #[\\Joomla\\Event\\Listener\\ListenerPriority(Priority::NORMAL)]',
      'Service provider registers the plugin via PluginService::register()'
    ]
  };
}

function getModuleStructure(name: string): ExtensionStructureResult {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    type: 'module',
    structure: {
      name: `mod_${name}`,
      type: 'dir',
      children: [
        { name: 'services', type: 'dir', children: [
          { name: 'provider.php', type: 'file', description: 'DI service provider' }
        ]},
        { name: 'src', type: 'dir', children: [
          { name: 'Dispatcher', type: 'dir', children: [
            { name: 'Dispatcher.php', type: 'file', description: 'Module dispatcher' }
          ]}
        ]},
        { name: 'tmpl', type: 'dir', children: [
          { name: 'default.php', type: 'file', description: 'Default template' }
        ]},
        { name: `mod_${name}.xml`, type: 'file', description: 'Installation manifest' }
      ]
    },
    manifest: generateModuleManifest(name),
    notes: [
      'Modules use PSR-4 autoloading with namespace Vendor\\Module\\ModuleName',
      'Dispatcher extends Joomla\\CMS\\Dispatcher\\AbstractModuleDispatcher',
      'Data is passed to template via $this->getLayoutData()',
      'Site modules go in /modules, admin modules in /administrator/modules'
    ]
  };
}

function getTemplateStructure(name: string): ExtensionStructureResult {
  return {
    type: 'template',
    structure: {
      name: `tpl_${name}`,
      type: 'dir',
      children: [
        { name: 'html', type: 'dir', description: 'Template overrides' },
        { name: 'css', type: 'dir' },
        { name: 'js', type: 'dir' },
        { name: 'images', type: 'dir' },
        { name: 'component.php', type: 'file', description: 'Component-only layout' },
        { name: 'error.php', type: 'file', description: 'Error page template' },
        { name: 'index.php', type: 'file', description: 'Main template file' },
        { name: 'offline.php', type: 'file', description: 'Offline page template' },
        { name: 'templateDetails.xml', type: 'file', description: 'Installation manifest' }
      ]
    },
    manifest: generateTemplateManifest(name),
    notes: [
      'Templates render the final HTML output',
      'Use $this->getDocument() to access document object',
      'Use <jdoc:include type="component" /> to render component output',
      'Use <jdoc:include type="modules" name="position-name" /> for module positions',
      'Override component/module output in html/ folder'
    ]
  };
}

function getLibraryStructure(name: string): ExtensionStructureResult {
  return {
    type: 'library',
    structure: {
      name: `lib_${name}`,
      type: 'dir',
      children: [
        { name: 'src', type: 'dir', description: 'Library source files' },
        { name: `${name}.xml`, type: 'file', description: 'Installation manifest' }
      ]
    },
    manifest: generateLibraryManifest(name),
    notes: [
      'Libraries provide shared code for other extensions',
      'Installed to /libraries/{name}/',
      'Use PSR-4 autoloading',
      'Register namespace in manifest via <namespace> element'
    ]
  };
}

function generateComponentManifest(name: string): string {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);
  return `<?xml version="1.0" encoding="utf-8"?>
<extension type="component" method="upgrade">
    <name>com_${name}</name>
    <author>Your Name</author>
    <creationDate>${new Date().toISOString().split('T')[0]}</creationDate>
    <version>1.0.0</version>
    <description>COM_${name.toUpperCase()}_DESCRIPTION</description>
    <namespace path="src">Vendor\\Component\\${ucName}</namespace>

    <install>
        <sql><file driver="mysql" charset="utf8">sql/install.mysql.utf8.sql</file></sql>
    </install>
    <uninstall>
        <sql><file driver="mysql" charset="utf8">sql/uninstall.mysql.utf8.sql</file></sql>
    </uninstall>

    <files folder="site">
        <folder>src</folder>
        <folder>tmpl</folder>
    </files>

    <administration>
        <files folder="administrator">
            <folder>forms</folder>
            <folder>services</folder>
            <folder>sql</folder>
            <folder>src</folder>
            <folder>tmpl</folder>
        </files>
    </administration>
</extension>`;
}

function generatePluginManifest(name: string): string {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);
  return `<?xml version="1.0" encoding="utf-8"?>
<extension type="plugin" group="system" method="upgrade">
    <name>plg_system_${name}</name>
    <author>Your Name</author>
    <creationDate>${new Date().toISOString().split('T')[0]}</creationDate>
    <version>1.0.0</version>
    <description>PLG_SYSTEM_${name.toUpperCase()}_DESCRIPTION</description>
    <namespace path="src">Vendor\\Plugin\\System\\${ucName}</namespace>

    <files>
        <folder>services</folder>
        <folder>src</folder>
    </files>
</extension>`;
}

function generateModuleManifest(name: string): string {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);
  return `<?xml version="1.0" encoding="utf-8"?>
<extension type="module" client="site" method="upgrade">
    <name>mod_${name}</name>
    <author>Your Name</author>
    <creationDate>${new Date().toISOString().split('T')[0]}</creationDate>
    <version>1.0.0</version>
    <description>MOD_${name.toUpperCase()}_DESCRIPTION</description>
    <namespace path="src">Vendor\\Module\\${ucName}</namespace>

    <files>
        <folder>services</folder>
        <folder>src</folder>
        <folder>tmpl</folder>
    </files>

    <config>
        <fields name="params">
            <fieldset name="basic">
            </fieldset>
        </fields>
    </config>
</extension>`;
}

function generateTemplateManifest(name: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<extension type="template" client="site" method="upgrade">
    <name>tpl_${name}</name>
    <author>Your Name</author>
    <creationDate>${new Date().toISOString().split('T')[0]}</creationDate>
    <version>1.0.0</version>
    <description>TPL_${name.toUpperCase()}_DESCRIPTION</description>

    <files>
        <folder>css</folder>
        <folder>html</folder>
        <folder>images</folder>
        <folder>js</folder>
        <filename>component.php</filename>
        <filename>error.php</filename>
        <filename>index.php</filename>
        <filename>offline.php</filename>
    </files>

    <positions>
        <position>header</position>
        <position>sidebar</position>
        <position>main-top</position>
        <position>main-bottom</position>
        <position>footer</position>
    </positions>
</extension>`;
}

function generateLibraryManifest(name: string): string {
  const ucName = name.charAt(0).toUpperCase() + name.slice(1);
  return `<?xml version="1.0" encoding="utf-8"?>
<extension type="library" method="upgrade">
    <name>lib_${name}</name>
    <libraryname>${name}</libraryname>
    <author>Your Name</author>
    <creationDate>${new Date().toISOString().split('T')[0]}</creationDate>
    <version>1.0.0</version>
    <description>LIB_${name.toUpperCase()}_DESCRIPTION</description>
    <namespace path="src">Vendor\\Library\\${ucName}</namespace>

    <files folder="src">
        <folder>.</folder>
    </files>
</extension>`;
}

export function formatExtensionStructure(result: ExtensionStructureResult): string {
  const lines: string[] = [];

  lines.push(`## Joomla 6 ${result.type.charAt(0).toUpperCase() + result.type.slice(1)} Structure`);
  lines.push('');
  lines.push('### Directory Structure');
  lines.push('```');
  lines.push(formatDirectoryTree(result.structure, ''));
  lines.push('```');

  lines.push('');
  lines.push('### Manifest (XML)');
  lines.push('```xml');
  lines.push(result.manifest);
  lines.push('```');

  lines.push('');
  lines.push('### Notes');
  for (const note of result.notes) {
    lines.push(`- ${note}`);
  }

  return lines.join('\n');
}

function formatDirectoryTree(node: DirectoryStructure, indent: string): string {
  const lines: string[] = [];
  const marker = node.type === 'dir' ? '📁' : '📄';
  const desc = node.description ? ` # ${node.description}` : '';

  lines.push(`${indent}${marker} ${node.name}${desc}`);

  if (node.children) {
    for (const child of node.children) {
      lines.push(formatDirectoryTree(child, indent + '  '));
    }
  }

  return lines.join('\n');
}
