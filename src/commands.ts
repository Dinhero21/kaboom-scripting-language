import { COMMAND_MAP } from './command.js'
import { Context } from './context.js'
import { setTimeout as sleep } from 'timers/promises'
import chalk from 'chalk'

function * range (start: number, stop?: number, step: number = 1): Iterator<number> {
  if (stop === undefined) {
    stop = start
    start = 0
  }

  for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
    yield i
  }
}

COMMAND_MAP.set(
  'range',
  async context => {
    const index = context.index

    const int = await context.readInt()

    if (int === undefined) {
      context.prettyError(
        new Error('Expected [1, 3] integers, got 0'),
        index
      )

      // prettyError is already never but apparently TS doesn't recognize that
      return
    }

    return range(
      int,
      await context.readInt(),
      await context.readInt()
    )
  }
)

COMMAND_MAP.set(
  'say',
  async context => {
    const message = await context.readString({
      endToken: () => false
    })

    console.info(message)
  }
)

COMMAND_MAP.set(
  'for',
  async context => {
    let index = 0

    const variable = await context.readVariableName()

    index = context.index

    const specifier = await context.readString()

    if (specifier !== 'in') {
      context.prettyError(
        new Error(`Unexpected specifier ${JSON.stringify(specifier)}, expected "in"`),
        index
      )
    }

    const iterable = await context.evaluateCommand()

    index = context.index

    const action = await context.readString()

    if (action !== 'do') {
      context.prettyError(
        new Error(`Unexpected action ${JSON.stringify(action)}, expected "do"`),
        index
      )
    }

    const offsets: number[] = []

    for (const i of iterable) {
      const clone = context.clone()

      clone.variable.set(variable, i)

      const before = clone.index

      await clone.evaluateCommandTotal()

      const after = clone.index

      const delta = after - before

      offsets.push(delta)
    }

    if (offsets.length === 0) {
      console.warn(chalk.yellow('Empty iterable, command never evaluated, offsets not applied'))
      console.warn(chalk.yellow('command (what comes after "do") might be evaluated outside of the for loop'))

      return
    }

    const firstOffset = offsets[0]

    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i]

      if (offset === firstOffset) continue

      throw new Error(`Inconsistent offsets! Offset for first iteration was ${offset}, offset for iteration ${i} was ${offset}`)
    }

    context.consume(firstOffset)
  }
)

COMMAND_MAP.set(
  '{',
  async context => {
    const command = await context.readString({
      endToken: '}',
      endOnLineEnd: false
    })

    const commandContext = new Context(command)
    context.copyVariables(commandContext)

    await commandContext.evaluateCommandTotal()
  }
)

COMMAND_MAP.set(
  'sleep',
  async context => {
    const ms = await context.readInt()

    await sleep(ms)
  }
)

COMMAND_MAP.set(
  'return',
  async context => {
    return await context.readString()
  }
)
