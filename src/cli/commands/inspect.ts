import { loadEnv } from '../../config/env.ts';
import { getCache } from '../../storage/cache.ts';
import { printBanner, printError, ok, info, warn, hr, formatBytes } from '../ui/display.ts';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// inspect command — view cache stats and manage cached data
// ─────────────────────────────────────────────────────────────────────────────

export interface InspectCommandOptions {
  list?: boolean;
  stats?: boolean;
  clear?: boolean;
  clearExpired?: boolean;
}

export async function runInspectCommand(opts: InspectCommandOptions): Promise<void> {
  let cfg;
  try {
    cfg = loadEnv();
  } catch (err: unknown) {
    printError('Configuration error', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  await printBanner();

  const cache = getCache(cfg.CACHE_DIR, cfg.CACHE_TTL_HOURS);

  if (opts.clear) {
    const count = await cache.clear();
    console.log(ok(`Cleared ${count} cached entries`));
    console.log('');
    return;
  }

  if (opts.clearExpired) {
    const count = await cache.clearExpired();
    console.log(ok(`Removed ${count} expired entries`));
    console.log('');
    return;
  }

  // Default: show stats
  const stats = await cache.getStats();
  console.log(chalk.bold.hex('#6366f1')('  Cache Status'));
  console.log(hr());
  console.log(info(`Directory:   ${chalk.underline(cfg.CACHE_DIR)}`));
  console.log(info(`Entries:     ${stats.count}`));
  console.log(info(`Total size:  ${formatBytes(stats.sizeBytes)}`));
  console.log(info(`TTL:         ${cfg.CACHE_TTL_HOURS === 0 ? 'never' : `${cfg.CACHE_TTL_HOURS}h`}`));
  if (stats.oldestEntry) {
    console.log(info(`Oldest:      ${new Date(stats.oldestEntry).toLocaleDateString()}`));
  }
  console.log('');

  if (opts.list && stats.count > 0) {
    const ids = await cache.listCachedVideoIds();
    console.log(chalk.bold('  Cached Videos'));
    console.log(hr());

    for (const id of ids.slice(0, 50)) {
      const video = await cache.getVideo(id);
      if (video) {
        const title = video.title !== id ? chalk.white(video.title.slice(0, 50)) : chalk.dim(id);
        const chars = chalk.dim(`${Math.round(video.transcript.length / 1000)}K chars`);
        console.log(`  ${chalk.hex('#6366f1')('◇')} ${title}  ${chars}`);
      }
    }

    if (ids.length > 50) {
      console.log(info(`... and ${ids.length - 50} more`));
    }
    console.log('');
  }

  if (stats.count === 0) {
    console.log(warn('Cache is empty'));
    console.log(info('Run `ysgen fetch` or `ysgen generate` to populate the cache'));
    console.log('');
  }
}
