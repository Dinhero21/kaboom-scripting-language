import { Context } from './context.js'
import { createInterface } from 'readline/promises'

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

while (true) {
  try {
    const code = await rl.question('> ')

    const context = new Context(code)

    await context.evaluateCommandTotal()
  } catch (error) {
    console.error(error)
  }
}
