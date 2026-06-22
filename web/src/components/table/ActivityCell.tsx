import { NativeSelect } from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';
import { useUpdateListing } from '../../api';
import type { Listing } from '../../types';
import { formatRelativeTime } from '../../utils/format';

interface Props {
  listing: Listing;
}

/**
 * Опції «Активності» (olx_status). Порожній рядок ↔ null («невідоме»).
 * Палітра збігається з бейджами таблиці (active=success, inactive=gray, removed=danger).
 */
const OPTIONS: { value: string; label: string; palette: string }[] = [
  { value: '', label: 'невідоме', palette: 'gray' },
  { value: 'active', label: 'активне', palette: 'success' },
  { value: 'inactive', label: 'неактивне', palette: 'gray' },
  { value: 'removed', label: 'знято', palette: 'danger' },
];

/**
 * Select-бейдж «Активності» (olx_status). Ручна зміна — разова підказка БЕЗ захисту:
 * наступний GraphQL-скан/verify, що побачить оголошення, перепише реальним значенням від
 * OLX (docs/plans/honest-olx-status.md). Тултіп показує свіжість (last_seen_at).
 */
export function ActivityCell({ listing }: Props) {
  const updateListing = useUpdateListing();
  const value = listing.olx_status ?? '';
  const known = OPTIONS.find((o) => o.value === value);
  const palette = known?.palette ?? 'gray';
  const seenText = listing.last_seen_at ? formatRelativeTime(listing.last_seen_at) : '—';

  return (
    <Tooltip content={`Востаннє бачили: ${seenText}`}>
      <NativeSelect.Root size="xs" colorPalette={palette} width="auto">
        <NativeSelect.Field
          value={value}
          fontWeight="medium"
          rounded="full"
          bg="colorPalette.subtle"
          color="colorPalette.fg"
          borderWidth={0}
          cursor="pointer"
          onChange={(e) => {
            const next = e.target.value;
            if (next === value) return;
            updateListing.mutate({
              id: listing.id,
              searchId: listing.search_id,
              patch: { olx_status: next === '' ? null : next },
            });
          }}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {/* Сире значення від OLX поза набором — показуємо as-is, щоб select не «з'їв» його. */}
          {!known && value !== '' && <option value={value}>{value}</option>}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Tooltip>
  );
}
