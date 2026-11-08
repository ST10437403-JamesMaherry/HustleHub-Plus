'use strict';

const { appendFileSync } = require('node:fs');

function evaluateJobs(jobs, sonarRequired) {
  const required = ['configuration', 'backend', 'frontend', 'dependencies', 'integration'];
  if (sonarRequired) required.push('sonar');
  return required.every((name) => jobs?.[name]?.result === 'success') &&
    (sonarRequired || ['success', 'skipped'].includes(jobs?.sonar?.result));
}

if (require.main === module) {
  try {
    const jobs = JSON.parse(process.env.CI_JOB_RESULTS);
    const sonarRequired = process.env.CI_SONAR_REQUIRED === 'true';
    const passed = evaluateJobs(jobs, sonarRequired);
    const lines = ['## CI gate', '', `Result: **${passed ? 'PASS' : 'FAIL'}**`, '', '| Job | Result |', '|---|---|'];
    for (const name of ['configuration', 'backend', 'frontend', 'dependencies', 'integration', 'sonar']) {
      const result = jobs[name]?.result;
      const safe = ['success', 'failure', 'cancelled', 'skipped'].includes(result) ? result : 'missing';
      lines.push(`| ${name} | ${safe} |`);
    }
    if (!sonarRequired) {
      lines.push('', 'Sonar is outside the configured dev-branch scope for this event. This run is NOT full Sonar sign-off; require a passing PR-to-dev or dev run.');
    }
    console.log(lines.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
    process.exitCode = passed ? 0 : 1;
  } catch {
    console.error('Invalid or incomplete CI gate results.');
    process.exitCode = 1;
  }
}

module.exports = { evaluateJobs };
