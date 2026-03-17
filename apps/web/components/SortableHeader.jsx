'use client';

export default function SortableHeader({ label, sortKey, accessor, activeSortKey, sortDirection, onSort, disabled = false }) {
  if (disabled) return <th>{label}</th>;
  const isActive = activeSortKey === sortKey;
  const indicator = isActive ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className={`th-sortable${isActive ? ' th-sort-active' : ''}`} onClick={() => onSort(sortKey, accessor)}>
      {label}{indicator}
    </th>
  );
}
