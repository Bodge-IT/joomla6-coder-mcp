export type PatternCategory =
  | 'mvc'
  | 'events'
  | 'forms'
  | 'database'
  | 'authentication'
  | 'routing'
  | 'assets'
  | 'language';

export interface CodingPatternInput {
  category: PatternCategory;
}

export interface CodingPattern {
  name: string;
  description: string;
  code: string;
  notes: string[];
}

export interface CodingPatternResult {
  category: PatternCategory;
  patterns: CodingPattern[];
}

const patterns: Record<PatternCategory, CodingPattern[]> = {
  mvc: [
    {
      name: 'Getting a Model in Controller',
      description: 'Access a model from a controller using the MVCFactory',
      code: `// In a controller
$model = $this->getModel('Item');
$item = $model->getItem($id);`,
      notes: [
        'Models are loaded via MVCFactory registered in service provider',
        'Model name maps to {Name}Model.php in Model directory'
      ]
    },
    {
      name: 'Form Controller Save',
      description: 'Standard save operation in FormController',
      code: `class ItemController extends FormController
{
    public function save($key = null, $urlVar = null)
    {
        // Check token
        $this->checkToken();

        // Get model and validate
        $model = $this->getModel();
        $data = $this->input->post->get('jform', [], 'array');
        $form = $model->getForm($data, false);

        $validData = $model->validate($form, $data);

        if ($validData === false) {
            $errors = $model->getErrors();
            // Handle errors
            return false;
        }

        // Save
        $model->save($validData);

        return true;
    }
}`,
      notes: [
        'Always check CSRF token first',
        'Use model validation before saving',
        'FormController provides default save/cancel actions'
      ]
    },
    {
      name: 'Admin Model with Database',
      description: 'AdminModel for database CRUD operations',
      code: `class ItemModel extends AdminModel
{
    public function getTable($name = 'Item', $prefix = 'Administrator', $options = [])
    {
        return parent::getTable($name, $prefix, $options);
    }

    public function getForm($data = [], $loadData = true)
    {
        $form = $this->loadForm(
            'com_example.item',
            'item',
            ['control' => 'jform', 'load_data' => $loadData]
        );

        return $form;
    }

    protected function loadFormData()
    {
        return $this->getItem();
    }
}`,
      notes: [
        'AdminModel handles standard admin CRUD',
        'Form XML files go in administrator/forms/',
        'Table class handles actual database operations'
      ]
    }
  ],
  events: [
    {
      name: 'Plugin Event Subscription (PHP 8)',
      description: 'Modern event subscription using attributes',
      code: `use Joomla\\CMS\\Plugin\\CMSPlugin;
use Joomla\\Event\\SubscriberInterface;

class MyPlugin extends CMSPlugin implements SubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [
            'onContentPrepare' => 'handleContentPrepare',
            'onAfterRoute' => ['handleAfterRoute', Priority::NORMAL],
        ];
    }

    public function handleContentPrepare(ContentPrepareEvent $event): void
    {
        $context = $event->getContext();
        $item = $event->getItem();
        $params = $event->getParams();

        // Modify content
        $item->text = str_replace('{marker}', 'replacement', $item->text);
    }
}`,
      notes: [
        'Implement SubscriberInterface for event subscriptions',
        'Use typed event objects instead of generic arguments',
        'Priority levels: LOW, BELOW_NORMAL, NORMAL, ABOVE_NORMAL, HIGH'
      ]
    },
    {
      name: 'Dispatching Custom Events',
      description: 'Fire custom events from component code',
      code: `use Joomla\\CMS\\Event\\AbstractEvent;
use Joomla\\CMS\\Factory;

// Create event
$event = new MyCustomEvent('onMyEvent', [
    'subject' => $this,
    'data' => $data,
]);

// Dispatch
$dispatcher = Factory::getApplication()->getDispatcher();
$dispatcher->dispatch('onMyEvent', $event);

// Get modified results
$result = $event->getArgument('result');`,
      notes: [
        'Create custom event classes extending AbstractEvent',
        'Events can be modified by plugins and results retrieved after dispatch',
        'Use event names prefixed with "on" by convention'
      ]
    }
  ],
  forms: [
    {
      name: 'Form XML Definition',
      description: 'Standard form field definition',
      code: `<?xml version="1.0" encoding="utf-8"?>
<form>
    <fieldset name="basic">
        <field
            name="title"
            type="text"
            label="JGLOBAL_TITLE"
            required="true"
            maxlength="255"
        />

        <field
            name="catid"
            type="categoryedit"
            label="JCATEGORY"
            extension="com_example"
            required="true"
        />

        <field
            name="state"
            type="list"
            label="JSTATUS"
            default="1"
        >
            <option value="1">JPUBLISHED</option>
            <option value="0">JUNPUBLISHED</option>
            <option value="-2">JTRASHED</option>
        </field>
    </fieldset>
</form>`,
      notes: [
        'Use language strings for labels',
        'Joomla provides many built-in field types',
        'Custom fields go in administrator/components/com_example/src/Field/'
      ]
    },
    {
      name: 'Custom Form Field',
      description: 'Creating a custom form field type',
      code: `namespace Vendor\\Component\\Example\\Administrator\\Field;

use Joomla\\CMS\\Form\\Field\\ListField;

class CustomField extends ListField
{
    protected $type = 'Custom';

    protected function getOptions()
    {
        $options = parent::getOptions();

        // Add custom options
        $db = $this->getDatabase();
        $query = $db->getQuery(true)
            ->select($db->quoteName(['id', 'title']))
            ->from($db->quoteName('#__custom_table'));

        $db->setQuery($query);
        $items = $db->loadObjectList();

        foreach ($items as $item) {
            $options[] = HTMLHelper::_(
                'select.option',
                $item->id,
                $item->title
            );
        }

        return $options;
    }
}`,
      notes: [
        'Extend appropriate base field class',
        'Register field namespace in service provider',
        'Use type attribute matching class name (without "Field" suffix)'
      ]
    }
  ],
  database: [
    {
      name: 'Query Builder',
      description: 'Building database queries',
      code: `$db = Factory::getContainer()->get(DatabaseInterface::class);
$query = $db->getQuery(true);

$query->select($db->quoteName(['a.id', 'a.title', 'c.title'], ['id', 'title', 'category']))
    ->from($db->quoteName('#__items', 'a'))
    ->join('LEFT', $db->quoteName('#__categories', 'c'), 'c.id = a.catid')
    ->where($db->quoteName('a.state') . ' = 1')
    ->where($db->quoteName('a.created_by') . ' = :userId')
    ->bind(':userId', $userId, ParameterType::INTEGER)
    ->order($db->quoteName('a.created') . ' DESC');

$db->setQuery($query);
$items = $db->loadObjectList();`,
      notes: [
        'Always use quoteName() for identifiers',
        'Use parameter binding for values (prevents SQL injection)',
        'loadObjectList() returns array of objects, loadAssocList() for arrays'
      ]
    },
    {
      name: 'Table Class',
      description: 'Table abstraction for CRUD operations',
      code: `namespace Vendor\\Component\\Example\\Administrator\\Table;

use Joomla\\CMS\\Table\\Table;
use Joomla\\Database\\DatabaseDriver;

class ItemTable extends Table
{
    public function __construct(DatabaseDriver $db)
    {
        parent::__construct('#__items', 'id', $db);
    }

    public function check()
    {
        // Validate data before save
        if (empty($this->title)) {
            $this->setError(Text::_('COM_EXAMPLE_ERROR_TITLE_REQUIRED'));
            return false;
        }

        // Generate alias from title if empty
        if (empty($this->alias)) {
            $this->alias = ApplicationHelper::stringURLSafe($this->title);
        }

        return true;
    }

    public function store($updateNulls = true)
    {
        $date = Factory::getDate()->toSql();
        $user = Factory::getApplication()->getIdentity();

        if (empty($this->id)) {
            $this->created = $date;
            $this->created_by = $user->id;
        }

        $this->modified = $date;
        $this->modified_by = $user->id;

        return parent::store($updateNulls);
    }
}`,
      notes: [
        'Table classes wrap database tables',
        'check() validates before store()',
        'bind() populates from arrays/objects'
      ]
    }
  ],
  authentication: [
    {
      name: 'Checking User Permissions',
      description: 'Access control checks',
      code: `$user = Factory::getApplication()->getIdentity();

// Check global permission
if (!$user->authorise('core.edit', 'com_example')) {
    throw new \\Exception(Text::_('JERROR_ALERTNOAUTHOR'), 403);
}

// Check item-level permission
if (!$user->authorise('core.edit', 'com_example.item.' . $itemId)) {
    // Check edit.own for own items
    if ($user->authorise('core.edit.own', 'com_example') && $item->created_by == $user->id) {
        // Allow
    } else {
        throw new \\Exception(Text::_('JERROR_ALERTNOAUTHOR'), 403);
    }
}

// In controller
$this->checkToken();  // CSRF check
$this->allowEdit($data, 'id');  // Edit permission check`,
      notes: [
        'Define permissions in access.xml',
        'Use asset table for item-level permissions',
        'Always check CSRF token on form submissions'
      ]
    },
    {
      name: 'Access Control Definition',
      description: 'Component access.xml structure',
      code: `<?xml version="1.0" encoding="utf-8"?>
<access component="com_example">
    <section name="component">
        <action name="core.admin" title="JACTION_ADMIN" />
        <action name="core.options" title="JACTION_OPTIONS" />
        <action name="core.manage" title="JACTION_MANAGE" />
        <action name="core.create" title="JACTION_CREATE" />
        <action name="core.delete" title="JACTION_DELETE" />
        <action name="core.edit" title="JACTION_EDIT" />
        <action name="core.edit.state" title="JACTION_EDITSTATE" />
        <action name="core.edit.own" title="JACTION_EDITOWN" />
    </section>
    <section name="item">
        <action name="core.edit" title="JACTION_EDIT" />
        <action name="core.edit.state" title="JACTION_EDITSTATE" />
        <action name="core.delete" title="JACTION_DELETE" />
    </section>
</access>`,
      notes: [
        'Sections define permission contexts',
        'Standard actions: admin, manage, create, delete, edit, edit.state, edit.own',
        'Custom actions can be added'
      ]
    }
  ],
  routing: [
    {
      name: 'SEF Router',
      description: 'Component router for SEF URLs',
      code: `namespace Vendor\\Component\\Example\\Site\\Service;

use Joomla\\CMS\\Component\\Router\\RouterView;
use Joomla\\CMS\\Component\\Router\\RouterViewConfiguration;
use Joomla\\CMS\\Component\\Router\\Rules\\MenuRules;
use Joomla\\CMS\\Component\\Router\\Rules\\NomenuRules;
use Joomla\\CMS\\Component\\Router\\Rules\\StandardRules;

class Router extends RouterView
{
    public function __construct($app, $menu)
    {
        $items = new RouterViewConfiguration('items');
        $items->setKey('id');
        $this->registerView($items);

        $item = new RouterViewConfiguration('item');
        $item->setKey('id')->setParent($items);
        $this->registerView($item);

        parent::__construct($app, $menu);

        $this->attachRule(new MenuRules($this));
        $this->attachRule(new StandardRules($this));
        $this->attachRule(new NomenuRules($this));
    }

    public function getItemSegment($id, $query)
    {
        $db = $this->getDatabase();
        $dbQuery = $db->getQuery(true)
            ->select($db->quoteName('alias'))
            ->from($db->quoteName('#__items'))
            ->where($db->quoteName('id') . ' = :id')
            ->bind(':id', $id);

        return [$id => $db->setQuery($dbQuery)->loadResult()];
    }

    public function getItemId($segment, $query)
    {
        $db = $this->getDatabase();
        $dbQuery = $db->getQuery(true)
            ->select($db->quoteName('id'))
            ->from($db->quoteName('#__items'))
            ->where($db->quoteName('alias') . ' = :alias')
            ->bind(':alias', $segment);

        return (int) $db->setQuery($dbQuery)->loadResult();
    }
}`,
      notes: [
        'RouterView handles most common routing patterns',
        'get{View}Segment converts ID to URL segment',
        'get{View}Id converts URL segment back to ID',
        'MenuRules, StandardRules, NomenuRules handle different URL patterns'
      ]
    }
  ],
  assets: [
    {
      name: 'Web Asset Manager',
      description: 'Loading CSS and JavaScript',
      code: `// In view or controller
$wa = Factory::getApplication()->getDocument()->getWebAssetManager();

// Use registered assets
$wa->useScript('jquery');
$wa->useStyle('bootstrap.css');

// Use component assets (from joomla.asset.json)
$wa->useScript('com_example.admin');
$wa->useStyle('com_example.admin');

// Register and use inline
$wa->registerAndUseStyle(
    'com_example.custom',
    'com_example/custom.css',
    [],
    ['version' => 'auto']
);

// Add inline script
$wa->addInlineScript('console.log("loaded");');`,
      notes: [
        'Define assets in media/com_example/joomla.asset.json',
        'Assets support dependencies, version hashing',
        'Use registerAndUse* for one-off assets'
      ]
    },
    {
      name: 'Asset Definition File',
      description: 'joomla.asset.json structure',
      code: `{
  "$schema": "https://developer.joomla.org/schemas/json-schema/web_assets.json",
  "name": "com_example",
  "version": "1.0.0",
  "assets": [
    {
      "name": "com_example.admin",
      "type": "style",
      "uri": "com_example/admin.css",
      "dependencies": ["bootstrap.css"],
      "attributes": {
        "media": "screen"
      }
    },
    {
      "name": "com_example.admin",
      "type": "script",
      "uri": "com_example/admin.js",
      "dependencies": ["jquery", "core"],
      "attributes": {
        "defer": true
      }
    }
  ]
}`,
      notes: [
        'Place in media/com_example/joomla.asset.json',
        'Same name can have both script and style entries',
        'Dependencies are loaded automatically'
      ]
    }
  ],
  language: [
    {
      name: 'Language Strings',
      description: 'Using translation strings',
      code: `use Joomla\\CMS\\Language\\Text;

// Simple string
echo Text::_('COM_EXAMPLE_TITLE');

// With sprintf replacement
echo Text::sprintf('COM_EXAMPLE_ITEMS_COUNT', $count);

// Plural forms
echo Text::plural('COM_EXAMPLE_N_ITEMS', $count);

// With script
Text::script('COM_EXAMPLE_CONFIRM_DELETE');
// In JavaScript: Joomla.Text._('COM_EXAMPLE_CONFIRM_DELETE')`,
      notes: [
        'Language files go in administrator/language/en-GB/',
        'Format: COM_COMPONENTNAME_STRING="Translation"',
        'Use Text::script() to make strings available in JavaScript'
      ]
    },
    {
      name: 'Language File Structure',
      description: 'INI language file format',
      code: `; Component language file
; administrator/language/en-GB/com_example.ini

COM_EXAMPLE="Example"
COM_EXAMPLE_DESCRIPTION="Example component description"

; Manager view
COM_EXAMPLE_MANAGER_ITEMS="Items"
COM_EXAMPLE_MANAGER_ITEM="Item"

; Form labels
COM_EXAMPLE_FIELD_TITLE_LABEL="Title"
COM_EXAMPLE_FIELD_TITLE_DESC="Enter the item title"

; Messages
COM_EXAMPLE_ITEM_SAVED="Item saved successfully"
COM_EXAMPLE_N_ITEMS_DELETED="%d items deleted"
COM_EXAMPLE_N_ITEMS_DELETED_1="1 item deleted"`,
      notes: [
        'Use .ini format (KEY="value")',
        'Prefix all keys with COM_COMPONENTNAME_',
        'Provide _1 suffix for singular forms with plural strings'
      ]
    }
  ]
};

