import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('.github/planning.json', root), 'utf8'));
if (process.argv.includes('--dry-run')) {
  console.log(
    JSON.stringify(
      {
        repository: plan.repository,
        milestones: plan.milestones.length,
        issues: plan.issues.map(({ key, title, milestone }) => ({ key, title, milestone })),
      },
      null,
      2,
    ),
  );
} else {
  function api(path, payload) {
    const args = ['api', path];
    if (payload) args.push('--method', 'POST', '--input', '-');
    else args.push('--paginate', '--slurp');
    const result = execFileSync('gh', args, {
      encoding: 'utf8',
      ...(payload ? { input: JSON.stringify(payload) } : {}),
    });
    const value = JSON.parse(result);
    return payload ? value : value.flat();
  }
  // Read both collections before the first write; never use token values in arguments.
  const prefix = `repos/${plan.repository}`;
  const milestones = api(`${prefix}/milestones?state=all&per_page=100`);
  const issues = api(`${prefix}/issues?state=all&per_page=100`).filter(
    (issue) => !issue.pull_request,
  );
  const published = { milestones: [], issues: [] };
  for (const milestone of plan.milestones) {
    let existing = milestones.find((item) => item.title === milestone.title);
    if (!existing) {
      existing = api(`${prefix}/milestones`, milestone);
      milestones.push(existing);
    }
    published.milestones.push({
      title: existing.title,
      number: existing.number,
      url: existing.html_url,
    });
  }
  for (const issue of plan.issues) {
    let existing = issues.find((item) => item.body?.includes(`<!-- plan:${issue.key} -->`));
    if (!existing) {
      const milestone = milestones.find((item) => item.title === issue.milestone);
      existing = api(`${prefix}/issues`, {
        title: issue.title,
        body: issue.body,
        milestone: milestone.number,
      });
      issues.push(existing);
    }
    // Preserve user edits and completed/closed state on repeated publication.
    published.issues.push({ key: issue.key, number: existing.number, url: existing.html_url });
  }
  const destination = new URL('artifacts/', root);
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    new URL('planning-published.json', destination),
    JSON.stringify(published, null, 2) + '\n',
  );
  console.log(
    `Published or reused ${published.milestones.length} milestones and ${published.issues.length} issues. Receipt: ${fileURLToPath(destination)}planning-published.json`,
  );
}
