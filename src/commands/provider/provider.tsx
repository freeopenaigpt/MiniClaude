import chalk from 'chalk'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { getSettingsForSource } from '../../utils/settings/settings.js'
import { logEvent } from '../../services/analytics/index.js'

interface ProviderConfig {
  env: Record<string, string>
  model?: string
  defaultModels?: {
    sonnet?: string
    haiku?: string
    opus?: string
  }
  description?: string
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const trimmed = args?.trim() || ''

  // Read providers from user settings, fall back to initial settings
  const userSettings = getSettingsForSource('userSettings')
  const providers = (userSettings?.providers ||
    getInitialSettings().providers) as Record<string, ProviderConfig> | undefined

  if (!providers || Object.keys(providers).length === 0) {
    onDone(
      'No providers configured. Add a "providers" section to ~/.claude/settings.json:\n' +
        '  "providers": {\n' +
        '    "my-provider": {\n' +
        '      "env": { "ANTHROPIC_BASE_URL": "...", "ANTHROPIC_AUTH_TOKEN": "..." },\n' +
        '      "model": "...",\n' +
        '      "description": "..."\n' +
        '    }\n' +
        '  }',
    )
    return
  }

  if (!trimmed) {
    // List available providers
    const currentModel = process.env.ANTHROPIC_MODEL || 'unknown'
    const currentBaseUrl = process.env.ANTHROPIC_BASE_URL || 'default'
    const lines: string[] = ['Available providers:']
    for (const [name, config] of Object.entries(providers)) {
      const isActive =
        currentBaseUrl === (config.env.ANTHROPIC_BASE_URL || '')
      const marker = isActive ? chalk.green(' (active)') : ''
      const desc = config.description ? ` — ${config.description}` : ''
      lines.push(
        `  ${chalk.bold(name)}${marker}${desc}\n` +
          `    model: ${config.model || 'N/A'}\n` +
          `    base_url: ${config.env.ANTHROPIC_BASE_URL || 'N/A'}`,
      )
    }
    onDone(lines.join('\n'))
    return
  }

  // Switch to named provider
  const provider = providers[trimmed]
  if (!provider) {
    onDone(
      `Unknown provider "${trimmed}". Available: ${Object.keys(providers).join(', ')}`,
    )
    return
  }

  // Build settings update
  const settingsUpdate: Record<string, unknown> = {
    env: provider.env,
  }

  if (provider.model) {
    settingsUpdate.model = provider.model
  }

  if (provider.defaultModels) {
    const models: Record<string, string> = {}
    if (provider.defaultModels.sonnet) models.sonnet = provider.defaultModels.sonnet
    if (provider.defaultModels.haiku) models.haiku = provider.defaultModels.haiku
    if (provider.defaultModels.opus) models.opus = provider.defaultModels.opus
    if (Object.keys(models).length > 0) {
      settingsUpdate.defaultModels = models
    }
  }

  const result = updateSettingsForSource('userSettings', settingsUpdate as any)
  if (result.error) {
    onDone(`Failed to switch provider: ${result.error.message}`)
    return
  }

  logEvent('tengu_provider_switched', {
    provider: trimmed as any,
    model: provider.model as any,
  })

  const desc = provider.description ? ` (${provider.description})` : ''
  onDone(
    `Switched to ${chalk.bold(trimmed)}${desc}\n` +
      `  model: ${chalk.bold(provider.model || 'N/A')}\n` +
      `  base_url: ${provider.env.ANTHROPIC_BASE_URL || 'N/A'}`,
  )
}
