import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

// Cached account names so we only fetch once across all instances
let cachedAccountNames = null;
let cachePromise = null;

const fetchAllAccountNames = async () => {
    if (cachedAccountNames) return cachedAccountNames;
    if (cachePromise) return cachePromise;

    cachePromise = (async () => {
        const snap = await getDocs(collection(db, 'accounts'));
        const nameMap = new Map();
        snap.forEach(d => {
            const data = d.data();
            if (data.name && data.name.trim()) {
                const trimmed = data.name.trim();
                const lower = trimmed.toLowerCase();
                if (!nameMap.has(lower)) {
                    nameMap.set(lower, trimmed);
                }
            }
        });
        const uniqueNames = Array.from(nameMap.values());
        uniqueNames.sort((a, b) => a.localeCompare(b));
        cachedAccountNames = uniqueNames;
        cachePromise = null;
        return uniqueNames;
    })();

    return cachePromise;
};

// Call this to invalidate cache when new accounts are imported
export const invalidateAccountNamesCache = () => {
    cachedAccountNames = null;
    cachePromise = null;
};

export default function AccountSearchDropdown({ value, onChange, placeholder = "Search account...", className = "" }) {
    const [allNames, setAllNames] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        fetchAllAccountNames().then(names => setAllNames(names));
    }, []);

    // Sync external value changes
    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = useMemo(() => {
        if (!inputValue) return allNames;
        const lower = inputValue.toLowerCase();
        return allNames.filter(name => name.toLowerCase().includes(lower));
    }, [allNames, inputValue]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputValue(val);
        setIsOpen(true);
        onChange(val);
    };

    const handleSelect = (name) => {
        setInputValue(name);
        onChange(name);
        setIsOpen(false);
    };

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleClear = () => {
        setInputValue('');
        onChange('');
        setIsOpen(false);
        inputRef.current?.focus();
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder={placeholder}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm pr-8"
                />
                {inputValue && (
                    <button
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-bold"
                        title="Clear"
                    >
                        ×
                    </button>
                )}
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400">No accounts found</div>
                    ) : (
                        filtered.map((name, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelect(name)}
                                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition ${
                                    name === inputValue ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                                }`}
                            >
                                {name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
