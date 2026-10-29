import {
  Client,
  Events,
  GatewayIntentBits as I,
  ActivityType,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import { Store, ranking } from './store.js';
import { Arena, centsToBRL } from './arena.js';
import { commands } from './commands.js';

for (const key of ['DISCORD_TOKEN', 'GUILD_ID']) {
  if (!process.env[key]) {
    throw Error(`Preencha ${key} no arquivo .env.`);
  }
}

const prefix = process.env.ENABLE_PREFIX === 'true';

const client = new Client({
  intents: [
    I.Guilds,
    ...(prefix ? [I.GuildMessages, I.MessageContent] : [])
  ],
  allowedMentions: { parse: [] }
});

const store = new Store(process.env.DATA_FILE || './data/state.json');
const arena = new Arena(client, store, process.env.GUILD_ID);

const safeError = e =>
  e?.name === 'Error' && !e.code
    ? e.message.slice(0, 800)
    : `O Discord recusou a operação${e.code ? ` (código ${e.code})` : ''}. Confira permissões e IDs.`;

const isAdminCommand = name =>
  commands.find(c => c.name === name)?.default_member_permissions != null;

const row = items =>
  new ActionRowBuilder().addComponents(
    ...items.map(([id, label, style = 2]) =>
      new ButtonBuilder()
        .setCustomId(`admin:${id}`)
        .setLabel(label)
        .setStyle(style)
    )
  );

function panel() {
  const g = arena.data;
  const c = g.config;

  return {
    embeds: [
      arena.embed(
        c.name,
        `**Administração do servidor**\n` +
        `${Object.keys(g.queues).length} filas\n` +
        `${Object.values(g.matches).filter(m => m.status === 'active').length} partidas ativas\n` +
        `${g.mediators.length} mediadores disponíveis\n\n` +
        `Salas: **${c.roomType === 'thread' ? 'tópicos privados' : 'canais privados'}**\n` +
        `DM: **${c.dm ? 'ligada' : 'desligada'}**\n` +
        `Calls: **${c.calls ? 'ligadas' : 'desligadas'}**\n\n` +
        `Use /configurar para cargos e categoria; ` +
        `/fila-editar para personalizar as filas.`
      )
    ],
    components: [
      row([
        ['queue', 'Criar fila', 1],
        ['list', 'Ver filas'],
        ['matches', 'Partidas'],
        ['tickets', 'Publicar tickets']
      ]),
      row([
        ['blacklist', 'Blacklist'],
        ['auto', 'Auto mensagem'],
        ['autos', 'Agendamentos']
      ]),
      row([
        ['dm', 'Alternar DM'],
        ['calls', 'Alternar calls'],
        ['room', 'Alternar salas'],
        ['config', 'Ver configuração']
      ]),
      row([
        ['blocks', 'Ver bloqueios'],
        ['mediators', 'Mediadores'],
        ['help', 'Ajuda']
      ])
    ]
  };
}

const forms = {
  queue: [
    ['name', 'Nome da fila', 60],
    ['size', 'Jogadores por time: 1 a 4', 1],
    ['mode', 'Modo de jogo', 50],
    ['game', 'Jogo', 50],
    ['valor', 'Valor da entrada por jogador (R$)', 10]
  ],

  blacklist: [
    ['userId', 'ID do usuário', 22],
    ['block', 'Digite bloquear ou remover', 10],
    ['reason', 'Motivo (opcional)', 200, false]
  ],

  auto: [
    ['text', 'Mensagem', 1800],
    ['minutes', 'Intervalo em minutos (mínimo 5)', 5]
  ]
};

function modal(kind) {
  const titles = {
    queue: 'Criar fila',
    blacklist: 'Gerenciar blacklist',
    auto: 'Mensagem recorrente'
  };

  return new ModalBuilder()
    .setCustomId(`form:${kind}`)
    .setTitle(titles[kind])
    .addComponents(
      ...forms[kind].map(([id, label, max, required = true]) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label.slice(0, 45))
            .setStyle(
              max > 500
                ? TextInputStyle.Paragraph
                : TextInputStyle.Short
            )
            .setMaxLength(max)
            .setRequired(required)
        )
      )
    );
}

const overview = (title, lines) => ({
  embeds: [
    arena.embed(
      title,
      lines.join('\n').slice(0, 3900) || 'Nenhum registro.'
    )
  ]
});

