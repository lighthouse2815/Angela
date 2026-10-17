import { cliMessages } from '@proj-airi/i18n/cli'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

export * from './ping'
export * from './summon'

/** Registers the call controls and waits for Discord's response. */
export async function registerCommands(token: string, clientId: string, messages = cliMessages.vi.discordVoice) {
  const rest = new REST()

  rest.setToken(token)
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: [
      new SlashCommandBuilder().setName('ping').setDescription(messages.pingDescription),
      new SlashCommandBuilder().setName('summon').setDescription(messages.summonDescription).setDMPermission(false),
      new SlashCommandBuilder().setName('leave').setDescription(messages.leaveDescription).setDMPermission(false),
      new SlashCommandBuilder().setName('listen').setDescription(messages.listenDescription).setDMPermission(false).addBooleanOption(option => option.setName('enabled').setDescription(messages.enabledDescription).setRequired(true)),
    ] },
  )
}
