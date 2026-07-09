/**
 * Minimal safe arithmetic expression evaluator (+ - * / and parentheses).
 * No `eval`/`Function` — hand-rolled recursive-descent parser over a
 * character whitelist, so it can run on untrusted user input.
 */
export function evaluateExpression(expression: string): number | null {
  const src = expression.trim()
  if (!src) return null

  let i = 0
  const peek = () => src[i]
  const isDigit = (c: string | undefined) => !!c && c >= '0' && c <= '9'
  const skipSpaces = () => {
    while (i < src.length && src[i] === ' ') i++
  }

  const parseNumber = (): number => {
    skipSpaces()
    const start = i
    while (i < src.length && (isDigit(src[i]) || src[i] === '.')) i++
    if (i === start) throw new Error('expected number')
    const value = Number(src.slice(start, i))
    if (Number.isNaN(value)) throw new Error('invalid number')
    return value
  }

  const parseFactor = (): number => {
    skipSpaces()
    const c = peek()
    if (c === '+') {
      i++
      return parseFactor()
    }
    if (c === '-') {
      i++
      return -parseFactor()
    }
    if (c === '(') {
      i++
      const value = parseExpr()
      skipSpaces()
      if (peek() !== ')') throw new Error('expected )')
      i++
      return value
    }
    return parseNumber()
  }

  const parseTerm = (): number => {
    let value = parseFactor()
    while (true) {
      skipSpaces()
      const c = peek()
      if (c === '*' || c === '/') {
        i++
        const rhs = parseFactor()
        if (c === '/') {
          if (rhs === 0) throw new Error('division by zero')
          value = value / rhs
        } else {
          value = value * rhs
        }
      } else {
        break
      }
    }
    return value
  }

  const parseExpr = (): number => {
    let value = parseTerm()
    while (true) {
      skipSpaces()
      const c = peek()
      if (c === '+' || c === '-') {
        i++
        const rhs = parseTerm()
        value = c === '+' ? value + rhs : value - rhs
      } else {
        break
      }
    }
    return value
  }

  try {
    const result = parseExpr()
    skipSpaces()
    if (i !== src.length) return null // trailing garbage
    if (!Number.isFinite(result)) return null
    return result
  } catch {
    return null
  }
}

/** Whether the text contains an operator, i.e. is a calculation rather than a plain number (a leading "-" for negative amounts doesn't count). */
export function isCalculatorExpression(text: string): boolean {
  const withoutLeadingSign = text.replace(/^\s*-/, '')
  return /[+\-*/]/.test(withoutLeadingSign)
}