function pixModal() {
  return new ModalBuilder()
    .setCustomId('form:pix')
    .setTitle('Cadastrar chave Pix')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tipo')
          .setLabel('Tipo: cpf, cnpj, email, telefone, aleatoria')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('chave')
          .setLabel('Chave Pix')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(140)
          .setRequired(true)
      )
    );
}

async function pixPanel(userId) {
  if (
    !await arena.staff(
      userId,
      arena.data.config.mediatorRoleId
    )
  ) {
    throw Error('Você precisa do cargo de mediador.');
  }

  const k = arena.data.pixKeys[userId];

  const buttons = [
    new ButtonBuilder()
      .setCustomId('pixpanel:set')
      .setLabel(k ? 'Atualizar chave Pix' : 'Definir chave Pix')
      .setStyle(1)
  ];

  if (k) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('pixpanel:remove')
        .setLabel('Remover chave')
        .setStyle(4)
    );
  }

  return {
    embeds: [
      arena.embed(
        'Painel Pix',
        k
          ? `Chave cadastrada: **${k.tipo}**\n` +
            `\`${k.chave}\`\n` +
            `Ela é exibida na sala sempre que você mediar uma partida.`
          : 'Nenhuma chave Pix cadastrada.\n' +
            'Cadastre uma chave para ficar disponível como mediador em partidas pagas.'
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(...buttons)
    ]
  };
}

function profile(userId) {
  const r = ranking(arena.data).find(r => r.id === userId) || {
    points: 0,
    wins: 0,
    games: 0
  };

  return overview('Perfil do jogador', [
    `<@${userId}>`,
    `Pontos: **${r.points}**`,
    `Vitórias: **${r.wins}**`,
    `Partidas: **${r.games}**`,
    'Vitória: 3 pontos; participação: 1 ponto.'
  ]);
}

