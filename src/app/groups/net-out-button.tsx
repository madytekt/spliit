'use client'

import { AsyncButton } from '@/components/async-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale } from 'next-intl'
import { useState } from 'react'

type GroupBalance = { id: string; name: string; balance: number }

export function NetOutButton({
  target,
  sources,
  currency,
}: {
  target: GroupBalance
  sources: GroupBalance[]
  currency: Currency
}) {
  const locale = useLocale()
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const { mutateAsync } = trpc.groups.balances.netOut.useMutation()

  const format = (amount: number) =>
    formatCurrency(currency, Math.abs(amount), locale)
  const describe = (amount: number) =>
    amount > 0 ? `you're owed ${format(amount)}` : `you owe ${format(amount)}`
  const resulting =
    target.balance + sources.reduce((sum, s) => sum + s.balance, 0)

  const handleNetOut = async () => {
    let result
    try {
      result = await mutateAsync({
        groupIds: [target.id, ...sources.map((s) => s.id)],
      })
    } catch (err) {
      toast({
        title: 'Net out failed — nothing was changed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
      return
    }
    await Promise.all([
      utils.groups.balances.invalidate(),
      utils.groups.expenses.invalidate(),
    ])
    setOpen(false)
    if (result.skipped.length > 0) {
      toast({
        title: 'Some groups were not netted out',
        description: result.skipped
          .map(
            (s) =>
              `${s.groupName}: ${
                s.reason === 'currency-mismatch'
                  ? 'different currency'
                  : 'participant names don’t match'
              }`,
          )
          .join(' · '),
        variant: 'destructive',
      })
    } else {
      toast({ title: `Balances moved into ${target.name}` })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          Net out
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Net out into {target.name}?</DialogTitle>
        <DialogDescription>
          Each group below gets a &ldquo;Net-out&rdquo; reimbursement that
          settles it to zero, and a matching entry is added to {target.name}. No
          money changes hands and your overall balance stays the same.
        </DialogDescription>
        <ul className="text-sm divide-y">
          {sources.map((s) => (
            <li key={s.id} className="flex justify-between py-2">
              <span>{s.name}</span>
              <span className="text-muted-foreground">
                {describe(s.balance)}
              </span>
            </li>
          ))}
          <li className="flex justify-between py-2">
            <span>{target.name} now</span>
            <span className="text-muted-foreground">
              {target.balance === 0 ? 'settled' : describe(target.balance)}
            </span>
          </li>
          <li className="flex justify-between py-2 font-medium">
            <span>{target.name} after</span>
            <span>{resulting === 0 ? 'settled' : describe(resulting)}</span>
          </li>
        </ul>
        <DialogFooter className="flex flex-col gap-2">
          <AsyncButton
            type="button"
            loadingContent="Netting out…"
            action={handleNetOut}
          >
            Net out
          </AsyncButton>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