export function getCodingPatterns(input: CodingPatternInput): CodingPatternResult {
  const { category } = input;

  if (!patterns[category]) {
    throw new Error(`Unknown pattern category: ${category}. Valid categories: ${Object.keys(patterns).join(', ')}`);
  }

  return {
    category,
    patterns: patterns[category]
  };
}

export function formatCodingPatterns(result: CodingPatternResult): string {
  const lines: string[] = [];

  lines.push(`## Joomla 6 Coding Patterns: ${result.category.toUpperCase()}`);
  lines.push('');

  for (const pattern of result.patterns) {
    lines.push(`### ${pattern.name}`);
    lines.push('');
    lines.push(pattern.description);
    lines.push('');
    lines.push('```php');
    lines.push(pattern.code);
    lines.push('```');
    lines.push('');

    if (pattern.notes.length > 0) {
      lines.push('**Notes:**');
      for (const note of pattern.notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function listPatternCategories(): string {
  const categories = Object.keys(patterns) as PatternCategory[];
  const lines: string[] = [];

  lines.push('## Available Coding Pattern Categories');
  lines.push('');

  for (const cat of categories) {
    const count = patterns[cat].length;
    lines.push(`- **${cat}** (${count} patterns)`);
  }

  lines.push('');
  lines.push('Use `joomla_coding_patterns` with a category name to see patterns.');

  return lines.join('\n');
}
