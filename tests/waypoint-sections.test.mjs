import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../massebot.js', import.meta.url), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const RouteStore = vm.runInNewContext(
  slice('class MB2DepotService', '// ===== src/13ag-cave-record-actions.js') +
  slice('class MB2CaveRouteStore', '// ===== src/13aa-cave-controller-base.js') +
  ';MB2CaveRouteStore',
);
const waypoint = (id, type = 'walk', label = '', params = {}) => ({
  id, type, label, position: { x: 123, y: 234, z: 7 }, params,
});

function routeStore() {
  const local = new Map(), shared = new Map();
  const events = [];
  const storage = {
    get: key => local.get(key) ?? null,
    set: (key, value) => Boolean(local.set(key, value)),
    remove: key => local.delete(key),
    sharedGet: key => shared.get(key) ?? null,
    sharedSet: (key, value) => Boolean(shared.set(key, value)),
    sharedEntriesWithPrefix: prefix => [...shared]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
    scanCharacterValues: () => [],
    legacyGet: () => null,
  };
  return { store: new RouteStore(storage, { emit: (...event) => events.push(event) }), events, local, storage };
}

test('a house depot range can be saved and loaded as a shared template', () => {
  const { store, storage } = routeStore();
  store.route = [
    store.normalize(waypoint('hunt')),
    store.normalize(waypoint('house', 'use')),
    store.normalize(waypoint('deposit', 'depot', '', { depot: { action: 'deposit', mode: 'split', bags: { stackables: 'Gold bag' } } })),
  ];
  store.lastProfileName = 'Hunt route';
  store.saveProfile('House depot', store.routeSection(2, 3));
  assert.equal(store.lastProfileName, 'Hunt route');
  assert.equal(store.route.length, 3);
  const other = new RouteStore(storage, { emit() {} });
  other.route = [other.normalize(waypoint('other'))];
  const result = other.insertSection(other.readSharedSection('House depot'), 1);
  assert.equal(result.saved, true);
  assert.deepEqual(Array.from(other.route, wp => wp.type), ['use', 'depot', 'walk']);
  assert.equal(other.route[1].params.depot.bags.stackables, 'Gold bag');
  assert.equal(other.route[2].id, 'other');
  assert.equal(new RouteStore(storage, { emit() {} }).route.length, 3);
});

test('insertion preserves entry order and relinks branches and conflicting labels', () => {
  const { store } = routeStore();
  store.route = [
    store.normalize(waypoint('existing', 'label', 'DEPOT')),
    store.normalize(waypoint('other', 'label', 'depot (2)')),
    store.normalize(waypoint('third')),
  ];
  const section = [
    waypoint('start', 'label', 'Depot'),
    waypoint('check', 'supply-check', '', { lowTargetId: 'start', okTargetLabel: 'Depot' }),
    waypoint('jump', 'goto', '', { targetLabel: 'DEPOT' }),
  ];
  const result = store.insertSection(JSON.stringify(section), 2);
  const [anchor, check, jump] = result.waypoints;
  assert.equal(result.before, 2);
  assert.equal(anchor.label, 'Depot (3)');
  assert.equal(check.params.lowTargetId, anchor.id);
  assert.equal(check.params.okTargetLabel, anchor.label);
  assert.equal(jump.params.targetLabel, anchor.label);
  assert.equal(store.route[0].label, 'DEPOT');
  assert.equal(store.route.at(-1).id, 'third');
  assert.equal(new Set(store.route.map(wp => wp.id)).size, 6);
  assert.equal(store.validate().valid, true);
  const appended = store.insertSection(JSON.stringify(section), store.route.length+1);
  assert.equal(appended.before, 7);
  assert.notEqual(appended.waypoints[0].id, anchor.id);
  assert.equal(appended.waypoints[0].label, 'Depot (4)');
});

test('invalid JSON and invalid ranges do not modify or stop the current route', () => {
  const { store, events } = routeStore();
  store.route = [store.normalize(waypoint('existing'))];
  assert.throws(() => store.routeSection(2, 1), /intervall/);
  assert.throws(() => store.insertSection(JSON.stringify([waypoint('a')]), 3), /waypointnummer/);
  assert.throws(() => store.insertSection('[]', 1), /inga waypoints/);
  assert.throws(() => store.insertSection(JSON.stringify([{ id: 'a', type: 'walk' }]), 1), /ogiltig position/);
  assert.throws(() => store.insertSection(JSON.stringify([waypoint('a', 'unknown')]), 1), /Okänd waypointtyp/);
  assert.throws(() => store.insertSection(JSON.stringify([waypoint('a'), waypoint('a')]), 1), /dubbla waypoint-ID/);
  assert.throws(() => store.insertSection('[{"params":{"__proto__":{}}}]', 1), /giltig waypoint-JSON/);
  assert.equal(store.route.length, 1);
  assert.deepEqual(events, []);
});

test('unresolved jumps are reported and a failed save preserves the persisted route', () => {
  const { store, events, local, storage } = routeStore();
  store.route = [store.normalize(waypoint('existing'))];
  assert.equal(store.save(), true);
  const previous = local.get(store.key);
  storage.set = () => false;
  const result = store.insertSection(JSON.stringify([
    waypoint('jump', 'goto', '', { targetLabel: 'Outside' }),
  ]), 1);
  assert.equal(result.saved, false);
  assert.deepEqual(Array.from(result.missing), ['Outside']);
  assert.equal(local.get(store.key), previous);
  assert.ok(store.saveError);
  assert.equal(events.at(-2)[0], 'cave:beforeRouteImport');
  assert.equal(events.at(-1)[1].saved, false);
});

test('Route Builder exports can follow the house section and unknown rotation conditions stop insertion', () => {
  const { store, events } = routeStore();
  store.route = [store.normalize(waypoint('house'))];
  const exported = { version: 1, route: [
    { id: 'walk-1', enabled: true, type: 'walk', label: '', position: { x: 124, y: 234, z: 7 }, params: {} },
    { id: 'up-1', enabled: true, type: 'stairs-up', label: '', position: { x: 125, y: 234, z: 7 }, params: { transitionTarget: 'n' } },
  ] };
  const inserted = store.insertSection(JSON.stringify(exported), 2);
  assert.equal(inserted.saved, true);
  assert.deepEqual(Array.from(store.route, wp => wp.type), ['walk', 'walk', 'stairs-up']);
  assert.equal(store.route[2].params.transitionTarget, 'n');

  events.length = 0;
  exported.route[0].params.checkType = 'sell-needed';
  assert.throws(() => store.insertSection(JSON.stringify(exported), 2), /rotationsvillkor/);
  assert.equal(store.route.length, 3);
  assert.deepEqual(events, []);
});
