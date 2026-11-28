import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../massebot.js', import.meta.url), 'utf8');
function section(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

test('the coordinator denies a request when the pause guard throws', () => {
  const Coordinator = vm.runInNewContext(
    section('class MB2ActionCoordinator', '// ===== src/02-client-compat.js') + ';MB2ActionCoordinator',
    { performance },
  );
  const diagnostics = [];
  const coordinator = new Coordinator({ emit() {} }, { warn: event => diagnostics.push(event) });
  coordinator.setRequestGuard(() => { throw new Error('Invalid settings'); });
  assert.equal(coordinator.request('movement', 'test'), false);
  assert.equal(coordinator.owner('movement'), null);
  assert.deepEqual(diagnostics, ['action-guard']);
  coordinator.setRequestGuard(() => true);
  assert.equal(coordinator.request('movement', 'test'), true);
});

test('route saving reports a partial write and restores the stored route', () => {
  const Route = vm.runInNewContext(
    section('class MB2CaveRouteStore', '// ===== src/13aa-cave-controller-base.js') + ';MB2CaveRouteStore',
  );
  const records = new Map([['route', '[]'], ['settings', '{}']]);
  let blocked = true;
  const results = [];
  const route = Object.assign(Object.create(Route.prototype), {
    key: 'route', settingsKey: 'settings', route: [{ id: 1 }], settings: { loop: true },
    storage: {
      get: key => records.get(key) ?? null,
      set(key, value) {
        if (key === 'settings' && blocked) return false;
        records.set(key, value);
        return true;
      },
    },
    events: { emit: (_, event) => results.push(event.saved) },
  });
  assert.equal(route.save(), false);
  assert.equal(records.get('route'), '[]');
  assert.equal(records.get('settings'), '{}');
  assert.ok(route.saveError);
  assert.equal(route.route.length, 1);
  blocked = false;
  assert.equal(route.save(), true);
  assert.equal(records.get('route'), '[{"id":1}]');
  assert.equal(records.get('settings'), '{"loop":true}');
  assert.equal(route.saveError, null);
  assert.deepEqual(results, [false, true]);
});

test('client preparation coalesces concurrent requests and can retry after failure', async () => {
  const client = vm.runInNewContext(`(() => {
    let status = "PENDING", preparing, failure, startupCancelled = true, attempts = 0;
    async function discover() {
      if (startupCancelled || ++attempts === 1) throw new Error("Temporary failure");
      status = "READY";
    }
    ${section('  function prepare(){', '  function type(name)')}
    return { prepare, attempts: () => attempts };
  })()`);
  const first = client.prepare();
  assert.equal(client.prepare(), first);
  await assert.rejects(first, /Temporary failure/);
  await client.prepare();
  await client.prepare();
  assert.equal(client.attempts(), 2);
});

test('the packaged userscript waits visibly and starts once the game panel is visible', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'massebot-release-test-'));
  const origin = 'https://example.test';
  try {
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../scripts/build-release.mjs', import.meta.url)), origin, directory,
    ]);
    const generated = readFileSync(join(directory, 'index.js'), 'utf8');
    const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(generated).toString('base64'));
    const response = worker.fetch(new Request(origin + '/massebot.user.js'));
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    const script = await response.text();
    const metadata = await worker.fetch(new Request(origin + '/massebot.meta.js')).text();
    assert.match(metadata, /@version\s+78\.0\.0/);
    assert.ok(script.startsWith(metadata) && script.includes(source));
    new vm.Script(script);

    let timer, notice, elapsed = 0, gameVisible = false, starts = 0;
    const window = { __CLIENT_BUILD: 'test', __ccBoot: {}, startProbe() { starts++; } };
    const document = {
      querySelector: () => null,
      getElementById: id => id === 'game-wrapper' ? {
        style: { display: '' }, getClientRects: () => gameVisible ? [{}] : [],
      } : null,
      createElement: () => ({ setAttribute() {}, style: {}, remove() { notice = null; } }),
      body: { append(element) { notice = element; } },
    };
    vm.runInNewContext(script.replace(source, 'window.startProbe();'), {
      window, document, location: { pathname: '/play/' }, Date: { now: () => elapsed },
      setInterval(callback) { timer = callback; return 1; },
      clearInterval() { timer = null; },
    });
    timer();
    assert.equal(starts, 0);
    elapsed = 16000;
    timer();
    assert.match(notice.textContent, /väntar/);
    gameVisible = true;
    timer();
    assert.equal(starts, 1);
    assert.equal(notice, null);
    assert.equal(timer, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
