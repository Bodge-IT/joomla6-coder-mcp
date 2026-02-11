import { simpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SyncConfig {
  branch: string;
  cacheDir: string;
  repoUrl: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  filesUpdated?: number;
  lastCommit?: string;
}

const DEFAULT_CONFIG: SyncConfig = {
  branch: process.env.JOOMLA_BRANCH || '6.1-dev',
  cacheDir: process.env.CACHE_DIR || path.join(__dirname, '..', '..', 'cache', 'libraries'),
  repoUrl: 'https://github.com/joomla/joomla-cms.git'
};

export class GitHubSync {
  private config: SyncConfig;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async sync(): Promise<SyncResult> {
    try {
      const cacheExists = await this.cacheExists();

      if (!cacheExists) {
        return await this.initialClone();
      } else {
        return await this.updateExisting();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Sync failed: ${message}`
      };
    }
  }

  private async cacheExists(): Promise<boolean> {
    try {
      await fs.access(path.join(this.config.cacheDir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  private async initialClone(): Promise<SyncResult> {
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    const repoGit = simpleGit(this.config.cacheDir);

    await repoGit.init();
    await repoGit.addRemote('origin', this.config.repoUrl);
    await repoGit.raw(['config', 'core.sparseCheckout', 'true']);

    const sparseCheckoutPath = path.join(this.config.cacheDir, '.git', 'info', 'sparse-checkout');
    await fs.mkdir(path.dirname(sparseCheckoutPath), { recursive: true });
    await fs.writeFile(sparseCheckoutPath, [
      'libraries/src/',
      'installation/sql/',
      'administrator/components/*/src/',
      'components/*/src/',
    ].join('\n') + '\n');

    await repoGit.fetch('origin', this.config.branch, ['--depth', '1']);
    await repoGit.checkout(`origin/${this.config.branch}`);

    const log = await repoGit.log({ maxCount: 1 });

    return {
      success: true,
      message: `Initial clone complete from branch ${this.config.branch}`,
      lastCommit: log.latest?.hash
    };
  }

  private async updateExisting(): Promise<SyncResult> {
    const repoGit = simpleGit(this.config.cacheDir);

    const beforeLog = await repoGit.log({ maxCount: 1 });
    const beforeCommit = beforeLog.latest?.hash;

    await repoGit.fetch('origin', this.config.branch, ['--depth', '1']);
    await repoGit.reset(['--hard', `origin/${this.config.branch}`]);

    const afterLog = await repoGit.log({ maxCount: 1 });
    const afterCommit = afterLog.latest?.hash;

    const updated = beforeCommit !== afterCommit;

    return {
      success: true,
      message: updated
        ? `Updated to latest commit on ${this.config.branch}`
        : `Already up to date on ${this.config.branch}`,
      lastCommit: afterCommit
    };
  }

  async getLastSyncInfo(): Promise<{ timestamp: string; commit: string } | null> {
    try {
      const repoGit = simpleGit(this.config.cacheDir);
      const log = await repoGit.log({ maxCount: 1 });

      if (log.latest) {
        return {
          timestamp: log.latest.date,
          commit: log.latest.hash
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  getLibrariesPath(): string {
    return path.join(this.config.cacheDir, 'libraries', 'src');
  }

  getSqlPath(): string {
    return path.join(this.config.cacheDir, 'installation', 'sql');
  }

  getCacheDir(): string {
    return this.config.cacheDir;
  }
}
