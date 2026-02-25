/**
 * Build script — generates data/index.json and data/schema.json from
 * a locally cached Joomla source tree (populated by joomla_sync or manual clone).
 *
 * Usage:
 *   npm run build-index
 *
 * Environment variables:
 *   CACHE_DIR   — override cache directory (default: cache/libraries)
 *   DATA_DIR    — override output directory (default: data)
 *   SQL_DIR     — override SQL directory (default: <CACHE_DIR>/installation/sql)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';
import { IndexBuilder } from '../parser/index-builder.js';
import { SqlSchemaParser } from '../parser/sql-schema-parser.js';
import { JsComponentParser, WebComponentIndex } from '../parser/js-component-parser.js';
import { GitHubSync } from '../sync/github-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const sync = new GitHubSync();
const librariesPath = process.env.LIBRARIES_PATH || sync.getLibrariesPath();
const sqlPath = process.env.SQL_DIR || sync.getSqlPath();
const mediaSourcePath = process.env.MEDIA_SOURCE_DIR || sync.getMediaSourcePath();
const indexPath = path.join(DATA_DIR, 'index.json.gz');
const schemaPath = path.join(DATA_DIR, 'schema.json.gz');
const webComponentIndexPath = path.join(DATA_DIR, 'webcomponents.json.gz');

const CACHE_MARKER = '/cache/libraries/';

/**
 * Strip the local cache directory prefix from a file path.
 * Turns absolute server paths into relative Joomla source paths so the
 * shipped JSON files contain no machine-specific references.
 */
function sanitiseFilePath(filePath: string): string {
  const idx = filePath.indexOf(CACHE_MARKER);
  if (idx !== -1) {
    return filePath.substring(idx + CACHE_MARKER.length);
  }
  return filePath;
}

async function main(): Promise<void> {
  console.log('build-index: starting');
  console.log('  libraries: ' + librariesPath);
  console.log('  sql:       ' + sqlPath);
  console.log('  output:    ' + DATA_DIR);

  // Check source exists
  try {
    await fs.access(librariesPath);
  } catch {
    console.error('ERROR: Libraries path not found: ' + librariesPath);
    console.error('Run joomla_sync first to clone the Joomla source cache, then re-run build-index.');
    process.exit(1);
  }

  await fs.mkdir(DATA_DIR, { recursive: true });

  // Build class index
  console.log('\nBuilding class index...');
  const indexBuilder = new IndexBuilder();
  const syncInfo = await sync.getLastSyncInfo();
  const idx = await indexBuilder.buildIndex(librariesPath, syncInfo?.commit, sync.getBranch());

  // Sanitise filePaths — strip absolute cache directory prefix
  let sanitised = 0;
  for (const cls of idx.classes) {
    if (cls.filePath) {
      const clean = sanitiseFilePath(cls.filePath);
      if (clean !== cls.filePath) {
        cls.filePath = clean;
        sanitised++;
      }
    }
  }
  console.log(`Sanitised ${sanitised} file paths`);

  await indexBuilder.saveIndex(idx, indexPath);
  console.log(`Saved index: ${idx.classes.length} classes → ${indexPath}`);

  // Build schema
  console.log('\nBuilding schema...');
  try {
    await fs.access(sqlPath);
    const schemaParser = new SqlSchemaParser();
    const schema = await schemaParser.parseDirectory(sqlPath);
    if (schema.tables.length > 0) {
      await fs.writeFile(schemaPath, zlib.gzipSync(JSON.stringify(schema, null, 2)));
      console.log(`Saved schema: ${schema.tables.length} tables → ${schemaPath}`);
    } else {
      console.warn('WARNING: No tables found in SQL directory — schema.json not written');
    }
  } catch {
    console.warn('WARNING: SQL path not found (' + sqlPath + ') — schema.json not written');
    console.warn('Set SQL_DIR env var to provide an alternative SQL directory.');
  }

  // Build web component index
  console.log('\nBuilding web component index...');
  try {
    await fs.access(mediaSourcePath);
    const jsParser = new JsComponentParser();
    const components = await jsParser.parseDirectory(mediaSourcePath);
    const syncInfo = await sync.getLastSyncInfo();
    const wcIndex: WebComponentIndex = {
      version: '1.0',
      lastSync: new Date().toISOString(),
      commit: syncInfo?.commit,
      components,
    };
    if (components.length > 0) {
      await fs.writeFile(webComponentIndexPath, zlib.gzipSync(JSON.stringify(wcIndex, null, 2)));
      console.log(`Saved web component index: ${components.length} components → ${webComponentIndexPath}`);
    } else {
      console.warn('WARNING: No web components found in media source directory — webcomponents.json not written');
    }
  } catch {
    console.warn('WARNING: Media source path not found (' + mediaSourcePath + ') — webcomponents.json not written');
    console.warn('Set MEDIA_SOURCE_DIR env var to provide an alternative media source directory.');
  }

  console.log('\nbuild-index: done');
}

main().catch((e) => {
  console.error('build-index failed:', e);
  process.exit(1);
});
