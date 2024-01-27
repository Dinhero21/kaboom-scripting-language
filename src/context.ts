import { COMMAND_MAP, type Command } from './command.js'
import { toPredicate, type MaybePredicate } from './predicate.js'
import chalk from 'chalk'

export const SYMBOL_END = Symbol('end')

export type SymbolEnd = typeof SYMBOL_END

export interface ReadOption {
  consumeWhitespace?: boolean
  endOnLineEnd?: boolean
}

export interface ReadStringOption extends ReadOption {
  endToken?: MaybePredicate<string>
  consumeEndToken?: boolean
  reader?: () => Promise<unknown>
}

// consume = "eat" buffer
// seek    = return
// read    = seek & consume

// character = unicode code point
// token     = character * ℕ₀
// unit      = character | variable | command substitution

// ? Should I readWhitespace on all reads? And if so, should I do it before and/or after?
export class Context {
  // meta (not directly related to the programming language itself)

  public readonly buffer
  public index: number = 0

  constructor (buffer: string, index: number = 0) {
    this.buffer = buffer
    this.index = index
  }

  private readonly lastUnitIndex = 0

  public prettyError (error: Error, index: number = this.index): never {
    console.error(chalk.red(this.buffer))
    console.error(chalk.red(`${' '.repeat(index)}^`))

    console.error(chalk.red(error.message))

    process.exit(1)
  }

  public clone (): Context {
    const clone = new Context(this.buffer, this.index)

    this.copyVariables(clone)

    return clone
  }

  public readonly variable = new Map<string, unknown>()

  public copyVariables (other: Context): void {
    for (const [key, value] of this.variable) {
      other.variable.set(key, value)
    }
  }

  // consume (delete)

  public consume (length: number): void {
    this.index += length
  }

  public consumeCharacter (): void {
    this.consume(1)
  }

  public consumeWhitespace (): void {
    while (this.seekCharacter() === ' ') {
      this.consumeCharacter()
    }
  }

  // seek (immutably read)

  public seekCharacter (): string | undefined {
    return this.buffer[this.index]
  }

  public seekToken (token: string): boolean {
    return this.buffer.slice(this.index).startsWith(token)
  }

  // read (seek & consume)

  protected applyReadOptions (options?: ReadOption): void {
    options ??= {}
    options.consumeWhitespace ??= true

    if (options.consumeWhitespace) {
      this.consumeWhitespace()
    }
  }

  public readCharacter (): string | undefined {
    const character = this.seekCharacter()

    this.consumeCharacter()

    return character
  }

  public readToken (token: string): boolean {
    if (!this.seekToken(token)) return false

    this.consume(token.length)

    return true
  }

  public async readInt (options?: ReadOption): Promise<number | undefined> {
    let integer: number | undefined

    const negate = this.readToken('-')

    while (true) {
      const index = this.index

      const unit = await this.readUnit()

      if (unit === undefined) {
        this.index = index

        break
      }

      if ((options?.endOnLineEnd ?? true) && unit === ';') {
        // this.index = index

        break
      }

      const string = String(unit)

      const digit = parseInt(string)

      if (Number.isNaN(digit)) {
        this.index = index

        break
      }

      integer ??= 0

      integer *= 10

      integer += digit
    }

    if (negate && integer !== undefined) integer = -integer

    this.applyReadOptions(options)

    return integer
  }

  public async readFloat (options?: ReadOption): Promise<number | undefined> {
    const float = await (async () => {
      let integer = await this.readInt()

      // If there is no "." after the integer, just return the integer
      if (!this.readToken('.')) return integer

      integer ??= 0

      const start = this.index

      const rawFractional = await this.readInt()

      // (digit * ℕ).
      if (rawFractional === undefined) return integer

      const end = this.index

      const fractionalLength = end - start

      const fractional = rawFractional / (10 ** fractionalLength)

      return integer + fractional
    })()

    this.applyReadOptions(options)

    return float
  }

  public async readString (options?: ReadStringOption): Promise<string> {
    options ??= {}

    let isEndToken = options.endToken ??= this.readToken('"') ? '"' : ' '

    isEndToken = toPredicate(isEndToken)

    const consumeEndToken = options.consumeEndToken ??= !isEndToken(' ')

    const reader = options.reader ??= async () => await this.readUnit()

    let string = ''

    let escape = false

    while (true) {
      const index = this.index

      const token = await reader()

      if (token === undefined) {
        this.index = index

        // ? Should I break or return string
        // return: wont applyReadOptions
        // break:  will applyReadOptions
        break
      }

      const tokenString = String(token)

      if ((options.endOnLineEnd ?? true) && tokenString === ';') {
        // this.index = index

        break
      }

      if (escape) {
        string += tokenString
        escape = false
        continue
      }

      if (isEndToken(tokenString)) {
        if (!consumeEndToken) this.index = index

        break
      }

      switch (tokenString) {
        case '\\':
          escape = true
          break
        default:
          string += tokenString
          break
      }
    }

    this.applyReadOptions(options)

    return string
  }

  public async readVariableName (options?: ReadStringOption): Promise<string> {
    return await this.readString({
      ...options,
      // This should probably be false as it is how it is used internally
      // but I find it unintuitive to have to specify whitespace consumption
      // when specifying commands, and it can lead to highly confusing errors
      // consumeWhitespace: false,
      consumeEndToken: false,
      endToken: character => {
        const valid =
          (character >= 'a' && character <= 'z') ||
          (character >= 'A' && character <= 'Z') ||
          (character >= '0' && character <= '9')

        return !valid
      },
      // ? Should I prohibit variables in variable names
      // No $$i 😭
      reader: async () => this.readCharacter()
    })
  }

  public async readUnit (): Promise<string | undefined | unknown> {
    const unit = await (async () => {
      const character = this.readCharacter()

      if (character !== '$') return character

      if (this.seekCharacter() === '{') {
        this.consumeCharacter()

        const command = await this.readString({
          endToken: '}',
          consumeEndToken: true,
          endOnLineEnd: false
        })

        const context = new Context(command)

        for (const [key, value] of this.variable) {
          context.variable.set(key, value)
        }

        return await context.evaluateCommand()
      }

      const name = await this.readVariableName({
        consumeWhitespace: false
      })

      const variable = this.variable.get(name)

      if (variable === undefined) {
        this.prettyError(
          new Error(`Unknown variable ${JSON.stringify(name)}`),
          this.index - name.length
        )
      }

      return variable
    })()

    return unit
  }

  // command (code execution)

  public async getCommand (): Promise<Command | SymbolEnd> {
    const index = this.index

    const commandName = await this.readString()

    if (commandName === '') {
      return SYMBOL_END
    }

    const commandFunction = COMMAND_MAP.get(commandName)

    if (commandFunction === undefined) {
      this.prettyError(
        new Error(`Unknown command ${JSON.stringify(commandName)}`),
        index
      )
    }

    return commandFunction
  }

  public async evaluateCommand (): Promise<any> {
    const command = await this.getCommand()

    if (command === SYMBOL_END) {
      return SYMBOL_END
    }

    return await command(this)
  }

  public async evaluateCommandTotal (): Promise<void> {
    // while (this.index < this.buffer.length) {
    while (true) {
      const output = await this.evaluateCommand()

      if (output === SYMBOL_END) {
        break
      }
    }
  }
}
