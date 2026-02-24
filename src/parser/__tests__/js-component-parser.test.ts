import { describe, it, expect } from 'vitest';
import { JsComponentParser } from '../js-component-parser.js';

describe('JsComponentParser', () => {
  const parser = new JsComponentParser();

  // ---------------------------------------------------------------------------
  // Basic customElements.define parsing
  // ---------------------------------------------------------------------------

  it('parses a simple web component with customElements.define', () => {
    const content = `
class JoomlaAlert extends HTMLElement {
  connectedCallback() {}
}
customElements.define('joomla-alert', JoomlaAlert);
`;
    const result = parser.parseFile(content, 'joomla-alert.es6.js');

    expect(result).not.toBeNull();
    expect(result!.tagName).toBe('joomla-alert');
    expect(result!.className).toBe('JoomlaAlert');
    expect(result!.filePath).toBe('joomla-alert.es6.js');
  });

  it('returns null for files with no customElements.define call', () => {
    const content = `
class PlainHelper {
  doSomething() {}
}
`;
    const result = parser.parseFile(content, 'helper.es6.js');
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // observedAttributes extraction
  // ---------------------------------------------------------------------------

  it('extracts observedAttributes correctly', () => {
    const content = `
class JoomlaTab extends HTMLElement {
  static get observedAttributes() {
    return ['orientation', 'remember', 'active'];
  }
}
customElements.define('joomla-tab', JoomlaTab);
`;
    const result = parser.parseFile(content, 'joomla-tab.w-c.es6.js');

    expect(result).not.toBeNull();
    expect(result!.attributes).toEqual(['orientation', 'remember', 'active']);
  });

  it('returns an empty attributes array when observedAttributes is absent', () => {
    const content = `
class JoomlaIcon extends HTMLElement {}
customElements.define('joomla-icon', JoomlaIcon);
`;
    const result = parser.parseFile(content, 'joomla-icon.es6.js');

    expect(result!.attributes).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Custom event extraction
  // ---------------------------------------------------------------------------

  it('extracts dispatched custom event names', () => {
    const content = `
class JoomlaField extends HTMLElement {
  handleChange() {
    this.dispatchEvent(new CustomEvent('joomla-field:changed', { bubbles: true }));
    this.dispatchEvent(new CustomEvent('joomla-field:updated'));
  }
}
customElements.define('joomla-field', JoomlaField);
`;
    const result = parser.parseFile(content, 'joomla-field.es6.js');

    expect(result!.events).toContain('joomla-field:changed');
    expect(result!.events).toContain('joomla-field:updated');
    expect(result!.events).toHaveLength(2);
  });

  it('deduplicates repeated event dispatches', () => {
    const content = `
class JoomlaWidget extends HTMLElement {
  open() { this.dispatchEvent(new CustomEvent('widget:open')); }
  close() { this.dispatchEvent(new CustomEvent('widget:close')); }
  reopen() { this.dispatchEvent(new CustomEvent('widget:open')); }
}
customElements.define('joomla-widget', JoomlaWidget);
`;
    const result = parser.parseFile(content, 'widget.es6.js');

    expect(result!.events).toHaveLength(2);
    expect(result!.events).toContain('widget:open');
    expect(result!.events).toContain('widget:close');
  });

  it('returns an empty events array when no CustomEvent is dispatched', () => {
    const content = `
class JoomlaStatic extends HTMLElement {}
customElements.define('joomla-static', JoomlaStatic);
`;
    const result = parser.parseFile(content, 'joomla-static.es6.js');
    expect(result!.events).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Property getter / setter extraction
  // ---------------------------------------------------------------------------

  it('extracts property getters and setters', () => {
    const content = `
class JoomlaEditor extends HTMLElement {
  get value() { return this._value; }
  set value(val) { this._value = val; }
  get readOnly() { return this._readOnly; }
}
customElements.define('joomla-editor', JoomlaEditor);
`;
    const result = parser.parseFile(content, 'joomla-editor.es6.js');

    const names = result!.properties.map(p => p.name);
    expect(names).toContain('value');
    expect(names).toContain('readOnly');
  });

  it('does not include observedAttributes in properties list', () => {
    const content = `
class JoomlaToggle extends HTMLElement {
  static get observedAttributes() { return ['checked']; }
  get checked() { return this.hasAttribute('checked'); }
  set checked(val) { this.toggleAttribute('checked', val); }
}
customElements.define('joomla-toggle', JoomlaToggle);
`;
    const result = parser.parseFile(content, 'joomla-toggle.es6.js');

    const names = result!.properties.map(p => p.name);
    expect(names).not.toContain('observedAttributes');
    expect(names).toContain('checked');
  });

  it('deduplicates properties that have both getter and setter', () => {
    const content = `
class JoomlaInput extends HTMLElement {
  get value() { return this._v; }
  set value(v) { this._v = v; }
}
customElements.define('joomla-input', JoomlaInput);
`;
    const result = parser.parseFile(content, 'joomla-input.es6.js');

    const valueProps = result!.properties.filter(p => p.name === 'value');
    expect(valueProps).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Slot extraction from template literals
  // ---------------------------------------------------------------------------

  it('extracts named slot names from template literals', () => {
    const content = `
class JoomlaCard extends HTMLElement {
  get template() {
    return \`<div>
      <slot name="header"></slot>
      <slot name="body"></slot>
    </div>\`;
  }
}
customElements.define('joomla-card', JoomlaCard);
`;
    const result = parser.parseFile(content, 'joomla-card.es6.js');

    expect(result!.slots).toContain('header');
    expect(result!.slots).toContain('body');
  });

  it('detects an unnamed default slot', () => {
    const content = `
class JoomlaWrapper extends HTMLElement {
  get template() {
    return \`<div><slot></slot></div>\`;
  }
}
customElements.define('joomla-wrapper', JoomlaWrapper);
`;
    const result = parser.parseFile(content, 'joomla-wrapper.es6.js');

    expect(result!.slots).toContain('');
  });

  it('returns an empty slots array when no slots exist', () => {
    const content = `
class JoomlaButton extends HTMLElement {
  get template() { return \`<button>Click me</button>\`; }
}
customElements.define('joomla-button', JoomlaButton);
`;
    const result = parser.parseFile(content, 'joomla-button.es6.js');
    expect(result!.slots).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // extends clause extraction
  // ---------------------------------------------------------------------------

  it('extracts the extends clause for HTMLElement', () => {
    const content = `
class JoomlaModal extends HTMLElement {}
customElements.define('joomla-modal', JoomlaModal);
`;
    const result = parser.parseFile(content, 'joomla-modal.es6.js');
    expect(result!.extendsElement).toBe('HTMLElement');
  });

  it('extracts a non-HTMLElement base class', () => {
    const content = `
class JoomlaForm extends HTMLFormElement {}
customElements.define('joomla-form', JoomlaForm);
`;
    const result = parser.parseFile(content, 'joomla-form.es6.js');
    expect(result!.extendsElement).toBe('HTMLFormElement');
  });

  it('returns undefined extendsElement when no extends clause is present', () => {
    // Bare class (unusual but should not crash)
    const content = `
class JoomlaMinimal {}
customElements.define('joomla-minimal', JoomlaMinimal);
`;
    const result = parser.parseFile(content, 'joomla-minimal.es6.js');
    expect(result!.extendsElement).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // JSDoc comment extraction
  // ---------------------------------------------------------------------------

  it('extracts the JSDoc block above the class definition', () => {
    const content = `
/**
 * JoomlaAlert component.
 * Displays contextual alert messages with optional dismiss button.
 */
class JoomlaAlert extends HTMLElement {}
customElements.define('joomla-alert', JoomlaAlert);
`;
    const result = parser.parseFile(content, 'joomla-alert.es6.js');

    expect(result!.docblock).toBeDefined();
    expect(result!.docblock).toContain('JoomlaAlert component');
    expect(result!.docblock).toContain('dismiss button');
  });

  it('returns undefined docblock when no JSDoc comment precedes the class', () => {
    const content = `
// A regular single-line comment
class JoomlaSimple extends HTMLElement {}
customElements.define('joomla-simple', JoomlaSimple);
`;
    const result = parser.parseFile(content, 'joomla-simple.es6.js');
    expect(result!.docblock).toBeUndefined();
  });

  it('does not confuse a JSDoc on a method with the class docblock', () => {
    const content = `
class JoomlaList extends HTMLElement {
  /**
   * Method-level docblock, not the class docblock.
   */
  connectedCallback() {}
}
customElements.define('joomla-list', JoomlaList);
`;
    const result = parser.parseFile(content, 'joomla-list.es6.js');
    // No JSDoc directly before "class JoomlaList", so should be undefined
    expect(result!.docblock).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Full component — integration style
  // ---------------------------------------------------------------------------

  it('parses a full web component correctly', () => {
    const content = `
/**
 * Joomla field media component.
 * Handles media selection for Joomla form fields.
 *
 * @since 4.0.0
 */
class JoomlaFieldMedia extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'disabled', 'readonly'];
  }

  get value() { return this.getAttribute('value') || ''; }
  set value(val) { this.setAttribute('value', val); }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(val) { this.toggleAttribute('disabled', val); }

  connectedCallback() {
    this.innerHTML = this.renderTemplate();
    this.dispatchEvent(new CustomEvent('joomla-media-field:connected', { bubbles: true, composed: true }));
  }

  renderTemplate() {
    return \`<div class="field-media-wrapper">
      <slot name="preview"></slot>
      <slot></slot>
    </div>\`;
  }

  select() {
    this.dispatchEvent(new CustomEvent('joomla-media-field:select', { bubbles: true }));
  }
}

customElements.define('joomla-field-media', JoomlaFieldMedia);
`;

    const result = parser.parseFile(content, 'system/fields/joomla-field-media.w-c.es6.js');

    expect(result).not.toBeNull();
    expect(result!.tagName).toBe('joomla-field-media');
    expect(result!.className).toBe('JoomlaFieldMedia');
    expect(result!.filePath).toBe('system/fields/joomla-field-media.w-c.es6.js');
    expect(result!.extendsElement).toBe('HTMLElement');
    expect(result!.attributes).toEqual(['value', 'disabled', 'readonly']);
    expect(result!.properties.map(p => p.name)).toContain('value');
    expect(result!.properties.map(p => p.name)).toContain('disabled');
    expect(result!.events).toContain('joomla-media-field:connected');
    expect(result!.events).toContain('joomla-media-field:select');
    expect(result!.slots).toContain('preview');
    expect(result!.slots).toContain('');
    expect(result!.docblock).toContain('Joomla field media component');
  });
});
