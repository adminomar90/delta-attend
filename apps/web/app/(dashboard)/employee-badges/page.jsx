'use client';

import { useState } from 'react';
import BadgeEditor from './BadgeEditor';
import IssuedBadges from './IssuedBadges';
import './studio.css';

export default function EmployeeBadgesPage() {
  const [view, setView] = useState('new');
  const [editing, setEditing] = useState(null);
  const [draftNumber, setDraftNumber] = useState(0);

  return (
    <>
      <nav className="card badge-navigation" aria-label="هويات الموظفين">
        <button className="btn btn-soft" type="button" aria-pressed={view === 'new'} onClick={() => {
          setEditing(null);
          setView('new');
          setDraftNumber((number) => number + 1);
        }}>
          هوية جديدة
        </button>
        <button className="btn btn-soft" type="button" aria-pressed={view === 'history'} onClick={() => {
          setEditing(null);
          setView('history');
        }}>
          الهويات الصادرة
        </button>
        {view === 'edit' && <span>تعديل هوية {editing.employee.fullName}</span>}
      </nav>
      {view === 'history'
        ? <IssuedBadges onEdit={(badge) => { setEditing(badge); setView('edit'); }} />
        : <BadgeEditor key={view === 'edit' ? editing.id : `new-${draftNumber}`} initialBadge={view === 'edit' ? editing : null} />}
    </>
  );
}
