# Arena — By Kaio

Bot Discord para partidas pagas. Toda a administração acontece dentro do Discord, por slash commands, botões e formulários. Sem painel web.

## O que está incluído

- Filas individuais para partidas 1x1, 2x2, 3x3 e 4x4; times sorteados quando a sala é formada.
- Campo livre para jogo e modo: Normal, Gel infinito, Misto, Tático e outros.
- Filas com vaga reservada para influencer.
- Valor de entrada por jogador (R$) configurável em cada fila; pago via Pix diretamente ao mediador escalado.
- Painel Pix (`/pix-painel`): cada mediador cadastra sua própria chave (CPF, CNPJ, e-mail, telefone ou aleatória). Sem chave cadastrada, o mediador não pode ficar disponível.
- Fila de mediadores: atribuição por ordem de disponibilidade, com validação do cargo e da chave Pix.
- Salas em canais privados ou tópicos privados; call privada opcional.
- Avisos por DM e registro de falhas quando a pessoa não aceita mensagens.
- Título, descrição, cor, emoji da fila, texto/emoji dos botões e estilo do botão de entrada editáveis.
- Painel administrativo /painel, blacklist e clonagem de emojis.
- Tickets privados com fechamento pelo autor ou suporte; histórico preservado.
- Mensagens recorrentes no canal escolhido, intervalo entre 5 minutos e 7 dias.
- Rankings geral, diário (horário de São Paulo) e de mediadores.
- Perfil por /perfil e, opcionalmente, .p / !p / .P / !P com menção.
- Presença “Assistindo By Kaio”, créditos nos painéis e logs locais.
- Dados JSON locais, gravação atômica e recuperação de filas após reinício.

Os pontos são apenas pontuação do ranking: vitória vale 3 e participação vale 1. Esta versão não inclui loja, roleta ou apostas. O pagamento da entrada é combinado por Pix, direto do jogador para a chave do mediador escalado: o bot nunca processa, recebe ou repassa dinheiro, apenas exibe a chave cadastrada e registra a confirmação que o próprio mediador informa pelo botão da sala. Não há gateway, cobrança automática ou estorno automático — o controle depende inteiramente do mediador. Os canais e tópicos organizam os jogadores no Discord; a sala dentro do jogo é criada manualmente pela equipe. “Contra influencer” reserva uma vaga, mas não fixa todos os demais jogadores como adversários: em equipes maiores, os times são sorteados.

## Instalação

Use Node.js 22.12 ou superior, de 64 bits. O projeto usa discord.js 14.22.1 fixado no package-lock.json. Não foi preparado para Node.js 4, Python ou computadores de 32 bits.

1. Extraia o ZIP e abra o terminal dentro da pasta `arena-diaz`.
2. Copie `.env.example` para `.env`. No Linux: `cp .env.example .env`. No Windows: `copy .env.example .env`.
3. Edite o `.env`:
   - `DISCORD_TOKEN`: token do bot, obtido no Discord Developer Portal.
   - `CLIENT_ID`: Application ID da aplicação.
   - `GUILD_ID`: ID do seu servidor; ative o Modo Desenvolvedor no Discord para copiar.
4. Instale, registre os comandos e ligue:

```sh
npm ci
npm run register
npm start
```

Não envie seu token em conversas nem o inclua em arquivos compartilhados. O ZIP vem sem credenciais. O registro substitui a lista de comandos desta aplicação neste servidor: use uma aplicação própria para este projeto.

## Convite e permissões

No Discord Developer Portal, crie uma aplicação e um bot. No gerador OAuth2, selecione `bot` e `applications.commands`. Selecione estas permissões, convide o bot e confira as restrições nos canais usados:

- View Channels, Send Messages, Embed Links e Read Message History.
- Manage Channels para salas de texto, tickets e calls.
- Create Private Threads, Send Messages in Threads e Manage Threads para tópicos privados.
- Connect e Speak para a call.
- Create Expressions / Manage Guild Expressions para copiar emojis.
- Use External Emojis quando usar emojis de outros servidores.

Não é necessário conceder Administrador ao bot. Usuários que configuram o bot precisam de **Gerenciar Servidor**. Administradores do Discord podem acessar canais privados por causa das permissões da própria plataforma.

Para usar os atalhos `.p` e `!p`, mude `ENABLE_PREFIX=true` no `.env` e ative **Message Content Intent** na página Bot do portal. Sem isso, use `/perfil`, que funciona com a configuração padrão.

## Primeira configuração

1. Crie uma categoria, um cargo de mediador e um cargo para suporte.
2. Execute `/configurar categoria:... mediador:... suporte:... logs:... salas:... dm:true calls:true`.
3. Cada mediador usa `/pix-painel` e cadastra sua chave Pix antes de tentar ficar disponível.
4. Use `/painel` em um canal de texto para abrir o painel administrativo privado.
5. Clique em **Criar fila**, ou use `/fila-criar nome:Treino time:1 modo:Normal valor:10 jogo:Free Fire`.
6. Cada mediador disponível usa `/mediador acao:Entrar` (exige chave Pix cadastrada).
7. Os jogadores clicam **Entrar**. A sala é criada quando a fila completa e existe um mediador disponível com chave Pix. A verificação periódica ocorre a cada 30 segundos.
8. Na sala, os jogadores enviam o Pix ao mediador pela chave exibida; o mediador clica em **Confirmar pagamento**.
9. O mediador atribuído usa `/resultado id:ID_DA_PARTIDA vencedor:Time A`, ou Time B/Cancelar. Exceto para cancelar, isso exige pagamento confirmado.

