import { Input, InputProps } from '@/components/ui/input'
import { evaluateExpression, isCalculatorExpression } from '@/lib/calculator'
import { cn } from '@/lib/utils'
import { forwardRef, useEffect, useState } from 'react'

type CalculatorInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value: string | number
  onChange: (value: string) => void
  /** Number of decimal places to round the calculated result to once the expression is committed (blur). */
  decimalDigits?: number
}

const ALLOWED_CHARS = /[^0-9+\-*/(). ]/g

/**
 * Drop-in replacement for `Input` on numeric amount fields that also
 * accepts arithmetic expressions (e.g. "12.50+7*2") and evaluates them
 * live as the user types, committing the numeric result to `onChange`.
 */
export const CalculatorInput = forwardRef<HTMLInputElement, CalculatorInputProps>(
  ({ value, onChange, decimalDigits = 2, className, ...props }, ref) => {
    const [text, setText] = useState(String(value ?? ''))
    const [preview, setPreview] = useState<number | null>(null)

    // Keep local text in sync when the form value changes from outside
    // (e.g. reset, or another field driving this one) and we're not the source.
    useEffect(() => {
      const stringValue = String(value ?? '')
      if (stringValue !== String(preview ?? '') && stringValue !== text) {
        setText(stringValue)
        setPreview(null)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const commitText = (nextText: string) => {
      setText(nextText)

      if (!isCalculatorExpression(nextText)) {
        setPreview(null)
        onChange(nextText)
        return
      }

      const result = evaluateExpression(nextText)
      if (result !== null) {
        setPreview(result)
        onChange(String(result))
      }
      // If invalid mid-expression (e.g. "12+"), keep displaying the raw
      // text but don't push a bad value into the form yet.
    }

    return (
      <div className="flex flex-col gap-1">
        <Input
          {...props}
          ref={ref}
          className={className}
          value={text}
          onChange={(event) => {
            const filtered = event.target.value.replace(ALLOWED_CHARS, '')
            commitText(filtered)
          }}
          onBlur={(event) => {
            if (preview !== null) {
              const rounded = preview.toFixed(decimalDigits)
              setText(rounded)
              setPreview(null)
              onChange(rounded)
            }
            props.onBlur?.(event)
          }}
        />
        {preview !== null && (
          <span
            className={cn(
              'text-xs text-muted-foreground tabular-nums',
            )}
          >
            = {preview.toFixed(decimalDigits)}
          </span>
        )}
      </div>
    )
  },
)
CalculatorInput.displayName = 'CalculatorInput'
