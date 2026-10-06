import { validateTableSession, type TableSession } from './tabletop';

export interface TableCommand {
  commandId: string;
  tableId: string;
  origin: 'player' | 'ai' | 'physics';
}
export type TableCommandResult = { ok: true; session: TableSession; duplicate: boolean } | { ok: false; error: string };

// This local transaction boundary will be replaced by the host command transport.
// UI, AI and physical observations share validation and command identity now.
export class TableCommandBus {
  private results = new Map<string, TableCommandResult>();
  execute(current: TableSession, command: TableCommand, operation: (state: TableSession) => TableSession): TableCommandResult {
    const key = `${command.tableId}:${command.commandId}`;
    if (!command.commandId || command.commandId.length > 128 || command.tableId !== current.id) return { ok: false, error: '操作身份或目标桌面已失效。' };
    const previous = this.results.get(key);
    if (previous) return previous.ok ? { ...previous, duplicate: true } : previous;
    let result: TableCommandResult;
    try {
      const proposed = operation(structuredClone(current));
      if (proposed.id !== current.id) throw new Error('桌面操作不能改变对局身份。');
      result = { ok: true, session: validateTableSession(proposed), duplicate: false };
    } catch (e) { result = { ok: false, error: e instanceof Error ? e.message : '操作未完成。' }; }
    this.results.set(key, result);
    if (this.results.size > 256) this.results.delete(this.results.keys().next().value!);
    return result;
  }
  reset() { this.results.clear(); }
}
