import { JoomlaIndex } from '../parser/index-builder.js';
import { ParsedClass } from '../parser/php-parser.js';

export interface GetServicesInput {
  filter?: string;
  limit?: number;
}

export interface ServiceInfo {
  name: string;
  fqn: string;
  type: 'provider' | 'interface' | 'factory';
  description?: string;
  methods: string[];
}

export interface GetServicesResult {
  services: ServiceInfo[];
  total: number;
}

export function getServices(index: JoomlaIndex, input: GetServicesInput = {}): GetServicesResult {
  const { filter, limit = 30 } = input;
  const services: ServiceInfo[] = [];

  // Find service providers
  const serviceProviders = index.classes.filter(c =>
    c.name.endsWith('ServiceProvider') ||
    c.implements.some(i => i.includes('ServiceProviderInterface')) ||
    c.namespace.includes('Service')
  );

  for (const cls of serviceProviders) {
    const info = extractServiceInfo(cls);
    if (info) {
      services.push(info);
    }
  }

  // Find factory classes
  const factories = index.classes.filter(c =>
    c.name.endsWith('Factory') ||
    c.namespace.includes('Factory')
  );

  for (const cls of factories) {
    services.push({
      name: cls.name,
      fqn: cls.fqn,
      type: 'factory',
      description: cls.docblock,
      methods: cls.methods.filter(m => m.visibility === 'public').map(m => m.name)
    });
  }

  // Apply filter
  let filtered = services;
  if (filter) {
    const filterLower = filter.toLowerCase();
    filtered = services.filter(s =>
      s.name.toLowerCase().includes(filterLower) ||
      s.fqn.toLowerCase().includes(filterLower)
    );
  }

  filtered = filtered.slice(0, limit);

  return {
    services: filtered,
    total: services.length
  };
}

function extractServiceInfo(cls: ParsedClass): ServiceInfo {
  return {
    name: cls.name,
    fqn: cls.fqn,
    type: cls.name.endsWith('ServiceProvider') ? 'provider' : 'interface',
    description: cls.docblock,
    methods: cls.methods
      .filter(m => m.visibility === 'public')
      .map(m => m.name)
  };
}

export function formatServicesResult(result: GetServicesResult): string {
  const lines: string[] = [];

  lines.push(`## Joomla 6 DI Services`);
  lines.push(`Found ${result.services.length} services`);
  lines.push('');

  if (result.services.length === 0) {
    lines.push('No services found matching the criteria.');
    return lines.join('\n');
  }

  // Group by type
  const providers = result.services.filter(s => s.type === 'provider');
  const factories = result.services.filter(s => s.type === 'factory');
  const interfaces = result.services.filter(s => s.type === 'interface');

  if (providers.length > 0) {
    lines.push('### Service Providers');
    lines.push('');
    for (const svc of providers) {
      lines.push(`#### ${svc.name}`);
      lines.push(`\`${svc.fqn}\``);
      if (svc.methods.length > 0) {
        lines.push(`Methods: ${svc.methods.join(', ')}`);
      }
      lines.push('');
    }
  }

  if (factories.length > 0) {
    lines.push('### Factories');
    lines.push('');
    for (const svc of factories) {
      lines.push(`#### ${svc.name}`);
      lines.push(`\`${svc.fqn}\``);
      if (svc.methods.length > 0) {
        lines.push(`Methods: ${svc.methods.join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
