'use client'

import {
  deleteRecentGroup,
  unarchiveGroup,
  unstarGroup,
} from '@/app/groups/recent-groups-helpers'
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
import { trpc } from '@/trpc/client'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function DeleteGroupButton({
  groupId,
  groupName,
}: {
  groupId: string
  groupName: string
}) {
  const router = useRouter()
  const { mutateAsync } = trpc.groups.delete.useMutation()

  const handleDelete = async () => {
    await mutateAsync({ groupId })
    deleteRecentGroup({ id: groupId, name: groupName })
    unstarGroup(groupId)
    unarchiveGroup(groupId)
    router.push('/groups')
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete &ldquo;{groupName}&rdquo;?</DialogTitle>
        <DialogDescription>
          This permanently deletes the group and all its expenses. This cannot
          be undone.
        </DialogDescription>
        <DialogFooter className="flex flex-col gap-2">
          <AsyncButton
            type="button"
            variant="destructive"
            loadingContent="Deleting…"
            action={handleDelete}
          >
            Delete group
          </AsyncButton>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
