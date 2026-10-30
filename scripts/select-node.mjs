import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requested = readFileSync(join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const major = Number(requested.split('.')[0]);
const candidates = [];
function add(path) { if (path && existsSync(path) && !candidates.includes(path)) candidates.push(path); }

// Prefer the IDE's interpreter when it already matches the project.
add(process.execPath);
const roots = [process.env.NVM_DIR, process.env.HOME && join(process.env.HOME, '.nvm'), process.env.XDG_CONFIG_HOME && join(process.env.XDG_CONFIG_HOME, 'nvm')];
for (const directory of new Set(roots.filter(Boolean))) {
  const versions = join(directory, 'versions/node');
  if (!existsSync(versions)) continue;
  const installed = readdirSync(versions).filter(version => version.startsWith(`v${major}.`))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of installed) add(join(versions, version, 'bin/node'));
}
for (const prefix of ['/opt/homebrew', '/usr/local']) add(join(prefix, `opt/node@${major}/bin/node`));

for (const candidate of candidates) {
  try {
    const version = execFileSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
    if (Number(version.replace(/^v/, '').split('.')[0]) === major) {
      process.stdout.write(candidate);
      process.exit(0);
    }
  } catch { /* Try the next installed interpreter. */ }
}
console.error(`[dev] Node ${requested} is not installed or discoverable. Install the .nvmrc version, or add its bin directory to WebStorm's PATH.`);
process.exitCode = 1;
