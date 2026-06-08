'use client'

import { GroupForm } from '@/components/group-form'
import { trpc } from '@/trpc/client'
import { useCurrentGroup } from '../current-group-context'
import { DeleteGroupButton } from './delete-group-button'

export const EditGroup = () => {
  const { groupId } = useCurrentGroup()
  const { data, isLoading } = trpc.groups.getDetails.useQuery({ groupId })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()

  if (isLoading) return <></>

  return (
    <div className="flex flex-col gap-8">
      <GroupForm
        group={data?.group}
        onSubmit={async (groupFormValues, participantId) => {
          await mutateAsync({ groupId, participantId, groupFormValues })
          await utils.groups.invalidate()
        }}
        protectedParticipantIds={data?.participantsWithExpenses}
      />
      <div className="border-t pt-6">
        <p className="text-sm text-muted-foreground mb-3">Danger zone</p>
        <DeleteGroupButton
          groupId={groupId}
          groupName={data?.group?.name ?? ''}
        />
      </div>
    </div>
  )
}
