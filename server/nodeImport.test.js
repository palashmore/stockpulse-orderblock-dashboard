import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Vitest and Vite resolve extensionless imports, plain Node does not. The server runs under plain Node, so
// load its entry modules the same way: a missing ".js" in a shared src/ file would otherwise only show up
// when starting the real server.
describe('server modules load under plain Node', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const file of ['server/app.js', 'server/alertEngine.js']) {
    it(`${file} imports without errors`, () => {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(`./${file}`)}); console.log('loaded');`], {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
      });
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('loaded');
      expect(result.status).toBe(0);
    });
  }
});
