import type { Card } from '@angela/ccc'

import type { AngelaExtension } from '../types/angela-card'

import {
  check,
  nonEmpty,
  object,
  objectWithRest,
  parseJson,
  pipe,
  regex,
  safeParse,
  string,
  trim,
  unknown,
} from 'valibot'

export type AngelaCardDraftValidationError = 'name' | 'version' | 'invalid_artistry_json'

/** Module settings owned by the Angela Card editor form. */
interface AngelaCardEditorModules {
  consciousness: AngelaExtension['modules']['consciousness']
  vision: AngelaExtension['modules']['vision']
  speech: Pick<AngelaExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>
  displayModelId?: string
  artistry: Pick<
    NonNullable<AngelaExtension['modules']['artistry']>,
    | 'provider'
    | 'model'
    | 'promptPrefix'
    | 'widgetInstruction'
    | 'spawnMode'
    | 'options'
    | 'autonomousEnabled'
    | 'autonomousThreshold'
  >
}

/**
 * Reads the module fields that the Angela Card editor owns.
 *
 * Empty strings mean that the card inherits the corresponding global setting.
 */
export function getAngelaCardEditorModuleSettings(
  card: Card | undefined,
): Pick<AngelaCardEditorModules, 'consciousness' | 'vision' | 'speech' | 'displayModelId'> {
  const modules = getAngelaCardModules(card?.extensions?.airi)

  return {
    consciousness: {
      provider: getModuleString(modules?.consciousness, 'provider'),
      model: getModuleString(modules?.consciousness, 'model'),
    },
    vision: {
      provider: getModuleString(modules?.vision, 'provider'),
      model: getModuleString(modules?.vision, 'model'),
    },
    speech: {
      provider: getModuleString(modules?.speech, 'provider'),
      model: getModuleString(modules?.speech, 'model'),
      voice_id: getModuleString(modules?.speech, 'voice_id'),
    },
    displayModelId: getModuleString(modules, 'displayModelId'),
  }
}

type CardWithAngelaExtension = Card & {
  extensions: NonNullable<Card['extensions']> & {
    airi: AngelaExtension
  }
}

export type AngelaCardDraftValidationResult
  = | {
    success: true
    output: {
      card: Card
      artistryOptions: Record<string, unknown> | undefined
    }
  }
  | {
    success: false
    error: AngelaCardDraftValidationError
  }

const cardDraftSchema = object({
  name: pipe(string(), trim(), nonEmpty()),
  version: pipe(string(), trim(), regex(/^(?:\d+\.)+\d+$/)),
})

const artistryOptionsSchema = pipe(
  string(),
  trim(),
  parseJson(),
  check(isRecord),
  objectWithRest({}, unknown()),
)

/**
 * Validates and normalizes the fields owned by the Angela Card editor.
 *
 * Display text remains untouched except for boundary whitespace on the
 * required name and version fields. Artistry options must be a JSON object
 * when present.
 */
export function safeParseAngelaCardDraft(card: Card, artistryOptionsJson: string): AngelaCardDraftValidationResult {
  const cardResult = safeParse(cardDraftSchema, card)
  if (!cardResult.success) {
    const invalidField = cardResult.issues[0]?.path?.[0]?.key
    return {
      success: false,
      error: invalidField === 'version' ? 'version' : 'name',
    }
  }

  const normalizedArtistryOptions = artistryOptionsJson.trim()
  if (!normalizedArtistryOptions) {
    return {
      success: true,
      output: {
        card: { ...card, ...cardResult.output },
        artistryOptions: undefined,
      },
    }
  }

  const artistryResult = safeParse(artistryOptionsSchema, normalizedArtistryOptions)
  if (!artistryResult.success) {
    return {
      success: false,
      error: 'invalid_artistry_json',
    }
  }

  return {
    success: true,
    output: {
      card: { ...card, ...cardResult.output },
      artistryOptions: artistryResult.output,
    },
  }
}

/**
 * Applies editor-owned module fields to a complete character card.
 *
 * The returned card preserves extension fields the form cannot display,
 * including body models, backgrounds, advanced speech/artistry settings, and
 * agent configuration.
 */
export function applyAngelaCardEditorModules(
  card: Card,
  edited: AngelaCardEditorModules,
): CardWithAngelaExtension {
  const existing = isAngelaExtension(card.extensions?.airi)
    ? card.extensions.airi
    : undefined

  return {
    ...card,
    extensions: {
      ...card.extensions,
      airi: {
        ...existing,
        modules: {
          ...existing?.modules,
          ...edited,
          speech: {
            ...existing?.modules.speech,
            ...edited.speech,
          },
          artistry: {
            ...existing?.modules.artistry,
            ...edited.artistry,
          },
        },
        agents: existing?.agents ?? {},
      },
    },
  }
}

function isAngelaExtension(value: unknown): value is AngelaExtension {
  return isRecord(value)
    && isRecord(value.modules)
    && isRecord(value.agents)
}

function getAngelaCardModules(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.modules))
    return undefined

  return value.modules
}

function getModuleString(module: unknown, key: string): string {
  if (!isRecord(module))
    return ''

  const value = module[key]
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Supported aliases for existing card editor consumers. */
export {
  applyAngelaCardEditorModules as applyAiriCardEditorModules,
  getAngelaCardEditorModuleSettings as getAiriCardEditorModuleSettings,
  safeParseAngelaCardDraft as safeParseAiriCardDraft,
}
export type {
  AngelaCardDraftValidationError as AiriCardDraftValidationError,
  AngelaCardDraftValidationResult as AiriCardDraftValidationResult,
}
