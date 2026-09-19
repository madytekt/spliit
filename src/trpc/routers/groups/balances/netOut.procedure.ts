import { getGroupExpenses, randomId } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { findNetOutTarget, planNetOut } from '@/lib/net-out'
import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import { ActivityType, Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const PAYMENT_CATEGORY_ID = 1

export const netOutGroupsBalancesProcedure = baseProcedure
  .input(z.object({ groupIds: z.array(z.string().min(1)).min(1) }))
  .mutation(async ({ input: { groupIds } }) => {
    // Balances are recomputed server-side; the client only says which groups.
    const groups = await Promise.all(
      (
        await prisma.group.findMany({
          where: { id: { in: groupIds } },
          include: { participants: true },
        })
      ).map(async (group) => ({
        ...group,
        balances: getBalances(await getGroupExpenses(group.id)),
      })),
    )

    const target = findNetOutTarget(groups)
    if (!target) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No group named "Everyday" to net balances into.',
      })
    }

    const plan = planNetOut(target, groups)
    const now = new Date()
    const notes = `Automatic net-out. No money changed hands: this entry and its counterpart cancel out.`

    const writes: Prisma.PrismaPromise<unknown>[] = []
    const addReimbursement = (
      groupId: string,
      title: string,
      amount: number,
      paidById: string,
      paidForId: string,
    ) => {
      const expenseId = randomId()
      writes.push(
        prisma.expense.create({
          data: {
            id: expenseId,
            groupId,
            expenseDate: now,
            categoryId: PAYMENT_CATEGORY_ID,
            amount,
            title,
            paidById,
            splitMode: 'EVENLY',
            isReimbursement: true,
            notes,
            paidFor: {
              create: [{ participantId: paidForId, shares: 1 }],
            },
          },
        }),
        prisma.activity.create({
          data: {
            id: randomId(),
            groupId,
            activityType: ActivityType.CREATE_EXPENSE,
            expenseId,
            data: title,
          },
        }),
      )
    }

    for (const t of plan.transfers) {
      addReimbursement(
        t.sourceGroupId,
        `Net-out → ${target.name}`,
        t.amount,
        t.source.paidById,
        t.source.paidForId,
      )
      addReimbursement(
        target.id,
        `Net-out from ${t.sourceGroupName}`,
        t.amount,
        t.target.paidById,
        t.target.paidForId,
      )
    }

    // One transaction: either every pair lands or none do.
    await prisma.$transaction(writes)

    return {
      targetGroupId: target.id,
      netted: plan.transfers.map((t) => ({
        groupName: t.sourceGroupName,
        amount: t.amount,
      })),
      skipped: plan.skipped,
    }
  })
