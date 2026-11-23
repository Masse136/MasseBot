import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../massebot.js', import.meta.url), 'utf8');
const start = source.indexOf('class MB2FollowingItemAlert');
const end = source.indexOf('class MB2SafetyController', start);
assert.ok(start >= 0 && end > start);
const FollowingItem = vm.runInNewContext(source.slice(start, end) + ';MB2FollowingItemAlert');

function scene() {
  const tiles = new Map();
  const alarms = [];
  const config = { followingItem: { enabled: true } };
  let player = { x: 1, y: 1, z: 7 };
  const key = ({ x, y, z }) => [x, y, z].join(',');
  const tile = position => tiles.get(key(position));
  const bot = {
    runtime: { status: 'READY' },
    adapter: { ownsCharacter: () => true },
    world: { playerPosition: () => player, getTile: tile },
    items: { properties: item => ({ type: item.type }), name: () => 'Bag' },
    diagnostics: { info() {} },
  };
  const alert = new FollowingItem({ bot, config, _setAlarm: (name, on) => alarms.push([name, on]) });
  function item({ id = 42, count = 1, type, movable = true } = {}) {
    return { id, count, type, isMoveable: () => movable };
  }
  function ground(x, items = []) {
    const position = { x, y: 2, z: 7 };
    tiles.set(key(position), { id: 100, items });
    return position;
  }
  function add(position, value, at) {
    const before = alert.capture(position);
    tile(position).items.push(value);
    if (before) alert.observe(position, before, at);
  }
  return {
    alert, alarms, config, item, ground, add, tile,
    move(x) { player = { ...player, x }; },
  };
}

test('repeated nearby ground appearances trigger a local alarm that can be cleared', () => {
  const { alert, alarms, item, ground, tile, add, move } = scene();
  let previous;
  for (const x of [1, 4, 7]) {
    if (previous) tile(previous).items.length = 0;
    move(x);
    const position = ground(x);
    add(position, item(), x * 1000);
    previous = position;
  }
  assert.equal(alert.last.name, 'Bag');
  assert.deepEqual(alarms, [['following-item', true]]);
  alert.clear();
  assert.equal(alert.last, null);
  assert.equal(alert.recent.size, 0);
  assert.deepEqual(alarms, [['following-item', true], ['following-item', false]]);
});

test('stack additions, leftover items, corpses and disabled monitoring do not signal', () => {
  const { alert, config, alarms, item, ground, add, move } = scene();
  const initial = ground(1, [item()]);
  add(initial, item(), 1000);
  assert.equal(alert.recent.size, 0);
  add(initial, item({ id: 1, type: 'corpse' }), 1200);
  assert.equal(alert.recent.size, 0);

  for (const x of [4, 7, 10]) {
    move(x);
    add(ground(x), item(), x * 500);
  }
  assert.equal(alert.recent.get('42:0').appearances, 1);
  assert.equal(alert.last, null);
  assert.deepEqual(alarms, []);
  config.followingItem.enabled = false;
  assert.equal(alert.capture(ground(10)), null);
});

test('a teleport reset or an unloaded old tile breaks the chain', () => {
  const { alert, alarms, item, ground, tile, add, move } = scene();
  const first = ground(1);
  add(first, item(), 1000);
  tile(first).__isPlaceholder = true;
  move(4);
  const second = ground(4);
  add(second, item(), 2000);
  assert.equal(alert.recent.get('42:0').appearances, 1);

  alert.resetEvidence();
  tile(second).items.length = 0;
  move(7);
  add(ground(7), item(), 3000);
  assert.equal(alert.recent.get('42:0').appearances, 1);
  assert.deepEqual(alarms, []);
});
