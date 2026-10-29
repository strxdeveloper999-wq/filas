import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
for (const key of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']) if (!process.env[key]) throw Error(`Preencha ${key} no .env`);
await new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN).put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
console.log(`${commands.length} comandos registrados • By Kaio`);
