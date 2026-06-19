import { useArchiveSearch, useDeleteSearch, useReorderSearches } from '../api';
import { toaster } from '../components/ui/toaster';
import { showErrorToast } from '../utils/toast';
import type { Search } from '../types';

export interface SearchRowActions {
  isArchived: boolean;
  deleteSearch: ReturnType<typeof useDeleteSearch>;
  reorderSearch: ReturnType<typeof useReorderSearches>;
  handleArchiveToggle: () => void;
  handleDelete: (onSuccess: () => void) => void;
  handleMove: (direction: 'up' | 'down') => void;
}

/** Мутації та обробники дій рядка пошуку: архівування, видалення, пересортування. */
export function useSearchRowActions(search: Search): SearchRowActions {
  const archiveSearch = useArchiveSearch();
  const deleteSearch = useDeleteSearch();
  const reorderSearch = useReorderSearches();
  const isArchived = search.archived === 1;

  function handleArchiveToggle() {
    archiveSearch.mutate(
      { searchId: search.id, archived: !isArchived },
      {
        onSuccess: () =>
          toaster.create({
            type: 'success',
            title: isArchived ? 'Повернено з архіву' : 'Додано в архів',
            description: search.name,
          }),
        onError: (err) => showErrorToast('Помилка', err),
      },
    );
  }

  function handleDelete(onSuccess: () => void) {
    deleteSearch.mutate(search.id, {
      onSuccess: () => {
        onSuccess();
        toaster.create({ type: 'success', title: 'Пошук видалено', description: search.name });
      },
      onError: (err) => showErrorToast('Помилка видалення', err),
    });
  }

  function handleMove(direction: 'up' | 'down') {
    reorderSearch.mutate({ searchId: search.id, direction });
  }

  return { isArchived, deleteSearch, reorderSearch, handleArchiveToggle, handleDelete, handleMove };
}
