'use client';

import { useMemo, useState } from 'react';
import UserAvatar from '../UserAvatar';

const toSearchableText = (user = {}) =>
  [
    user.fullName,
    user.jobTitle,
    user.department,
    user.role,
    user.email,
    user.phone,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export default function DailyWorkPlanAssigneePicker({
  users = [],
  selectedIds = [],
  onChange,
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set((selectedIds || []).map(String)), [selectedIds]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const pool = Array.isArray(users) ? users : [];

    const sorted = [...pool].sort((left, right) => {
      const leftSelected = selectedSet.has(String(left.id));
      const rightSelected = selectedSet.has(String(right.id));
      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }
      return String(left.fullName || '').localeCompare(String(right.fullName || ''), 'ar');
    });

    if (!normalizedQuery) {
      return sorted;
    }

    return sorted.filter((user) => toSearchableText(user).includes(normalizedQuery));
  }, [users, query, selectedSet]);

  const selectedUsers = useMemo(
    () => (users || []).filter((user) => selectedSet.has(String(user.id))),
    [users, selectedSet],
  );

  const updateSelection = (nextIds) => {
    const deduped = [...new Set((nextIds || []).map(String))];
    onChange(deduped);
  };

  const toggleUser = (userId) => {
    const normalizedId = String(userId);
    if (selectedSet.has(normalizedId)) {
      updateSelection(selectedIds.filter((id) => String(id) !== normalizedId));
      return;
    }
    updateSelection([...(selectedIds || []), normalizedId]);
  };

  const addFilteredUsers = () => {
    updateSelection([
      ...(selectedIds || []),
      ...filteredUsers.map((user) => String(user.id)),
    ]);
  };

  const clearAll = () => updateSelection([]);

  return (
    <div className="daily-plan-picker">
      <div className="daily-plan-picker-toolbar">
        <div>
          <strong>الموظفون المكلفون</strong>
          <div className="daily-plan-picker-hint">
            يمكنك اختيار أكثر من موظف لنفس البلان مع عرض واضح للمختارين.
          </div>
        </div>
        <div className="daily-plan-picker-actions">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={addFilteredUsers}
            disabled={!filteredUsers.length}
          >
            تحديد الظاهر
          </button>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={clearAll}
            disabled={!selectedIds.length}
          >
            إفراغ
          </button>
        </div>
      </div>

      <label className="daily-plan-picker-search">
        <span>بحث عن موظف</span>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="الاسم، المنصب، القسم..."
        />
      </label>

      <div className="daily-plan-selected-panel">
        <div className="daily-plan-selected-head">
          <strong>المختارون الآن</strong>
          <span>{selectedUsers.length} موظف</span>
        </div>
        {selectedUsers.length ? (
          <div className="daily-plan-selected-list">
            {selectedUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className="daily-plan-selected-chip"
                onClick={() => toggleUser(user.id)}
              >
                <UserAvatar
                  fullName={user.fullName || 'موظف'}
                  avatarUrl={user.avatarUrl || ''}
                  imgClassName="daily-plan-selected-avatar"
                  fallbackClassName="daily-plan-selected-avatar daily-plan-selected-avatar-fallback"
                />
                <span>{user.fullName}</span>
                <small>{user.jobTitle || user.role || '-'}</small>
                <strong>×</strong>
              </button>
            ))}
          </div>
        ) : (
          <p className="maintenance-empty">لم يتم اختيار أي موظف بعد.</p>
        )}
      </div>

      <div className="daily-plan-user-grid">
        {filteredUsers.length ? filteredUsers.map((user) => {
          const isSelected = selectedSet.has(String(user.id));
          return (
            <button
              key={user.id}
              type="button"
              className={`daily-plan-user-card ${isSelected ? 'daily-plan-user-card-active' : ''}`}
              onClick={() => toggleUser(user.id)}
              aria-pressed={isSelected}
            >
              <div className="daily-plan-user-card-main">
                <UserAvatar
                  fullName={user.fullName || 'موظف'}
                  avatarUrl={user.avatarUrl || ''}
                  imgClassName="daily-plan-user-avatar"
                  fallbackClassName="daily-plan-user-avatar daily-plan-user-avatar-fallback"
                />
                <div className="daily-plan-user-meta">
                  <strong>{user.fullName || 'موظف'}</strong>
                  <span>{user.jobTitle || user.role || '-'}</span>
                  <small>{user.department || user.team || '-'}</small>
                </div>
              </div>
              <span className={`daily-plan-user-toggle ${isSelected ? 'daily-plan-user-toggle-active' : ''}`}>
                {isSelected ? 'تم اختياره' : 'اختيار'}
              </span>
            </button>
          );
        }) : (
          <p className="maintenance-empty">لا يوجد موظفون مطابقون للبحث الحالي.</p>
        )}
      </div>
    </div>
  );
}
