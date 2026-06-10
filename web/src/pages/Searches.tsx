import { useState } from 'react';
import { useSearches, useCreateSearch, useScan } from '../api/client';

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function Searches({ selectedId, onSelect }: Props) {
  const { data: searches, isLoading } = useSearches();
  const createSearch = useCreateSearch();
  const scan = useScan();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !query.trim()) return;
    createSearch.mutate(
      {
        name: name.trim(),
        query: query.trim(),
        priceFrom: priceFrom ? Number(priceFrom) : undefined,
        priceTo: priceTo ? Number(priceTo) : undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setQuery('');
          setPriceFrom('');
          setPriceTo('');
        },
      },
    );
  }

  function runScan(id: number) {
    setScanMsg(null);
    scan.mutate(id, {
      onSuccess: (r) =>
        setScanMsg(`Знайдено ${r.found}, нових ${r.new_count}`),
      onError: (err) =>
        setScanMsg(`Помилка: ${err instanceof Error ? err.message : err}`),
    });
  }

  return (
    <aside className="w-80 shrink-0 border-r border-gray-200 p-4 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-3">Пошуки</h2>
        {isLoading && <p className="text-sm text-gray-500">Завантаження…</p>}
        <ul className="space-y-1">
          {searches?.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={`w-full text-left rounded px-3 py-2 text-sm ${
                  selectedId === s.id
                    ? 'bg-blue-100 text-blue-900'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-gray-500">{s.query}</div>
              </button>
              <button
                onClick={() => runScan(s.id)}
                disabled={scan.isPending}
                className="mt-1 ml-3 text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {scan.isPending ? 'Сканування…' : 'Scan'}
              </button>
            </li>
          ))}
        </ul>
        {scanMsg && <p className="mt-2 text-xs text-gray-600">{scanMsg}</p>}
      </div>

      <form onSubmit={submit} className="space-y-2">
        <h3 className="text-sm font-semibold">Новий пошук</h3>
        <input
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Назва (напр. iPhone 13 Київ)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Запит (напр. iphone 13)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Ціна від"
            inputMode="numeric"
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
          />
          <input
            className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Ціна до"
            inputMode="numeric"
            value={priceTo}
            onChange={(e) => setPriceTo(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={createSearch.isPending}
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Створити
        </button>
        {createSearch.isError && (
          <p className="text-xs text-red-600">
            {createSearch.error instanceof Error
              ? createSearch.error.message
              : 'Помилка створення'}
          </p>
        )}
      </form>
    </aside>
  );
}
