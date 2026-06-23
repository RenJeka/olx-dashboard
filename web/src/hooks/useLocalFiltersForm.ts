import { useState, useEffect } from 'react';
import { parseLocalFilters } from '../utils/localFilters';
import type { LocalFiltersFormState } from '../utils/localFilters';

/**
 * Хук керування станом форми локальних фільтрів.
 * Інкапсулює всі локальні поля та методи їх зміни.
 */
export function useLocalFiltersForm(initialFiltersRaw: string) {
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [categories, setCategories] = useState<number[]>([]);

  const [priceInvert, setPriceInvert] = useState(false);
  const [citiesInvert, setCitiesInvert] = useState(false);
  const [sellersInvert, setSellersInvert] = useState(false);
  const [prosInvert, setProsInvert] = useState(false);
  const [consInvert, setConsInvert] = useState(false);
  const [categoriesInvert, setCategoriesInvert] = useState(false);

  useEffect(() => {
    const filters = parseLocalFilters(initialFiltersRaw);
    setPriceMin(filters.price_range?.min != null ? String(filters.price_range.min) : '');
    setPriceMax(filters.price_range?.max != null ? String(filters.price_range.max) : '');
    setCities(filters.cities ?? []);
    setSellers(filters.sellers ?? []);
    setPros(filters.pros ?? []);
    setCons(filters.cons ?? []);
    setCategories(filters.categories ?? []);

    const inv = filters.invert ?? {};
    setPriceInvert(inv.price_range ?? false);
    setCitiesInvert(inv.cities ?? false);
    setSellersInvert(inv.sellers ?? false);
    setProsInvert(inv.pros ?? false);
    setConsInvert(inv.cons ?? false);
    setCategoriesInvert(inv.categories ?? false);
  }, [initialFiltersRaw]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const addCity = (city: string) => {
    if (!city || cities.includes(city)) return;
    setCities((prev) => [...prev, city]);
  };
  const removeCity = (city: string) => setCities((prev) => prev.filter((c) => c !== city));

  const addSeller = (seller: string) => {
    if (!seller || sellers.includes(seller)) return;
    setSellers((prev) => [...prev, seller]);
  };
  const removeSeller = (seller: string) => setSellers((prev) => prev.filter((s) => s !== seller));

  const addPro = (criterion: string) => {
    if (!criterion || pros.includes(criterion)) return;
    setPros((prev) => [...prev, criterion]);
  };
  const removePro = (criterion: string) => setPros((prev) => prev.filter((p) => p !== criterion));

  const addCon = (criterion: string) => {
    if (!criterion || cons.includes(criterion)) return;
    setCons((prev) => [...prev, criterion]);
  };
  const removeCon = (criterion: string) => setCons((prev) => prev.filter((c) => c !== criterion));

  // Категорії: вибір/зняття набору листових id (вузол дерева = вся його гілка).
  const toggleCategories = (ids: number[], checked: boolean) => {
    setCategories((prev) => {
      const set = new Set(prev);
      if (checked) ids.forEach((id) => set.add(id));
      else ids.forEach((id) => set.delete(id));
      return [...set];
    });
  };

  const state: LocalFiltersFormState = {
    priceMin, priceMax, cities, sellers, pros, cons, categories,
    priceInvert, citiesInvert, sellersInvert, prosInvert, consInvert, categoriesInvert,
  };

  return {
    state,
    setPriceMin, setPriceMax, setPriceInvert,
    setCitiesInvert, addCity, removeCity,
    setSellersInvert, addSeller, removeSeller,
    setProsInvert, addPro, removePro,
    setConsInvert, addCon, removeCon,
    setCategoriesInvert, toggleCategories,
  };
}
