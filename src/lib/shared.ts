// A list of records the staff shares through Supabase (tables with `id` + `data`, supabase/connect-all.sql):
// sales clients (sales_leads) and tasks (staff_tasks). Reads and writes stay instant on this device (a mirror in
// localStorage), and every change is sent to the database in the background; refresh() brings the team's latest.
// Without Supabase it simply stays on this device (preview).
import { hasBackend, staffApi } from './backend';

export function sharedList<T extends { id: string }>(table: string, key: string, event: string) {
  const read = (): T[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const write = (l: T[]) => { try { localStorage.setItem(key, JSON.stringify(l)); } catch { /* storage blocked */ } dispatchEvent(new Event(event)); };
  let synced = new Map<string, string>(); // id → JSON last known to be in the database

  return {
    /** The list as it is now (instant). */
    load: read,
    /** Saves the whole list; only what changed is sent to the database. */
    save(list: T[]) {
      write(list);
      if (!hasBackend()) return;
      const now = new Map(list.map((x) => [x.id, JSON.stringify(x)]));
      const changed = list.filter((x) => synced.get(x.id) !== now.get(x.id));
      const gone = [...synced.keys()].filter((id) => !now.has(id));
      synced = now;
      if (changed.length) void staffApi(table, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(changed.map((x) => ({ id: x.id, data: x, updated_at: new Date().toISOString() }))) });
      if (gone.length) void staffApi(`${table}?id=in.(${gone.map((id) => `"${id}"`).join(',')})`, { method: 'DELETE' });
    },
    /** Brings the team's list from the database (staff login). Returns false if it couldn't. */
    async refresh(): Promise<boolean> {
      if (!hasBackend()) return false;
      const r = await staffApi(`${table}?select=data&order=updated_at.desc&limit=500`);
      if (!r?.ok) return false;
      const list: T[] = (await r.json()).map((x: { data: T }) => x.data);
      synced = new Map(list.map((x) => [x.id, JSON.stringify(x)]));
      write(list);
      return true;
    },
    shared: hasBackend,
  };
}
