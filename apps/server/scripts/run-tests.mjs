import { run } from 'node:test';
import { writeFileSync } from 'node:fs';

try {
  writeFileSync('test-report.txt', 'started\n');
  const lines = [];
  let pass = 0;
  let fail = 0;

  const stream = run({ files: process.argv.slice(2) });

  for await (const event of stream) {
    if (event.type === 'test:pass') {
      pass += 1;
      lines.push(`ok - ${event.data.name}`);
    }
    if (event.type === 'test:fail') {
      fail += 1;
      lines.push(`FAIL - ${event.data.name}`);
      const err = event.data.details?.error;
      if (err) lines.push(`    ${err.message ?? String(err)}`);
    }
  }

  lines.push('');
  lines.push(`${pass} passed, ${fail} failed`);
  writeFileSync('test-report.txt', lines.join('\n') + '\n');
} catch (err) {
  writeFileSync('test-report.txt', `runner crashed: ${err.stack ?? err}\n`);
}