async function handle(i) {
  if (
    i.isButton() &&
    i.customId.startsWith('admin:') &&
    forms[i.customId.split(':')[1]]
  ) {
    if (!await arena.admin(i.user.id)) {
      return i.reply({
        content: 'É necessário Gerenciar Servidor.',
        flags: MessageFlags.Ephemeral
      });
    }

    return i.showModal(modal(i.customId.split(':')[1]));
  }

  if (i.isButton() && i.customId === 'pixpanel:set') {
    if (
      !await arena.staff(
        i.user.id,
        arena.data.config.mediatorRoleId
      )
    ) {
      return i.reply({
        content: 'Você precisa do cargo de mediador.',
        flags: MessageFlags.Ephemeral
      });
    }

    return i.showModal(pixModal());
  }

  if (!i.deferred) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let result;

  if (i.isModalSubmit()) {
    const kind = i.customId.split(':')[1];

    if (kind === 'pix') {
      await arena.pixSet(
        i.user.id,
        i.fields.getTextInputValue('tipo').toLowerCase().trim(),
        i.fields.getTextInputValue('chave').trim()
      );

      result = await pixPanel(i.user.id);
    } else {
      if (!await arena.admin(i.user.id)) {
        throw Error('É necessário Gerenciar Servidor.');
      }

      if (!forms[kind]) {
        throw Error('Formulário desconhecido.');
      }

      const p = Object.fromEntries(
        forms[kind].map(([id]) => [
          id,
          i.fields.getTextInputValue(id)
        ])
      );

      p.channelId = i.channelId;

      if (kind === 'queue') {
        result = await arena.createQueue(p);
      }

      if (kind === 'blacklist') {
        if (!['bloquear', 'remover'].includes(p.block.toLowerCase())) {
          throw Error('Digite bloquear ou remover.');
        }

        p.block = p.block.toLowerCase() === 'bloquear';
        result = await arena.blacklist(p);
      }

      if (kind === 'auto') {
        result = await arena.auto({
          ...p,
          action: 'create'
        });
      }

      await arena.audit(`Painel: ${kind}`, i.user.id);
    }
  } else if (i.isButton()) {
    const [group, action, id] = i.customId.split(':');

    if (group === 'q') {
      if (!['enter', 'leave'].includes(action)) {
        throw Error('Botão inválido.');
      }

      result = await arena.join(
        id,
        i.user.id,
        action === 'leave'
      );
    } else if (group === 'ticket') {
      result = action === 'open'
        ? await arena.openTicket(i.user.id)
        : await arena.closeTicket(id, i.user.id);
    } else if (group === 'pay') {
      if (action !== 'confirm') {
        throw Error('Botão inválido.');
      }

      result = await arena.confirmPayment(id, i.user.id);
    } else if (group === 'pixpanel') {
      if (action !== 'remove') {
        throw Error('Botão inválido.');
      }

      await arena.pixRemove(i.user.id);
      result = await pixPanel(i.user.id);
    } else if (group === 'admin') {
      if (!await arena.admin(i.user.id)) {
        throw Error('É necessário Gerenciar Servidor.');
      }

      const g = arena.data;

      switch (action) {
        case 'tickets':
          result = await arena.ticketPanel(i.channelId);
          break;

        case 'dm':
        case 'calls':
          await arena.configure({
            [action]: !g.config[action]
          });
          result = panel();
          break;

        case 'room':
          await arena.configure({
            roomType: g.config.roomType === 'channel'
              ? 'thread'
              : 'channel'
          });
          result = panel();
          break;

        case 'list':
          result = overview(
            'Filas',
            Object.values(g.queues).map(q =>
              `\`${q.id}\` • ${q.name} • ` +
              `${q.size}x${q.size} • ${q.mode} • ` +
              `R$ ${centsToBRL(q.priceCents)}` +
              `${q.panelError ? ' - ' + q.panelError : ''}`
            )
          );
          break;

        case 'matches':
          result = overview(
            'Partidas ativas',
            Object.values(g.matches)
              .filter(m => m.status === 'active')
              .map(m =>
                `\`${m.id}\` • <#${m.channelId}> • ` +
                `mediador <@${m.mediator}>`
              )
          );
          break;

        case 'autos':
          result = overview(
            'Agendamentos — remova com /auto-mensagem',
            Object.values(g.autos).map(a =>
              `\`${a.id}\` • <#${a.channelId}> • ` +
              `${a.minutes} min ${a.lastError || ''}`
            )
          );
          break;

        case 'blocks':
          result = overview(
            'Blacklist',
            Object.entries(g.blacklist).map(([id, reason]) =>
              `<@${id}> • ${reason}`
            )
          );
          break;

        case 'mediators':
          result = await arena.mediator('list', i.user.id);
          break;

        case 'config':
          result = overview(
            'Configuração',
            Object.entries(g.config).map(([k, v]) =>
              `**${k}:** ${String(v) || 'não configurado'}`
            )
          );
          break;

        case 'help':
          result = help();
          break;

        default:
          throw Error('Botão não disponível.');
      }
    } else {
      throw Error('Botão desconhecido.');
    }
  } else if (i.isChatInputCommand()) {
    const name = i.commandName;
    const o = i.options;

    if (
      isAdminCommand(name) &&
      !await arena.admin(i.user.id)
    ) {
      throw Error('É necessário Gerenciar Servidor.');
    }

    switch (name) {
      case 'painel':
        result = panel();
        break;

      case 'ajuda':
        result = help();
        break;

      case 'configurar': {
        const p = {};

        for (const [option, key] of Object.entries({
          categoria: 'categoryId',
          mediador: 'mediatorRoleId',
          suporte: 'supportRoleId',
          logs: 'logChannelId',
          salas: 'roomType',
          dm: 'dm',
          calls: 'calls'
        })) {
          const v = o.get(option)?.value;
          if (v !== undefined) p[key] = v;
        }

        result = await arena.configure(p);
        break;
      }

      case 'fila-criar':
        result = await arena.createQueue({
          name: o.getString('nome'),
          size: o.getInteger('time'),
          mode: o.getString('modo'),
          valor: o.getNumber('valor'),
          game: o.getString('jogo') || 'Free Fire',
          influencer: o.getUser('influencer')?.id || '',
          channelId: i.channelId
        });
        break;

      case 'fila-editar': {
        const p = {
          id: o.getString('id')
        };

        for (const [option, key] of Object.entries({
          nome: 'name',
          descricao: 'description',
          entrar: 'enterLabel',
          sair: 'leaveLabel',
          cor: 'color',
          estilo: 'style'
        })) {
          const v = o.getString(option);
          if (v !== null) p[key] = v;
        }

        const valor = o.getNumber('valor');
        if (valor !== null) p.valor = valor;

        result = await arena.editQueue(p);
        break;
      }

      case 'fila-excluir':
        result = await arena.deleteQueue(o.getString('id'));
        break;

      case 'mediador':
        result = await arena.mediator(
          o.getString('acao'),
          i.user.id
        );
        break;

      case 'resultado':
        result = await arena.finish(
          o.getString('id'),
          o.getString('vencedor'),
          i.user.id
        );
        break;

      case 'rank': {
        const type = o.getString('tipo') || 'geral';

        result = overview(
          `Ranking ${type}`,
          ranking(arena.data, type)
            .slice(0, 20)
            .map((r, n) =>
              `${n + 1}. <@${r.id}> • ` +
              (type === 'mediador'
                ? `${r.games} partidas mediadas`
                : `${r.points} pontos • ${r.wins} vitórias`)
            )
        );
        break;
      }

      case 'perfil':
        result = profile(
          o.getUser('usuario')?.id || i.user.id
        );
        break;

      case 'blacklist':
        result = await arena.blacklist({
          userId: o.getUser('usuario').id,
          block: o.getBoolean('bloquear'),
          reason: o.getString('motivo') || 'Restrição pela equipe'
        });
        break;

      case 'tickets-painel':
        result = await arena.ticketPanel(i.channelId);
        break;

      case 'auto-mensagem':
        result = await arena.auto({
          action: o.getString('acao'),
          text: o.getString('texto'),
          minutes: o.getInteger('minutos'),
          id: o.getString('id'),
          channelId: i.channelId
        });
        break;

      case 'pix-painel':
        result = await pixPanel(i.user.id);
        break;

      default:
        throw Error(
          'Comando não reconhecido. Registre os comandos novamente.'
        );
    }

    if (isAdminCommand(name)) {
      await arena.audit(`Comando /${name}`, i.user.id);
    }
  }

  await i.editReply(
    typeof result === 'string'
      ? {
          content: result,
          allowedMentions: { parse: [] }
        }
      : {
          ...result,
          allowedMentions: { parse: [] }
        }
  );
}

