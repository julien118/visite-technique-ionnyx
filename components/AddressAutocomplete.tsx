'use client';

import { useEffect, useRef, useState } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

interface AddressSuggestion {
  label: string;
  context: string;
}

export default function AddressAutocomplete({ value, onChange }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer les suggestions au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(text: string) {
    onChange(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(text.trim())}&limit=5`
        );
        if (!res.ok) return;
        const data = await res.json();
        const results: AddressSuggestion[] = (data.features || []).map(
          (f: { properties: { label: string; context: string } }) => ({
            label: f.properties.label,
            context: f.properties.context,
          })
        );
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        // Silently fail — user can still type manually
      }
    }, 300);
  }

  function handleSelect(label: string) {
    onChange(label);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Adresse du chantier
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        placeholder="34 rue Baptiste Marcet, 37000 Tours"
        className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
        autoComplete="off"
      />
      {showSuggestions && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s.label)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <span className="block text-sm text-gray-900">{s.label}</span>
                <span className="block text-xs text-gray-500">{s.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
