'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
export default function TicketContext({ onLoad }) {
  const [task, setTask] = useState(null), [error, setError] = useState('');
  const callback = useRef(onLoad); callback.current = onLoad;
  useEffect(() => { const key = new URLSearchParams(window.location.search).get('ticket'); if (key) api.get(`/tasks/${key}`).then((r) => { setTask(r.task); callback.current?.(r.task); }).catch((e) => setError(e.message)); }, []);
  if (error) return <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>;
  return task ? <p className="card section">مرتبط بالتذكرة: <a href={`/tasks?ticket=${task._id}`}>{task.ticketNumber || 'مهمة سابقة'} — {task.title}</a></p> : null;
}
