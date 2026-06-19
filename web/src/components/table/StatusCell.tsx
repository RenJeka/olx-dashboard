import { NativeSelect } from '@chakra-ui/react';
import { useUpdateListing } from '../../api';
import { LISTING_STATUSES, type Listing, type ListingStatus } from '../../types';
import { STATUS_COLORS, STATUS_LABELS } from '../../utils/status';

interface Props {
  listing: Listing;
}

/** Компактний select-бейдж статусу. Зміна → PATCH (status_source='manual', miss_count=0). */
export function StatusCell({ listing }: Props) {
  const updateListing = useUpdateListing();
  const status = listing.status as ListingStatus;
  const colorPalette = STATUS_COLORS[status] ?? 'gray';

  return (
    <NativeSelect.Root size="xs" colorPalette={colorPalette} width="auto">
      <NativeSelect.Field
        value={status}
        fontWeight="medium"
        rounded="full"
        bg="colorPalette.subtle"
        color="colorPalette.fg"
        borderWidth={0}
        cursor="pointer"
        onChange={(e) => {
          const next = e.target.value as ListingStatus;
          if (next === status) return;
          updateListing.mutate({
            id: listing.id,
            searchId: listing.search_id,
            patch: { status: next },
          });
        }}
      >
        {LISTING_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
