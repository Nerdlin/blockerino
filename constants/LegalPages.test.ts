import * as fs from 'fs';
import * as path from 'path';

describe('legal pages', () => {
  for (const page of ['privacy', 'terms']) {
    it(`${page} lists the support contact and current date`, () => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'app', `${page}.tsx`), 'utf8');
      expect(source).toContain('support@aionerdlin.me');
      expect(source).toContain('Effective Date: October 20, 2026');
    });
  }
  it('privacy discloses Discord rich presence permission', () => {
    expect(fs.readFileSync(path.join(__dirname, '..', 'app', 'privacy.tsx'), 'utf8')).toContain('rpc.activities.write');
  });
});
