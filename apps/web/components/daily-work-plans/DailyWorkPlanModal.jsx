'use client';

import { useEffect, useState } from 'react';
import {
  createPlanFormDefaults,
  dailyWorkPlanPriorityOptions,
  dailyWorkPlanTaskTypeOptions,
} from '../../lib/dailyWorkPlans';
import { api } from '../../lib/api';
import ContactActionBar from '../ContactActionBar';
import CustomerSearchModal from '../customers/CustomerSearchModal';
import DailyWorkPlanAssigneePicker from './DailyWorkPlanAssigneePicker';

export default function DailyWorkPlanModal({
  open,
  initialForm,
  users,
  projects,
  saving,
  title,
  subtitle,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(createPlanFormDefaults());
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [linkExistingCustomer, setLinkExistingCustomer] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectStages, setProjectStages] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [whatsappMessage, setWhatsappMessage] = useState('السلام عليكم، معكم شركة دلتا بلس بخصوص طلبكم.');

  useEffect(() => {
    if (open) {
      const defaults = createPlanFormDefaults(initialForm);
      setForm(defaults);
      setLinkExistingCustomer(!!defaults.customer);
    }
  }, [open, initialForm]);

  useEffect(() => {
    if (!open || !form.project) {
      setProjectStages([]);
      setProjectTasks([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get(`/projects/${form.project}/stages`).catch(() => ({ stages: [] })),
      api.get(`/projects/${form.project}/tasks`).catch(() => ({ tasks: [] })),
    ]).then(([stagesResponse, tasksResponse]) => {
      if (cancelled) return;
      setProjectStages(stagesResponse.stages || []);
      setProjectTasks(tasksResponse.tasks || []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, form.project]);

  const selectProject = (projectId) => {
    const project = (projects || []).find((item) => String(item._id || item.id || '') === String(projectId || ''));
    setForm((prev) => ({
      ...prev,
      project: projectId || '',
      stage: '',
      task: '',
      customerName: project?.name || prev.customerName,
      location: project?.location || prev.location,
    }));
    setProjectPickerOpen(false);
  };

  const filteredProjectTasks = projectTasks.filter((task) => (
    !form.stage || String(task.stage?._id || task.stage || '') === String(form.stage)
  ));

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel daily-plan-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{title || 'بلان العمل اليومي'}</h3>
            {subtitle ? <p className="daily-plan-modal-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form
          className="daily-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
          }}
        >
          <div className="daily-plan-form-section">
            <div className="daily-plan-form-grid">
              <label>
                عنوان البلان
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </label>

              <label>
                اسم المشروع أو الزبون
                <input
                  className="input"
                  value={form.customerName}
                  onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
                />
              </label>

              <div className="grid-span-full customer-link-panel">
                <div className="action-row">
                  <button type="button" className="btn btn-soft" onClick={() => setProjectPickerOpen((value) => !value)}>
                    اختيار مشروع
                  </button>
                  {form.project ? <span className="status-pill status-approved">مرتبط بمشروع</span> : null}
                </div>
                {projectPickerOpen ? (
                  <label>
                    المشروع من قسم المشاريع
                    <select className="select" value={form.project} onChange={(e) => selectProject(e.target.value)}>
                      <option value="">اختر المشروع</option>
                      {(projects || []).map((project) => (
                        <option key={project._id || project.id} value={project._id || project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="grid-span-full customer-link-panel">
                <label className="customer-check-inline">
                  <input
                    type="checkbox"
                    checked={linkExistingCustomer}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setLinkExistingCustomer(checked);
                      if (!checked) {
                        setForm((prev) => ({
                          ...prev,
                          customer: '',
                          customerSiteId: '',
                          customerPhone: '',
                          customerWhatsapp: '',
                          customerMapUrl: '',
                          customerSiteName: '',
                          siteManagerName: '',
                          siteManagerPhone: '',
                        }));
                      }
                    }}
                  />
                  ربط البلان بزبون موجود
                </label>
                {linkExistingCustomer ? (
                  <>
                    <div className="action-row">
                      <button type="button" className="btn btn-soft" onClick={() => setCustomerSearchOpen(true)}>بحث في الزبائن</button>
                      {form.customer ? <span className="status-pill status-approved">مرتبط: {form.customerName || 'زبون محدد'}</span> : null}
                    </div>
                    {form.customer ? (
                      <div className="daily-plan-mini-grid">
                        <div><span>هاتف الزبون</span><strong>{form.customerPhone || '-'}</strong></div>
                        <div><span>واتساب</span><strong>{form.customerWhatsapp || '-'}</strong></div>
                        <div><span>الموقع / الفرع</span><strong>{form.customerSiteName || '-'}</strong></div>
                        <div><span>مسؤول الموقع</span><strong>{[form.siteManagerName, form.siteManagerPhone].filter(Boolean).join(' - ') || '-'}</strong></div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              <label>
                المشروع المرتبط
                <select
                  className="select"
                  value={form.project}
                  onChange={(e) => selectProject(e.target.value)}
                >
                  <option value="">بدون ربط</option>
                  {(projects || []).map((project) => (
                    <option key={project._id || project.id} value={project._id || project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              {form.project ? (
                <>
                  <label>
                    مرحلة المشروع
                    <select
                      className="select"
                      value={form.stage}
                      onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value, task: '' }))}
                    >
                      <option value="">بدون مرحلة</option>
                      {projectStages.map((stage) => (
                        <option key={stage._id} value={stage._id}>{stage.order ? `${stage.order} - ` : ''}{stage.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    مهمة المشروع
                    <select
                      className="select"
                      value={form.task}
                      onChange={(e) => setForm((prev) => ({ ...prev, task: e.target.value }))}
                    >
                      <option value="">بدون مهمة</option>
                      {filteredProjectTasks.map((task) => (
                        <option key={task._id} value={task._id}>{task.title}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              <label>
                المشرف المسؤول
                <select
                  className="select"
                  value={form.supervisor}
                  onChange={(e) => setForm((prev) => ({ ...prev, supervisor: e.target.value }))}
                >
                  <option value="">اختيار تلقائي</option>
                  {(users || []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                قائد الفريق
                <select
                  className="select"
                  value={form.teamLeader}
                  onChange={(e) => setForm((prev) => ({ ...prev, teamLeader: e.target.value }))}
                >
                  <option value="">اختيار قائد الفريق</option>
                  {(users || []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-soft)', display: 'block', marginTop: 4 }}>
                  قائد الفريق هو المسؤول عن تحديث نسبة الإنجاز وإرسال البلان للاعتماد.
                </small>
              </label>

              <label>
                تاريخ التنفيذ
                <input
                  className="input"
                  type="date"
                  value={form.planDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, planDate: e.target.value }))}
                  required
                />
              </label>

              <label>
                وقت البداية
                <input
                  className="input"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                />
              </label>

              <label>
                وقت النهاية المتوقع
                <input
                  className="input"
                  type="time"
                  value={form.expectedEndTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, expectedEndTime: e.target.value }))}
                />
              </label>

              <label>
                الأولوية
                <select
                  className="select"
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  {dailyWorkPlanPriorityOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                نوع المهمة
                <select
                  className="select"
                  value={form.taskType}
                  onChange={(e) => setForm((prev) => ({ ...prev, taskType: e.target.value }))}
                >
                  {dailyWorkPlanTaskTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                الموقع
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                />
              </label>

              {form.customer ? (
                <div className="grid-span-full customer-contact-box">
                  <label>رسالة واتساب للزبون<input className="input" value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} /></label>
                  <ContactActionBar
                    phone={form.customerPhone}
                    whatsapp={form.customerWhatsapp || form.customerPhone}
                    mapUrl={form.customerMapUrl}
                    address={form.location}
                    whatsappMessage={whatsappMessage}
                  />
                </div>
              ) : null}

              <div className="grid-span-full">
                <DailyWorkPlanAssigneePicker
                  users={users}
                  selectedIds={form.assigneeIds}
                  onChange={(assigneeIds) => setForm((prev) => ({ ...prev, assigneeIds }))}
                />
                {!form.assigneeIds?.length ? (
                  <small style={{ color: 'var(--danger)', display: 'block', marginTop: 8 }}>
                    يجب اختيار موظف واحد على الأقل.
                  </small>
                ) : null}
              </div>

              <label className="grid-span-full">
                وصف العمل بالتفصيل
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>

              <label className="grid-span-full">
                ملاحظات الإدارة
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.adminNotes}
                  onChange={(e) => setForm((prev) => ({ ...prev, adminNotes: e.target.value }))}
                />
              </label>

              <label className="grid-span-full">
                مرفقات أو صور
                <input
                  className="input"
                  type="file"
                  multiple
                  onChange={(e) => setForm((prev) => ({ ...prev, attachments: Array.from(e.target.files || []) }))}
                />
              </label>
            </div>
          </div>

          <div className="maintenance-modal-actions">
            <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.assigneeIds?.length}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ البلان'}
            </button>
          </div>
        </form>
        </div>
      </div>
      <CustomerSearchModal
        open={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={(snapshot) => {
          setForm((prev) => ({
            ...prev,
            ...snapshot,
            customerName: snapshot.customerName || prev.customerName,
            location: snapshot.location || prev.location,
          }));
          setCustomerSearchOpen(false);
        }}
      />
    </>
  );
}
