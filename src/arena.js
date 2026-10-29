import { randomBytes, randomInt } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { Serial, ranking, today } from './store.js';
export const shortId = () => randomBytes(5).toString('hex');
const mention = ids => ids.map(id => `<@${id}>`).join(', ') || '—';
const noMentions = { parse: [] };
const check = (ok, message) => { if (!ok) throw Error(message); };
const snowflake = s => /^\d{17,22}$/.test(String(s));
function str(value, max, fallback = '') { const v = String(value ?? fallback).trim(); check(v.length <= max, `Limite: ${max} caracteres.`); return v; }
function brlToCents(value) {
  const n = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  check(Number.isFinite(n) && n > 0, 'Valor inválido. Use um número maior que zero, por exemplo 10 ou 10,50.');
  const cents = Math.round(n * 100);
  check(cents >= 1 && cents <= 100000000, 'Valor deve ser entre R$ 0,01 e R$ 1.000.000,00.');
  return cents;
}
export const centsToBRL = cents => (Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pixTypes = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' };
function validatePix(tipo, chave) {
  check(pixTypes[tipo], 'Tipo de chave Pix inválido. Use cpf, cnpj, email, telefone ou aleatoria.');
  const v = str(chave, 140); check(v, 'Informe a chave Pix.');
  if (tipo === 'cpf') { const d = v.replace(/\D/g, ''); check(d.length === 11, 'CPF deve ter 11 dígitos.'); return d; }
  if (tipo === 'cnpj') { const d = v.replace(/\D/g, ''); check(d.length === 14, 'CNPJ deve ter 14 dígitos.'); return d; }
  if (tipo === 'email') { check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'); return v.toLowerCase(); }
  if (tipo === 'telefone') { const d = v.replace(/[^\d+]/g, ''); check(/^\+55\d{10,11}$/.test(d), 'Telefone deve seguir o formato +55DDDNÚMERO.'); return d; }
  const d = v.toLowerCase(); check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d), 'Chave aleatória inválida (formato UUID).'); return d;
}
export class Arena {
  serial = new Serial();
  constructor(client, store, guildId) { this.client = client; this.store = store; this.guildId = guildId; }
  get data() { return this.store.guild(this.guildId); }
  get guild() { return this.client.guilds.cache.get(this.guildId); }
  async member(id) { return this.guild.members.fetch(id); }
  async admin(id) { return (await this.member(id)).permissions.has(P.ManageGuild); }
  async staff(id, role) { const m = await this.member(id); return m.permissions.has(P.ManageGuild) || (!!role && m.roles.cache.has(role)); }
  async channel(id) { const c = await this.guild.channels.fetch(id); check(c?.type === ChannelType.GuildText, 'Escolha um canal de texto deste servidor.'); return c; }
  embed(title, description) { return new EmbedBuilder().setColor(this.data.config.color).setTitle(title).setDescription(description).setFooter({ text: 'By Kaio • Partidas pagas' }); }
  async audit(action, actor) {
    this.data.audit.unshift({ at: new Date().toISOString(), action: String(action).slice(0, 400), actor });
    this.data.audit = this.data.audit.slice(0, 200); this.store.save();
    if (this.data.config.logChannelId) try { await (await this.channel(this.data.config.logChannelId)).send({ content: `${action} • ${actor}`, allowedMentions: noMentions }); } catch { /* Registro local preservado. */ }
  }
  queuePayload(q) {
    const enter = new ButtonBuilder().setCustomId(`q:enter:${q.id}`).setLabel(q.enterLabel).setStyle(Number(q.style));
    const leave = new ButtonBuilder().setCustomId(`q:leave:${q.id}`).setLabel(q.leaveLabel).setStyle(2);
    if (q.enterEmoji) enter.setEmoji(q.enterEmoji);
    if (q.leaveEmoji) leave.setEmoji(q.leaveEmoji);
    const roster = q.influencer ? [q.influencer, ...q.users] : q.users;
    return { embeds: [this.embed(`${q.emoji} ${q.name}`, `${q.description}\n\n**${q.game} • ${q.size}x${q.size} • ${q.mode}**\n**Entrada: R$ ${centsToBRL(q.priceCents)} por jogador (Pix)**\n${q.influencer ? `Influencer: <@${q.influencer}>\n` : ''}**${roster.length}/${q.size * 2} jogadores**\n${mention(roster)}\n\nID: \`${q.id}\``).setColor(q.color)], components: [new ActionRowBuilder().addComponents(enter, leave)], allowedMentions: noMentions };
  }
  async refresh(q) {
    try { await (await this.channel(q.channelId)).messages.edit(q.messageId, this.queuePayload(q)); q.panelError = ''; }
    catch { q.panelError = 'Não foi possível atualizar o painel. Verifique canal, mensagem e permissões.'; }
    this.store.save();
  }
  busy(id, exceptQueue = '') {
    return Object.values(this.data.queues).some(q => q.id !== exceptQueue && q.users.includes(id)) || Object.values(this.data.matches).some(m => ['active', 'creating'].includes(m.status) && (m.teams.flat().includes(id) || m.mediator === id));
  }
  async configure(p) {
    const c = { ...this.data.config };
    for (const key of ['categoryId', 'mediatorRoleId', 'supportRoleId', 'logChannelId']) if (p[key] !== undefined) {
      const value = String(p[key]); check(!value || snowflake(value), `ID inválido: ${key}`);
      if (value) {
        if (key.endsWith('RoleId')) check(await this.guild.roles.fetch(value), 'Cargo não encontrado.');
        else if (key === 'categoryId') check((await this.guild.channels.fetch(value))?.type === ChannelType.GuildCategory, 'Categoria inválida.');
        else await this.channel(value);
      }
      c[key] = value;
    }
    if (p.name !== undefined) { c.name = str(p.name, 80); check(c.name, 'Nome obrigatório.'); }
    if (p.color !== undefined) { check(/^#[0-9a-f]{6}$/i.test(p.color), 'Cor inválida.'); c.color = p.color; }
    if (p.roomType !== undefined) { check(['channel', 'thread'].includes(p.roomType), 'Tipo de sala inválido.'); c.roomType = p.roomType; }
    for (const key of ['dm', 'calls']) if (p[key] !== undefined) { check(typeof p[key] === 'boolean', 'Valor booleano inválido.'); c[key] = p[key]; }
    this.data.config = c; this.store.save(); return 'Configuração salva.';
  }
  async createQueue(p) {
    const size = Number(p.size); check(Number.isInteger(size) && size >= 1 && size <= 4, 'Time deve ter entre 1 e 4 jogadores.');
    check(Object.keys(this.data.queues).length < 50, 'Limite de 50 filas.');
    const name = str(p.name, 60), mode = str(p.mode, 50); check(name && mode, 'Informe nome e modo.');
    const channel = await this.channel(p.channelId);
    const influencer = str(p.influencer, 22); if (influencer) { check(snowflake(influencer), 'Influencer inválido.'); check(!(await this.member(influencer)).user.bot, 'Influencer precisa ser uma pessoa.'); check(!this.data.blacklist[influencer], 'Influencer bloqueado.'); }
    const priceCents = brlToCents(p.valor);
    const q = { id: shortId(), name, mode, size, game: str(p.game, 50, 'Free Fire'), influencer, priceCents, channelId: channel.id, users: [], color: this.data.config.color, emoji: '🎮', enterEmoji: '➕', leaveEmoji: '➖', enterLabel: 'Entrar', leaveLabel: 'Sair', style: 3, description: 'Entre para jogar uma partida paga.' };
    const message = await channel.send(this.queuePayload(q)); q.messageId = message.id; this.data.queues[q.id] = q; this.store.save(); return `Fila criada: ${q.id}`;
  }
  async editQueue(p) {
    const old = this.data.queues[p.id]; check(old, 'Fila não encontrada.'); const q = { ...old };
    for (const [key, max] of Object.entries({name:60,description:500,emoji:80,enterEmoji:80,leaveEmoji:80,enterLabel:40,leaveLabel:40})) if (p[key] !== undefined) q[key] = str(p[key], max);
    check(q.name && q.enterLabel && q.leaveLabel, 'Título e botões não podem estar vazios.');
    if (p.color !== undefined) { check(/^#[0-9a-f]{6}$/i.test(p.color), 'Cor inválida.'); q.color = p.color; }
    if (p.style !== undefined) { check([1,2,3,4].includes(Number(p.style)), 'Estilo inválido.'); q.style = Number(p.style); }
    if (p.valor !== undefined) q.priceCents = brlToCents(p.valor);
    await (await this.channel(q.channelId)).messages.edit(q.messageId, this.queuePayload(q));
    this.data.queues[q.id] = q; this.store.save(); return 'Interface atualizada.';
  }
  async deleteQueue(id) {
    const q = this.data.queues[id]; check(q, 'Fila não encontrada.');
    try { await (await this.channel(q.channelId)).messages.edit(q.messageId, { content: 'Fila encerrada • By Kaio', embeds: [], components: [] }); } catch { /* Botões antigos serão recusados pelo ID. */ }
    delete this.data.queues[id]; this.store.save(); return 'Fila excluída.';
  }
  async join(id, userId, leave = false) {
    const q = this.data.queues[id]; check(q, 'Fila removida.');
    if (leave) { q.users = q.users.filter(x => x !== userId); this.store.save(); await this.refresh(q); return 'Você saiu da fila.'; }
    check(!this.data.blacklist[userId], 'Você está impedido de entrar nas filas. Fale com a equipe.');
    check(userId !== q.influencer, 'Sua vaga de influencer já está reservada.');
    check(!this.busy(userId, q.id), 'Você já está em outra fila ou partida.');
    check(!q.users.includes(userId), 'Você já está nesta fila.');
    check(q.users.length < q.size * 2 - (q.influencer ? 1 : 0), 'A fila está sendo formada.');
    q.users.push(userId); this.store.save(); await this.refresh(q);
    await this.tryStart(q); return 'Entrada registrada. Quando houver jogadores e mediador, a sala será criada.';
  }
  overwrites(ids, staffRole) {
    const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak];
    return [{ id: this.guild.id, deny: [P.ViewChannel] }, { id: this.client.user.id, allow: [...allow, P.ManageChannels, P.ManageThreads] }, ...[...new Set([...ids, staffRole].filter(Boolean))].map(id => ({ id, allow }))];
  }
  async tryStart(q) {
    if (q.users.length !== q.size * 2 - (q.influencer ? 1 : 0)) return;
    if (q.influencer && (this.busy(q.influencer, q.id) || this.data.blacklist[q.influencer] || q.users.includes(q.influencer))) return;
    const valid = [];
    for (const id of this.data.mediators) {
      try { if (!this.data.blacklist[id] && this.data.pixKeys[id] && await this.staff(id, this.data.config.mediatorRoleId)) valid.push(id); } catch {}
    }
    this.data.mediators = valid;
    const players = [...q.users]; if (q.influencer) players.unshift(q.influencer);
    const mediator = valid.find(id => !players.includes(id) && !this.busy(id) && !Object.values(this.data.matches).some(m => ['active','creating'].includes(m.status) && m.mediator === id));
    if (!mediator) { this.store.save(); return; }
    for (const id of players) {
      try { await this.member(id); } catch { q.users = q.users.filter(u => u !== id); this.store.save(); await this.refresh(q); return; }
    }
    for (let i = players.length - 1; i > 0; i--) { const j = randomInt(i + 1); [players[i], players[j]] = [players[j], players[i]]; }
    const pix = this.data.pixKeys[mediator]; if (!pix) { this.store.save(); return; }
    const m = { id: shortId(), queueId: q.id, name: q.name, teams: [players.slice(0, q.size), players.slice(q.size)], mediator, pix, priceCents: q.priceCents, paymentConfirmed: false, status:'creating', createdAt: new Date().toISOString(), channelId:'', voiceId:'' };
    this.data.matches[m.id] = m; this.store.save();
    let room, voice;
    try {
      const parent = this.data.config.categoryId || undefined;
      if (this.data.config.roomType === 'thread') {
        room = await (await this.channel(q.channelId)).threads.create({ name: `partida-${m.id}`, type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 1440 });
        m.channelId = room.id; this.store.save();
        for (const id of [...players, mediator]) await room.members.add(id);
      } else {
        room = await this.guild.channels.create({ name: `partida-${m.id}`, type: ChannelType.GuildText, parent, permissionOverwrites: this.overwrites([...players, mediator]) });
        m.channelId = room.id; this.store.save();
      }
      if (this.data.config.calls) {
        voice = await this.guild.channels.create({ name: `Partida ${m.id}`, type: ChannelType.GuildVoice, parent, permissionOverwrites: this.overwrites([...players, mediator]) });
        m.voiceId = voice.id; this.store.save();
      }
      const payMsg = await room.send({ embeds: [this.embed(`Partida ${m.id}`, `**Time A:** ${mention(m.teams[0])}\n**Time B:** ${mention(m.teams[1])}\n**Mediador:** <@${mediator}>\n${voice ? `**Call:** <#${voice.id}>\n` : ''}\n**Pagamento (Pix)**\nValor: **R$ ${centsToBRL(m.priceCents)} por jogador**\nChave Pix do mediador (${pixTypes[pix.tipo]}): \`${pix.chave}\`\nEnviem o Pix diretamente ao mediador. Ele confirma o recebimento com o botão abaixo antes de registrar o resultado com /resultado.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pay:confirm:${m.id}`).setLabel('Confirmar pagamento').setEmoji('💸').setStyle(3))], allowedMentions: noMentions });
      m.paymentMessageId = payMsg.id;
      m.status = 'active'; q.users = []; this.data.mediators = valid.filter(id => id !== mediator); this.store.save();
    } catch (error) {
      m.status = 'cancelled'; m.failure = 'Falha ao criar sala. Confira permissões e tente novamente.'; this.store.save();
      await room?.delete().catch(() => {}); await voice?.delete().catch(() => {});
      await this.audit(`Falha ao criar partida ${m.id}. Confira permissões.`, 'bot');
      throw Error(m.failure);
    }
    await this.refresh(q);
    if (this.data.config.dm) {
      const results = await Promise.allSettled(players.map(async id => (await this.client.users.fetch(id)).send(`Sua partida paga está pronta: https://discord.com/channels/${this.guildId}/${m.channelId} • By Kaio`)));
      m.dmFailures = results.filter(r => r.status === 'rejected').length; this.store.save();
    }
    await this.audit(`Partida criada: ${m.id}`, 'bot');
  }
  async mediator(action, id) {
    if (action === 'list') return `Mediadores disponíveis: ${mention(this.data.mediators)}`;
    if (action === 'leave') this.data.mediators = this.data.mediators.filter(x => x !== id);
    else { check(action === 'enter', 'Ação inválida.'); check(await this.staff(id, this.data.config.mediatorRoleId), 'Você precisa do cargo de mediador.'); check(!this.data.blacklist[id], 'Usuário bloqueado.'); check(this.data.pixKeys[id], 'Cadastre sua chave Pix com /pix-painel antes de ficar disponível.'); check(!this.data.mediators.includes(id), 'Você já está disponível.'); this.data.mediators.push(id); }
    this.store.save(); return 'Disponibilidade atualizada.';
  }
  async pixSet(userId, tipo, chave) {
    check(await this.staff(userId, this.data.config.mediatorRoleId), 'Você precisa do cargo de mediador.');
    check(!this.data.blacklist[userId], 'Usuário bloqueado.');
    const valor = validatePix(tipo, chave);
    this.data.pixKeys[userId] = { tipo, chave: valor, updatedAt: new Date().toISOString() };
    this.store.save(); await this.audit(`Chave Pix definida (${pixTypes[tipo]})`, userId);
    return `Chave Pix salva: ${pixTypes[tipo]} • \`${valor}\``;
  }
  async pixRemove(userId) {
    check(this.data.pixKeys[userId], 'Você não tem chave Pix cadastrada.');
    delete this.data.pixKeys[userId]; this.data.mediators = this.data.mediators.filter(id => id !== userId);
    this.store.save(); await this.audit('Chave Pix removida', userId);
    return 'Chave Pix removida. Você sai da disponibilidade de mediador até cadastrar uma nova chave.';
  }
  async confirmPayment(matchId, userId) {
    const m = this.data.matches[matchId]; check(m, 'Partida não encontrada.');
    check(m.status === 'active', 'Partida não está ativa.');
    check(userId === m.mediator, 'Somente o mediador responsável por esta partida pode confirmar o pagamento.');
    check(!m.paymentConfirmed, 'Pagamento já confirmado.');
    m.paymentConfirmed = true; m.paymentConfirmedAt = new Date().toISOString(); this.store.save();
    try {
      const room = await this.guild.channels.fetch(m.channelId);
      if (m.paymentMessageId) await room.messages.edit(m.paymentMessageId, { components: [] });
      await room.send({ content: `Pagamento confirmado por <@${userId}>. ✅ • By Kaio`, allowedMentions: noMentions });
    } catch { /* Sala pode ter sido removida; confirmação já foi salva. */ }
    await this.audit(`Pagamento confirmado: ${m.id}`, userId);
    return 'Pagamento confirmado.';
  }
  async finish(id, winner, actor) {
    const m = this.data.matches[id]; check(m?.status === 'active', 'Partida não está ativa.');
    check(await this.admin(actor) || (actor === m.mediator && await this.staff(actor, this.data.config.mediatorRoleId)), 'Somente mediador atribuído ou administrador.');
    check(['0','1','cancel'].includes(String(winner)), 'Resultado inválido.');
    check(winner === 'cancel' || m.paymentConfirmed, 'Confirme o pagamento com o botão da sala antes de registrar o resultado.');
    m.status = winner === 'cancel' ? 'cancelled' : 'finished'; m.winner = winner === 'cancel' ? null : Number(winner); m.day = today(); m.finishedAt = new Date().toISOString(); m.closedBy = actor; this.store.save();
    try { const room = await this.guild.channels.fetch(m.channelId); await room.send({ content: `${winner === 'cancel' ? 'Partida cancelada.' : `Vitória do time ${Number(winner) === 0 ? 'A' : 'B'}!`} • By Kaio`, allowedMentions: noMentions }); if (room.isThread()) { await room.setLocked(true); await room.setArchived(true); } } catch { m.roomWarning = 'Não foi possível atualizar/arquivar a sala.'; }
    try { if (m.voiceId) await (await this.guild.channels.fetch(m.voiceId))?.delete(); } catch { m.voiceWarning = 'Remova a call manualmente.'; }
    await this.audit(`Resultado ${m.id}: ${winner}`, actor); return 'Resultado salvo. A call foi removida quando possível; o histórico de texto é preservado.';
  }
  async blacklist(p) {
    check(snowflake(p.userId), 'ID de usuário inválido.'); check(typeof p.block === 'boolean', 'Bloquear deve ser sim/não.');
    if (p.block) {
      this.data.blacklist[p.userId] = str(p.reason, 200, 'Restrição pela equipe') || 'Restrição pela equipe';
      this.data.mediators = this.data.mediators.filter(id => id !== p.userId);
      for (const q of Object.values(this.data.queues)) { q.users = q.users.filter(id => id !== p.userId); }
    } else delete this.data.blacklist[p.userId];
    this.store.save(); for (const q of Object.values(this.data.queues)) await this.refresh(q);
    return 'Blacklist atualizada.';
  }
  async ticketPanel(channelId) {
    await (await this.channel(channelId)).send({ embeds: [this.embed('Central de atendimento', 'Precisa de ajuda? Abra um ticket privado com a equipe.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:open').setLabel('Abrir ticket').setEmoji('🎫').setStyle(1))] }); return 'Painel publicado.';
  }
  async openTicket(userId) {
    check(!Object.values(this.data.tickets).some(t => t.userId === userId && t.status === 'open'), 'Você já tem um ticket aberto.');
    const id = shortId();
    const room = await this.guild.channels.create({ name:`ticket-${id}`, type: ChannelType.GuildText, parent:this.data.config.categoryId || undefined, permissionOverwrites:this.overwrites([userId], this.data.config.supportRoleId) });
    const t = { id, userId, channelId:room.id, status:'open', createdAt:new Date().toISOString() };
    this.data.tickets[id] = t; this.store.save();
    await room.send({ embeds:[this.embed('Atendimento', `Olá, <@${userId}>. Descreva sua dúvida para a equipe.`)], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:close:${id}`).setLabel('Fechar ticket').setStyle(4))], allowedMentions:noMentions });
    return `Ticket aberto: <#${room.id}>`;
  }
  async closeTicket(id, userId) {
    const t = this.data.tickets[id]; check(t?.status === 'open', 'Ticket já encerrado.');
    check(t.us
