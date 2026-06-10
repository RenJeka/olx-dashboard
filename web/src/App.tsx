import { useState } from 'react';
import { Searches } from './pages/Searches';
import { ListingsTable } from './pages/ListingsTable';

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 px-4 py-3">
        <h1 className="text-xl font-bold">OLX Monitor</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Searches selectedId={selectedId} onSelect={setSelectedId} />
        <ListingsTable searchId={selectedId} />
      </div>
    </div>
  );
}
