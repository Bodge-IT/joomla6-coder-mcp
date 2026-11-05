import { describe, it, expect } from 'vitest';
import { getCodingPatterns, formatCodingPatterns } from '../coding-patterns.js';

describe('mvc pattern: giving your models a service of your own', () => {
  const result = getCodingPatterns({ category: 'mvc' });
  const pattern = result.patterns.find(p => p.name.startsWith('Giving Your Models a Service'));

  it('is listed in the mvc category', () => {
    expect(pattern).toBeDefined();
  });

  it('extends the core provider through its 6.2 hooks', () => {
    expect(pattern!.code).toContain('extends MVCFactoryProvider');
    expect(pattern!.code).toContain('protected function createMVCFactory(): MVCFactoryInterface');
    expect(pattern!.code).toContain('parent::injectServicesIntoFactory($factory, $container);');
  });

  it('keeps core\'s factory for the API client', () => {
    expect(pattern!.code).toContain("isClient('api')");
    expect(pattern!.code).toContain('return parent::createMVCFactory();');
  });

  it('warns against creating the service in the model and copying the provider', () => {
    expect(pattern!.notes.some(n => n.startsWith('Avoid: creating the service inside the model'))).toBe(true);
    expect(pattern!.notes.some(n => n.startsWith('Avoid on 6.2 and later: copying'))).toBe(true);
  });

  it('renders single backslashes in PHP namespaces and offers lookups', () => {
    const text = formatCodingPatterns(result);
    expect(text).toContain('use Joomla\\CMS\\Extension\\Service\\Provider\\MVCFactory as MVCFactoryProvider;');
    expect(text).toContain("new ShopMVCFactoryProvider('\\\\Acme\\\\Component\\\\Shop')");
    expect(text).toContain('joomla_lookup_class("MVCFactoryInterface")');
  });
});
