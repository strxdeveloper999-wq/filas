import fs from 'node:fs';
import path from 'node:path';

export function defaults() {
  return { config: { name: 'Arena • By Kaio', color: '#7289ff', categoryId: '', mediatorRoleId: '', supportRoleId: '', logChannelId: '', roomType: 'channel', dm: true, calls: true }, queues: {}, matches: {}, mediators: [], pixKeys: {}, blacklist: {}, tickets: {}, autos: {}, audit: [] };
}
export class Store {
  constructor(file) {
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, guilds: {} };
    if (this.state.version !== 1 || !this.state.guilds) throw Error('Formato de dados inválido. Restaure seu backup.');
  }
  guild(id) {
    const g = this.state.guilds[id] ??= defaults();
    g.pixKeys ??= {};
    for (const q of Object.values(g.queues)) q.priceCents ??= 0;
    return g;
  }
  save() {
    const tmp = this.file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.state, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
  }
}
export class Serial {
  pending = new Map();
  run(key, fn) {
    const next = (this.pending.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    this.pending.set(key, next);
    return next.finally(() => { if (this.pending.get(key) === next) this.pending.delete(key); });
  }
}
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function ranking(g, mode = 'geral') {
  const rows = new Map();
  const row = id => { if (!rows.has(id)) rows.set(id, { id, points: 0, wins: 0, games: 0 }); return rows.get(id); };
  for (const m of Object.values(g.matches)) {
    if (m.status !== 'finished' || (mode === 'diario' && m.day !== today())) continue;
    if (mode === 'mediador') { if (m.mediator) row(m.mediator).games++; continue; }
    m.teams.forEach((team, i) => team.forEach(id => { const r = row(id); r.games++; r.points += i === m.winner ? 3 : 1; if (i === m.winner) r.wins++; }));
  }
  return [...rows.values()].sort((a, b) => mode === 'mediador' ? b.games - a.games || a.id.localeCompare(b.id) : b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id));
}
