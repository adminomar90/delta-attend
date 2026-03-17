'use client';
import { useMemo, useRef, useState } from 'react';

function resolveValue(obj, accessor) {
  if (typeof accessor === 'function') return accessor(obj);
  if (typeof accessor === 'string') {
    return accessor.split('.').reduce((o, k) => o?.[k], obj);
  }
  return obj;
}

function compareValues(a, b) {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;

  const aStr = String(a);
  const bStr = String(b);
  if (/^\d{4}-\d{2}-\d{2}/.test(aStr) && /^\d{4}-\d{2}-\d{2}/.test(bStr)) {
    const aTime = new Date(aStr).getTime();
    const bTime = new Date(bStr).getTime();
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
  }

  return aStr.localeCompare(bStr, 'ar');
}

export function useSort(data, options = {}) {
  const { defaultKey = null, defaultDirection = 'asc' } = options;
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDirection, setSortDirection] = useState(defaultDirection);
  const accessorsRef = useRef({});

  const requestSort = (key, accessor) => {
    if (accessor !== undefined) accessorsRef.current[key] = accessor;
    setSortKey((prev) => {
      if (prev === key) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDirection('asc');
      return key;
    });
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !Array.isArray(data)) return data || [];
    const accessor = accessorsRef.current[sortKey] || sortKey;
    const mul = sortDirection === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => compareValues(resolveValue(a, accessor), resolveValue(b, accessor)) * mul);
  }, [data, sortKey, sortDirection]);

  return { sortedData, sortKey, sortDirection, requestSort };
}
