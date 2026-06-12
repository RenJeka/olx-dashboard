import { Button, HStack, Menu, Portal, Text } from '@chakra-ui/react';
import { LuChevronDown, LuX, LuCircleDot, LuHeart, LuMessageCircle, LuThumbsDown, LuEyeOff } from 'react-icons/lu';
import { useUpdateListing } from '../../../api/client';
import { toaster } from '../../ui/toaster';
import { LISTING_STATUSES, type ListingStatus } from '../../../types';
import { STATUS_LABELS, STATUS_COLORS } from '../../../utils/status';

interface Props {
  searchId: number;
  selectedIds: number[];
  onClear: () => void;
}

/** Панель масових дій над вибраними рядками таблиці (Етап 2, B6). */
export function BulkActionBar({ searchId, selectedIds, onClear }: Props) {
  const updateListing = useUpdateListing();

  async function applyStatus(status: ListingStatus) {
    const ids = selectedIds;
    onClear();
    const results = await Promise.allSettled(
      ids.map((id) => updateListing.mutateAsync({ id, searchId, patch: { status } })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    toaster.create({
      type: failed > 0 ? 'error' : 'success',
      title:
        failed > 0
          ? `Статус «${STATUS_LABELS[status]}»: ${ids.length - failed} з ${ids.length} (${failed} помилок)`
          : `Статус «${STATUS_LABELS[status]}» застосовано до ${ids.length} оголошень`,
    });
  }

  return (
    <HStack
      gap={5}
      colorPalette="blue"
      ml={10}
      bg="colorPalette.subtle"
      rounded="md"
      px={3}
      border="1px solid"
      borderColor="colorPalette.muted"
    >
      <Text textStyle="sm" fontWeight="medium">
        Вибрано: {selectedIds.length}
      </Text>
      <Menu.Root positioning={{ placement: 'bottom-start' }}>
        <Menu.Trigger asChild>
          <Button size="sm" variant="outline">
            Змінити статус на… <LuChevronDown />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {LISTING_STATUSES.map((status) => {
                const Icon = {
                  new: LuCircleDot,
                  interested: LuHeart,
                  contacted: LuMessageCircle,
                  rejected: LuThumbsDown,
                  disabled: LuEyeOff,
                }[status];
                return (
                  <Menu.Item key={status} value={status} onSelect={() => void applyStatus(status)}>
                    <HStack gap={2}>
                      <Icon size={14} color={`var(--chakra-colors-${STATUS_COLORS[status]}-fg)`} />
                      {STATUS_LABELS[status]}
                    </HStack>
                  </Menu.Item>
                );
              })}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <LuX /> Скасувати
      </Button>
    </HStack>
  );
}