O mediador sai da fila de disponibilidade ao ser atribuído e precisa entrar novamente para outra partida. Um mediador em partida não pode participar como jogador de outra partida ao mesmo tempo.

## Pagamentos (Pix)

- Cada mediador cadastra a própria chave Pix em `/pix-painel` (botão **Definir/Atualizar chave Pix**, tipos aceitos: CPF, CNPJ, e-mail, telefone ou chave aleatória). Sem chave cadastrada, `/mediador acao:Entrar` é recusado.
- O valor da entrada é definido por fila em `/fila-criar` (opção `valor`, em R$) e pode ser alterado depois em `/fila-editar`. O valor aparece no painel da fila e é por jogador.
- Quando uma partida é formada, a sala mostra o valor e a chave Pix do mediador escalado no momento da criação (uma troca posterior de chave não altera partidas já criadas).
- Os jogadores pagam por Pix diretamente ao mediador — o bot não movimenta dinheiro, não integra nenhum gateway e não confirma o recebimento sozinho.
- Somente o mediador responsável pode clicar em **Confirmar pagamento** na sala; nem administradores substituem essa confirmação.
- `/resultado` com Time A ou Time B exige pagamento confirmado; `/resultado ... Cancelar` continua disponível mesmo sem confirmação, para destravar partidas problemáticas.
- Remover a chave Pix (`/pix-painel` → **Remover chave**) tira o mediador da disponibilidade até cadastrar outra.

## Comandos

| Comando | Uso |
|---|---|
| `/painel` | Botões de administração, listagem de IDs e configurações |
| `/ajuda` | Lista de comandos |
| `/configurar` | Categoria, cargos, logs, canais/tópicos, DM e calls |
| `/fila-criar` | Nome, tamanho do time, modo, valor da entrada (R$), jogo e influencer opcional |
| `/fila-editar` | ID, título, descrição, emojis, textos dos botões, cor, estilo e valor |
| `/fila-excluir` | Remove a fila; partidas já criadas continuam |
| `/mediador` | Entrar (exige chave Pix cadastrada), sair ou listar disponibilidade |
| `/pix-painel` | Mediador cadastra, atualiza ou remove sua chave Pix |
| `/resultado` | Time A, Time B (exige pagamento confirmado) ou cancelar; aceita uma única conclusão |
| `/rank` | Geral, diário ou mediadores |
| `/perfil` | Pontuação do usuário ou da pessoa mencionada |
| `/blacklist` | Adiciona ou remove restrição de participação |
| `/tickets-painel` | Publica botão para abrir tickets |
| `/auto-mensagem` | Cria no canal atual ou remove pelo ID |
| `/emoji-clonar` | Copia emoji de um servidor acessível ao bot |

Para escolher o canal de uma fila, ticket ou mensagem automática, execute o comando naquele canal. Os modais do painel também usam o canal em que o painel foi aberto. O painel exibe até o limite de caracteres de uma mensagem do Discord; filas e agendamentos têm limites de 50 e 20 por servidor.

Emojis podem ser Unicode, como 🎮, ou personalizados, como `<:nome:ID>`. O Discord precisa aceitar o emoji e o bot precisa ter acesso a ele. Para remover um emoji pelo comando, use um espaço no campo de edição. Cada fila tem um único modo; crie filas separadas para normal, misto, gel infinito etc.

## Comportamento e operação

- As filas são por jogador, não inscrições de uma equipe pré-formada.
- Uma fila completa aguarda se não houver mediador livre com chave Pix cadastrada, ou se o influencer estiver ocupado/bloqueado.
- Blacklist remove das filas de espera e da disponibilidade de mediadores; não encerra automaticamente partidas ativas.
- Remover a chave Pix retira o mediador da disponibilidade, mas não afeta partidas já em andamento.
- Se faltar permissão ao criar sala, os jogadores continuam na fila e o bot tenta novamente periodicamente. Confira o canal de logs.
- O registro do resultado não se repete. Partidas canceladas não geram pontuação.
- Calls são removidas após o resultado, se permitido. Canais de texto são preservados; tópicos são arquivados e bloqueados. A equipe pode remover os históricos manualmente.
- Ticket fechado mantém leitura, bloqueia envio do autor e permite abrir outro ticket. A equipe conserva acesso; administradores mantêm os privilégios do Discord.
- Mensagens automáticas não notificam @everyone nem cargos. Mensagens perdidas enquanto o bot estava desligado não são enviadas em lote.
- Mantenha uma única instância usando `data/state.json`. Não execute dois processos sobre o mesmo arquivo.
- Para backup, pare o bot e copie `data/`. Nunca apague essa pasta durante atualizações. Históricos e rankings crescem com o uso: este projeto é destinado a uma comunidade em uma única instância, sem banco externo.
- Para manter o bot online, o computador ou hospedagem Node.js deve ficar ligado. Hospedagem de páginas estáticas, como um site Netlify, não executa este processo contínuo.
- Se uma reinicialização ocorrer durante a criação de sala, o bot cancela essa criação e tenta preservar os jogadores na fila. Uma interrupção exatamente durante uma resposta da API pode deixar uma sala órfã para remoção manual.

## Verificação

```sh
npm test
```

Os testes usam o SDK real e uma API Discord simulada para verificar filas, duplicidade, permissões de resultado, blacklist, formação de times, falhas de criação, tópicos, tickets, agendamentos e persistência. Não substituem um teste conectado ao Discord. Nenhum token foi fornecido na preparação do projeto; a conexão real, entrega de DM e permissões precisam ser conferidas no seu servidor.

Documentação de referência: https://discord.js.org/docs/packages/discord.js/14.22.1

By Kaio