function help() {
  return overview(
    'Arena By Kaio',
    commands.map(c => `**/${c.name}** — ${c.description}`)
  );
}

client.on(Events.InteractionCreate, i => {
  if (
    !i.isChatInputCommand() &&
    !i.isButton() &&
    !i.isModalSubmit()
  ) {
    return;
  }

  if (i.guildId !== arena.guildId) {
    return i.reply({
      content: 'Este bot está configurado para outro servidor.',
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }

  const modalButton =
    (
      i.isButton() &&
      i.customId.startsWith('admin:') &&
      forms[i.customId.split(':')[1]]
    ) ||
    (
      i.isButton() &&
      i.customId === 'pixpanel:set'
    );

  if (modalButton) {
    handle(i).catch(async e => {
      if (!i.replied && !i.deferred) {
        await i.reply({
          content: safeError(e),
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
    });

    return;
  }

  i.deferReply({
    flags: MessageFlags.Ephemeral
  }).then(() =>
    arena.serial.run(arena.guildId, async () => {
      await handle(i);
    })
  ).catch(async e => {
    console.error('Operação falhou:', e.code || e.name);

    await i.editReply({
      content: safeError(e)
    }).catch(() => {});
  });
});

if (prefix) {
  client.on(Events.MessageCreate, async message => {
    if (
      message.author.bot ||
      message.guildId !== arena.guildId ||
      !/^[.!]p(?:\s|$)/i.test(message.content)
    ) {
      return;
    }

    const id =
      message.mentions.users.first()?.id ||
      message.author.id;

    await message.reply({
      ...profile(id),
      allowedMentions: {
        parse: [],
        repliedUser: false
      }
    }).catch(() => {});
  });
}

let interval;
let ticking = false;

client.once(Events.ClientReady, async () => {
  if (!arena.guild) {
    console.error(
      'GUILD_ID não encontrado. Convide o bot para esse servidor.'
    );

    await client.destroy();
    process.exitCode = 1;
    return;
  }

  client.user.setPresence({
    activities: [
      {
        name: 'By Kaio',
        type: ActivityType.Watching
      }
    ],
    status: 'online'
  });

  await arena.serial.run(
    arena.guildId,
    () => arena.recover()
  );

  console.log(`Arena pronta By Kaio ${client.user.tag}`);

  interval = setInterval(() => {
    if (ticking) return;

    ticking = true;

    arena.serial.run(
      arena.guildId,
      () => arena.tick()
    )
      .catch(e =>
        console.error('Agendador:', e.code || e.name)
      )
      .finally(() => {
        ticking = false;
      });
  }, 30000);
});

client.on(Events.Error, e =>
  console.error('Discord:', e.code || e.name)
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    clearInterval(interval);

    await arena.serial.run(
      arena.guildId,
      async () => store.save()
    );

    await client.destroy();
    process.exit(0);
  });
}

await client.login(process.env.DISCORD_TOKEN);