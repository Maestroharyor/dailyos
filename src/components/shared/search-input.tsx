"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@heroui/react";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search...",
  debounceMs = 400,
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when external value changes (e.g., from URL state)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced callback
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onValueChange(localValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onValueChange, value]);

  const handleClear = useCallback(() => {
    setLocalValue("");
    onValueChange("");
  }, [onValueChange]);

  return (
    <Input
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      startContent={<Search size={18} className="text-gray-400" />}
      endContent={
        localValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        ) : null
      }
      className={className}
    />
  );
}

export default SearchInput;
