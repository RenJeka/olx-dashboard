import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateSearch } from '../api';

export interface NewSearchFormState {
  name: string;
  setName: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  priceFrom: string;
  setPriceFrom: (v: string) => void;
  priceTo: string;
  setPriceTo: (v: string) => void;
  synonyms: string[];
  setSynonyms: (v: string[]) => void;
  variantsOpen: boolean;
  setVariantsOpen: (v: boolean) => void;
  submit: (e: FormEvent) => void;
  createSearch: ReturnType<typeof useCreateSearch>;
}

/** Стан і сабміт форми створення нового пошуку (акордеон-секція «Новий пошук»). */
export function useNewSearchForm(): NewSearchFormState {
  const createSearch = useCreateSearch();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [variantsOpen, setVariantsOpen] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !query.trim()) return;
    createSearch.mutate(
      {
        name: name.trim(),
        query: query.trim(),
        priceFrom: priceFrom ? Number(priceFrom) : undefined,
        priceTo: priceTo ? Number(priceTo) : undefined,
        querySynonyms: synonyms,
      },
      {
        onSuccess: () => {
          setName('');
          setQuery('');
          setPriceFrom('');
          setPriceTo('');
          setSynonyms([]);
        },
      },
    );
  }

  return {
    name,
    setName,
    query,
    setQuery,
    priceFrom,
    setPriceFrom,
    priceTo,
    setPriceTo,
    synonyms,
    setSynonyms,
    variantsOpen,
    setVariantsOpen,
    submit,
    createSearch,
  };
}
