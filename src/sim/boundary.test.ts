import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The simulation must run headless (staffed sites simulate with nothing on screen),
// so it may not depend on rendering, audio, or the browser.
const FORBIDDEN = [/from\s+['"]pixi\.js/, /from\s+['"]howler/, /from\s+['"]\.\.\/game/, /\bwindow\./, /\bdocument\./];

describe('simulation boundary', () => {
  const dir = __dirname;
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it.each(files)('%s has no rendering or DOM dependencies', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern);
  });
});
