import { describe, expect, it } from 'vitest';
import { TableCommandBus } from './tabletop-commands';
import { createObject, createTableSession } from './tabletop';

describe('local command boundary', () => {
  it('deduplicates a command without reapplying it to a newer state', () => {
    const bus = new TableCommandBus(); const table = createTableSession('sandbox');
    const command = { commandId: 'spawn-1', tableId: table.id, origin: 'player' as const };
    let calls = 0;
    const first = bus.execute(table, command, current => { calls++; return { ...current, objects: [...current.objects, createObject('token')] }; });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const duplicate = bus.execute(first.session, command, current => { calls++; return { ...current, objects: [...current.objects, createObject('token')] }; });
    expect(duplicate.ok && duplicate.duplicate).toBe(true); expect(calls).toBe(1);
    expect(first.session.objects).toHaveLength(table.objects.length + 1);
  });
  it('does not mutate the original state on a rejected batch', () => {
    const bus = new TableCommandBus(); const table = createTableSession('sandbox'); const before = JSON.stringify(table);
    const result = bus.execute(table, { commandId: 'bad-batch', tableId: table.id, origin: 'ai' }, current => {
      current.objects.push(createObject('token'));
      current.grid.size = -1;
      return current;
    });
    expect(result.ok).toBe(false); expect(JSON.stringify(table)).toBe(before);
  });
  it('rejects commands addressed to another table and identity changes', () => {
    const bus = new TableCommandBus(); const table = createTableSession('sandbox');
    expect(bus.execute(table, { commandId: 'x', tableId: 'another', origin: 'player' }, s => s).ok).toBe(false);
    expect(bus.execute(table, { commandId: 'y', tableId: table.id, origin: 'player' }, s => ({ ...s, id: 'another' })).ok).toBe(false);
  });
});
