import { useState, type RefObject } from 'react';
import { Button, Stack, Text } from '@chakra-ui/react';
import { Checkbox } from '../../ui/checkbox';
import { NestedDialog } from './NestedDialog';

interface Props {
  portalRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  names: string[];
  /** Скільки оголошень містить ці формулювання (назви + синоніми). */
  affected: number;
  pending: boolean;
  onConfirm: (withListings: boolean) => void;
}

/** Підтвердження видалення критеріїв: зі списку пошуку і (за галочкою) з оголошень та локальних фільтрів. */
export function DeleteCriteriaDialog({ portalRef, onClose, names, affected, pending, onConfirm }: Props) {
  const [withListings, setWithListings] = useState(true);

  return (
    <NestedDialog
      portalRef={portalRef}
      role="alertdialog"
      title={`Видалити критерії (${names.length})?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Скасувати
          </Button>
          <Button size="sm" colorPalette="danger" loading={pending} onClick={() => onConfirm(withListings)}>
            Видалити
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        <Text textStyle="sm">{names.join(' · ')}</Text>
        <Checkbox
          checked={withListings}
          disabled={affected === 0}
          onCheckedChange={(d) => setWithListings(d.checked === true)}
        >
          Прибрати також з {affected} оголошень і локальних фільтрів
        </Checkbox>
        {!withListings && affected > 0 && (
          <Text textStyle="xs" color="fg.muted">
            В оголошеннях пункти лишаться — у вікні їх буде видно як «лише в оголошеннях».
          </Text>
        )}
      </Stack>
    </NestedDialog>
  );
}
