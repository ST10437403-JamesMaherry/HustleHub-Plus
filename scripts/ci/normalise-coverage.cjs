'use strict';

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

// Match LCOV source paths to the repository checked out by the analysis job.
function normaliseCoverage(packageName, repositoryRoot = root) {
  if (!['api', 'client'].includes(packageName)) throw new Error('Unsupported coverage package.');
  const file = path.join(repositoryRoot, packageName, 'coverage/lcov.info');
  let sources = 0;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).map((line) => {
    if (!line.startsWith('SF:')) return line;
    const source = line.slice(3).replace(/\\/g, '/');
    const absolute = path.isAbsolute(source) ? path.resolve(source)
      : source.startsWith(`${packageName}/`) ? path.resolve(repositoryRoot, source)
      : path.resolve(repositoryRoot, packageName, source);
    const relative = path.relative(repositoryRoot, absolute).split(path.sep).join('/');
    if (!relative.startsWith(`${packageName}/`) || relative.includes('../') ||
        !/\.(?:js|jsx|mjs|cjs)$/.test(relative) || !existsSync(absolute)) {
      throw new Error('Coverage refers to a missing source or a path outside its package.');
    }
    sources += 1;
    return `SF:${relative}`;
  });
  if (!sources) throw new Error('Coverage report has no source records.');
  writeFileSync(file, lines.join('\n'));
  return sources;
}

if (require.main === module) {
  try {
    const count = normaliseCoverage(process.argv[2]);
    console.log(`Normalised coverage for ${count} source files.`);
  } catch {
    console.error('Coverage normalization failed. Inspect the LCOV paths and current checkout.');
    process.exitCode = 1;
  }
}

module.exports = { normaliseCoverage };
