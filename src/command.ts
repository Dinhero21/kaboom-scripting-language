import { type Context } from './context.js'

export type Command<T = any> = (helper: Context) => Promise<T>

export const COMMAND_MAP = new Map<string, Command>()
