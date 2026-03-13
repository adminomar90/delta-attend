'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import {
  Permission,
  hasAnyPermission,
  hasPermission,
  permissionLabelMap,
} from '../../../lib/permissions';

const roleOptions = [
  { value: 'GENERAL_MANAGER', label: 'مدير عام' },
  { value: 'HR_MANAGER', label: 'مدير موارد بشرية' },
  { value: 'FINANCIAL_MANAGER', label: 'مدير مالي' },
  { value: 'PROJECT_MANAGER', label: 'مدير مشروع' },
  { value: 'ASSISTANT_PROJECT_MANAGER', label: 'مساعد مدير مشروع' },
  { value: 'TEAM_LEAD', label: 'قائد فريق' },
  { value: 'TECHNICAL_STAFF', label: 'موظف تقني' },
];

const roleLabelMap = roleOptions.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const roleColorMap = {
  GENERAL_MANAGER: '#c4d743',
  HR_MANAGER: '#4d91ff',
  FINANCIAL_MANAGER: '#65eca2',
  PROJECT_MANAGER: '#ffb74d',
  ASSISTANT_PROJECT_MANAGER: '#b288ff',
  TEAM_LEAD: '#ff8a80',
  TECHNICAL_STAFF: '#7b93c2',
};

const defaultCreateForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'TECHNICAL_STAFF',
  employeeCode: '',
  jobTitle: '',
  department: '',
  managerId: '',
  hireDate: '',
  employmentType: 'FULL_TIME',
  phone: '',
  personalEmail: '',
  avatarUrl: '',
  team: 'Delta Plus',
};

const defaultEditForm = {
  id: '',
  fullName: '',
  email: '',
  role: '',
  employeeCode: '',
  jobTitle: '',
  department: '',
  managerId: '',
  phone: '',
  personalEmail: '',
  team: '',
  twoFactorEnabled: false,
  forcePasswordChange: false,
};

export default function EmployeesPage() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updatingPermissions, setUpdatingPermissions] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [importFile, setImportFile] = useState(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [documentCategoryTarget, setDocumentCategoryTarget] = useState(null);
  const [documentCategoryFile, setDocumentCategoryFile] = useState(null);
  const [documentCategory, setDocumentCategory] = useState('OTHER');
  const [importResult, setImportResult] = useState(null);
  const [permissionTarget, setPermissionTarget] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const currentUser = authStorage.getUser();

  const canViewUsers = useMemo(() => {
    return hasAnyPermission(currentUser, [
      Permission.MANAGE_USERS,
      Permission.MANAGE_TASKS,
      Permission.VIEW_EMPLOYEES_HIERARCHY,
    ]);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canManageUsers = useMemo(() => {
    return hasPermission(currentUser, Permission.MANAGE_USERS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canManageStatus = useMemo(() => {
    return hasPermission(currentUser, Permission.MANAGE_USER_STATUS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canResetPasswords = useMemo(() => {
    return hasPermission(currentUser, Permission.RESET_USER_PASSWORDS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canManagePermissions = useMemo(() => {
    return hasPermission(currentUser, Permission.MANAGE_PERMISSIONS);
  }, [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const managers = useMemo(() => {
    const managerRoles = ['GENERAL_MANAGER', 'HR_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER', 'TEAM_LEAD'];
    return users.filter((item) => managerRoles.includes(item.role) && item.active);
  }, [users]);

  const load = async () => {
    setError('');

    try {
      const [usersResponse, permissionsResponse] = await Promise.all([
        api.get('/auth/users'),
        api.get('/auth/permissions').catch(() => ({ permissions: [] })),
      ]);
      setUsers(usersResponse.users || []);
      setPermissions(permissionsResponse.permissions || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل الموظفين');
    }
  };

  useEffect(() => {
    if (!canViewUsers) {
      setUsers([]);
      return;
    }

    load();
  }, [canViewUsers]);

  const submitCreate = async (event) => {
    event.preventDefault();
    if (!canManageUsers) {
      setError('ليس لديك صلاحية إضافة الموظفين');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post('/auth/users', {
        ...createForm,
        managerId: createForm.managerId || undefined,
        employeeCode: createForm.employeeCode || undefined,
      });
      setCreateForm(defaultCreateForm);
      await load();
    } catch (err) {
      setError(err.message || 'فشل إضافة الموظف');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (user) => {
    setEditForm({
      id: user._id || user.id,
      fullName: user.fullName || '',
      email: user.email || '',
      role: user.role || 'TECHNICAL_STAFF',
      employeeCode: user.employeeCode || '',
      jobTitle: user.jobTitle || '',
      department: user.department || '',
      managerId: user.manager?.id || user.manager?._id || '',
      phone: user.phone || '',
      personalEmail: user.personalEmail || '',
      team: user.team || 'Delta Plus',
      twoFactorEnabled: !!user.twoFactorEnabled,
      forcePasswordChange: !!user.forcePasswordChange,
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editForm.id) return;

    setSaving(true);
    setError('');

    try {
      await api.patch(`/auth/users/${editForm.id}`, {
        ...editForm,
        managerId: editForm.managerId || null,
        employeeCode: editForm.employeeCode || null,
      });
      setEditForm(defaultEditForm);
      await load();
    } catch (err) {
      setError(err.message || 'فشل تحديث الموظف');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user) => {
    setError('');
    try {
      await api.patch(`/auth/users/${user._id || user.id}/status`, {
        active: !user.active,
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل تحديث حالة الموظف');
    }
  };

  const resetPassword = async (user) => {
    if (!resetPasswordTarget) {
      setResetPasswordTarget(user);
      setResetPasswordValue('');
      return;
    }

    setError('');
    try {
      await api.patch(`/auth/users/${user._id || user.id}/reset-password`, {
        newPassword: resetPasswordValue || undefined,
      });
      setResetPasswordTarget(null);
      setResetPasswordValue('');
      setError('');
      setImportResult('تم إعادة تعيين كلمة المرور بنجاح — تم إرسال كلمة المرور الجديدة عبر البريد الإلكتروني.');
    } catch (err) {
      setError(err.message || 'فشل إعادة تعيين كلمة المرور');
    }
  };

  const openPermissionEditor = (user) => {
    setPermissionTarget(user);
    setSelectedPermissions(Array.isArray(user.customPermissions) ? user.customPermissions : []);
  };

  const closePermissionEditor = () => {
    setPermissionTarget(null);
    setSelectedPermissions([]);
  };

  const togglePermissionSelection = (permission) => {
    setSelectedPermissions((prev) => {
      if (prev.includes(permission)) {
        return prev.filter((item) => item !== permission);
      }
      return [...prev, permission];
    });
  };

  const savePermissions = async () => {
    if (!permissionTarget) return;

    setUpdatingPermissions(true);
    setError('');

    try {
      const targetId = permissionTarget._id || permissionTarget.id;
      await api.patch(`/auth/users/${targetId}/permissions`, { customPermissions: selectedPermissions });

      if (String(targetId) === String(currentUser?.id)) {
        authStorage.setUser({
          ...currentUser,
          customPermissions: selectedPermissions,
        });
      }

      closePermissionEditor();
      await load();
    } catch (err) {
      setError(err.message || 'فشل تحديث الصلاحيات');
    } finally {
      setUpdatingPermissions(false);
    }
  };

  const uploadAvatar = async (user, file) => {
    if (!file) return;

    const payload = new FormData();
    payload.append('file', file);

    setError('');
    try {
      await api.post(`/auth/users/${user._id || user.id}/avatar`, payload);
      await load();
    } catch (err) {
      setError(err.message || 'فشل رفع الصورة');
    }
  };

  const uploadDocument = async (user, file) => {
    if (!file) return;

    if (!documentCategoryTarget) {
      setDocumentCategoryTarget(user);
      setDocumentCategoryFile(file);
      setDocumentCategory('OTHER');
      return;
    }

    const payload = new FormData();
    payload.append('file', documentCategoryFile || file);
    payload.append('category', documentCategory);

    setError('');
    try {
      await api.post(`/auth/users/${user._id || user.id}/files`, payload);
      setDocumentCategoryTarget(null);
      setDocumentCategoryFile(null);
      setImportResult('تم رفع المستند بنجاح');
    } catch (err) {
      setError(err.message || 'فشل رفع المستند');
    }
  };

  const importUsers = async () => {
    if (!importFile) {
      setError('اختر ملف Excel أولاً');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const payload = new FormData();
      payload.append('file', importFile);
      const response = await api.post('/auth/users/import', payload);

      setImportResult(`تمت العملية — تم الإنشاء: ${response.report.created} | تم التجاوز: ${response.report.skipped} | فشل: ${response.report.failed}`);
      setImportFile(null);
      await load();
    } catch (err) {
      setError(err.message || 'فشل استيراد الموظفين');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {!canViewUsers ? (
        <section className="card section" style={{ color: 'var(--text-soft)' }}>
          لا تملك صلاحية عرض صفحة الموظفين.
        </section>
      ) : null}

      {canManageUsers ? (
        <>
          <section className="card section" style={{ marginBottom: 16 }}>
            <h2>إضافة موظف جديد (HR)</h2>
            <form className="grid-3" onSubmit={submitCreate}>
              <label>
                الاسم الكامل
                <input className="input" value={createForm.fullName} onChange={(e) => setCreateForm((prev) => ({ ...prev, fullName: e.target.value }))} required />
              </label>
              <label>
                البريد الوظيفي
                <input className="input" type="email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </label>
              <label>
                كلمة المرور
                <input className="input" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </label>
              <label>
                الدور
                <select className="select" value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}>
                  {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </label>
              <label>
                رمز الموظف
                <input className="input" value={createForm.employeeCode} onChange={(e) => setCreateForm((prev) => ({ ...prev, employeeCode: e.target.value }))} />
              </label>
              <label>
                المدير المباشر
                <select className="select" value={createForm.managerId} onChange={(e) => setCreateForm((prev) => ({ ...prev, managerId: e.target.value }))}>
                  <option value="">بدون مدير مباشر</option>
                  {managers.map((manager) => (
                    <option key={manager._id || manager.id} value={manager._id || manager.id}>
                      {manager.fullName} - {roleLabelMap[manager.role] || manager.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                القسم
                <input className="input" value={createForm.department} onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))} />
              </label>
              <label>
                المسمى الوظيفي
                <input className="input" value={createForm.jobTitle} onChange={(e) => setCreateForm((prev) => ({ ...prev, jobTitle: e.target.value }))} />
              </label>
              <label>
                الهاتف
                <input className="input" value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
              </label>
              <label>
                الفريق
                <input className="input" value={createForm.team} onChange={(e) => setCreateForm((prev) => ({ ...prev, team: e.target.value }))} />
              </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'جارٍ الإضافة...' : 'إضافة الموظف'}
              </button>
            </div>
          </form>
          </section>

          <section className="card section" style={{ marginBottom: 16 }}>
            <h2>استيراد الموظفين من Excel</h2>
            <p style={{ color: 'var(--text-soft)' }}>
              الأعمدة المطلوبة: <code>fullName,email,role,password</code>
            </p>
            <div className="action-row">
              <input className="input file-input-compact" type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
              <button className="btn btn-soft" onClick={importUsers} disabled={importing} type="button">
                {importing ? 'جارٍ الاستيراد...' : 'استيراد'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {permissionTarget && canManagePermissions ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>تحديث صلاحيات العرض: {permissionTarget.fullName}</h2>
          <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
            هذه الصلاحيات إضافية فوق صلاحيات الدور الحالي.
          </p>
          <div className="grid-3" style={{ gap: 10 }}>
            {(permissions || []).map((permission) => (
              <label
                key={permission}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(permission)}
                  onChange={() => togglePermissionSelection(permission)}
                />
                <span>{permissionLabelMap[permission] || permission}</span>
              </label>
            ))}
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="button" onClick={savePermissions} disabled={updatingPermissions}>
              {updatingPermissions ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
            </button>
            <button className="btn btn-soft" type="button" onClick={closePermissionEditor} disabled={updatingPermissions}>
              إلغاء
            </button>
          </div>
        </section>
      ) : null}

      {editForm.id ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>تعديل بيانات الموظف</h2>
          <form className="grid-3" onSubmit={submitEdit}>
            <label>
              الاسم الكامل
              <input className="input" value={editForm.fullName} onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))} />
            </label>
            <label>
              البريد
              <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
            </label>
            <label>
              الدور
              <select className="select" value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}>
                {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <label>
              القسم
              <input className="input" value={editForm.department} onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))} />
            </label>
            <label>
              المسمى الوظيفي
              <input className="input" value={editForm.jobTitle} onChange={(e) => setEditForm((prev) => ({ ...prev, jobTitle: e.target.value }))} />
            </label>
            <label>
              الهاتف
              <input className="input" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </label>
            <label>
              الصلاحيات الإضافية
              <input
                className="input"
                value={(permissions || []).map((item) => permissionLabelMap[item] || item).join('، ')}
                disabled
              />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={editForm.twoFactorEnabled} onChange={(e) => setEditForm((prev) => ({ ...prev, twoFactorEnabled: e.target.checked }))} />
              تفعيل 2FA
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={editForm.forcePasswordChange} onChange={(e) => setEditForm((prev) => ({ ...prev, forcePasswordChange: e.target.checked }))} />
              إجبار تغيير كلمة المرور
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
              <button className="btn btn-soft" type="button" onClick={() => setEditForm(defaultEditForm)}>إلغاء</button>
            </div>
          </form>
        </section>
      ) : null}

      {canViewUsers ? (
        <section className="card section">
          <h2>قائمة الموظفين</h2>
          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الدور</th>
                <th>القسم</th>
                <th>المدير</th>
                <th>صلاحيات العرض</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.length ? users.map((user) => {
                const uid = user._id || user.id;
                const color = roleColorMap[user.role] || '#7b93c2';
                const initials = (user.fullName || '?')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase();

                return (
                <tr key={uid}>
                  <td>
                    <div className="emp-identity">
                      <div className="emp-avatar-wrap" style={{ '--emp-accent': color }}>
                        {user.avatarUrl ? (
                          <img className="emp-avatar-img" src={assetUrl(user.avatarUrl)} alt={user.fullName} />
                        ) : (
                          <span className="emp-avatar-fallback" style={{ background: `${color}22`, color }}>{initials}</span>
                        )}
                        {canManageUsers ? (
                          <label className="emp-avatar-upload-overlay" title="تغيير الصورة">
                            📷
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAvatar(user, e.target.files?.[0])} />
                          </label>
                        ) : null}
                      </div>
                      <div className="emp-info">
                        <strong>{user.fullName}</strong>
                        <span className="emp-email">{user.email}</span>
                        {user.employeeCode ? <span className="emp-code">{user.employeeCode}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="emp-role-tag" style={{ borderColor: `${color}66`, color, background: `${color}14` }}>
                      {roleLabelMap[user.role] || user.role}
                    </span>
                  </td>
                  <td>{user.department || '-'}</td>
                  <td>{user.manager?.fullName || '-'}</td>
                  <td>
                    {(user.customPermissions || []).length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(user.customPermissions || []).map((item) => (
                          <span key={item} className="badge">
                            {permissionLabelMap[item] || item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-soft)' }}>افتراضية حسب الدور</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${user.active ? 'status-approved' : 'status-rejected'}`}>
                      {user.active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td>
                    {canManageUsers || canManageStatus || canResetPasswords || canManagePermissions ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {canManageUsers ? (
                          <button className="btn btn-soft" onClick={() => beginEdit(user)} type="button">تعديل</button>
                        ) : null}
                        {canManageStatus ? (
                          <button className="btn btn-soft" onClick={() => toggleStatus(user)} type="button">{user.active ? 'تعطيل' : 'تفعيل'}</button>
                        ) : null}
                        {canResetPasswords ? (
                          <button className="btn btn-soft" onClick={() => resetPassword(user)} type="button">إعادة كلمة المرور</button>
                        ) : null}
                        {canManagePermissions ? (
                          <button className="btn btn-soft" onClick={() => openPermissionEditor(user)} type="button">صلاحيات العرض</button>
                        ) : null}
                        {canManageUsers ? (
                          <label className="btn btn-soft" style={{ cursor: 'pointer' }}>
                            رفع مستند
                            <input type="file" style={{ display: 'none' }} onChange={(e) => uploadDocument(user, e.target.files?.[0])} />
                          </label>
                        ) : null}
                      </div>
                    ) : '-'}
                  </td>
                </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--text-soft)' }}>لا يوجد موظفون حالياً.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {importResult ? (
        <section className="card section" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#9bc8ff' }}>{importResult}</span>
            <button type="button" className="btn btn-soft" onClick={() => setImportResult(null)}>إغلاق</button>
          </div>
        </section>
      ) : null}

      {resetPasswordTarget ? (
        <div className="modal-backdrop" onClick={() => setResetPasswordTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>إعادة تعيين كلمة المرور</h3>
              <button type="button" className="modal-close" onClick={() => setResetPasswordTarget(null)}>&times;</button>
            </div>
            <p style={{ color: 'var(--text-soft)', margin: '0 0 12px' }}>
              الموظف: {resetPasswordTarget.fullName}
            </p>
            <label>
              كلمة المرور الجديدة (أو اتركه فارغًا لتوليد كلمة مرور مؤقتة)
              <input
                className="input"
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="كلمة مرور جديدة (اختياري)"
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-soft" onClick={() => setResetPasswordTarget(null)}>إلغاء</button>
              <button type="button" className="btn btn-primary" onClick={() => resetPassword(resetPasswordTarget)}>تأكيد إعادة التعيين</button>
            </div>
          </div>
        </div>
      ) : null}

      {documentCategoryTarget ? (
        <div className="modal-backdrop" onClick={() => { setDocumentCategoryTarget(null); setDocumentCategoryFile(null); }}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>فئة المستند</h3>
              <button type="button" className="modal-close" onClick={() => { setDocumentCategoryTarget(null); setDocumentCategoryFile(null); }}>&times;</button>
            </div>
            <p style={{ color: 'var(--text-soft)', margin: '0 0 12px' }}>
              الموظف: {documentCategoryTarget.fullName}
            </p>
            <label>
              اختر فئة المستند
              <select className="select" value={documentCategory} onChange={(e) => setDocumentCategory(e.target.value)}>
                <option value="CONTRACT">عقد عمل</option>
                <option value="NATIONAL_ID">هوية وطنية</option>
                <option value="CERTIFICATE">شهادة</option>
                <option value="OTHER">أخرى</option>
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-soft" onClick={() => { setDocumentCategoryTarget(null); setDocumentCategoryFile(null); }}>إلغاء</button>
              <button type="button" className="btn btn-primary" onClick={() => uploadDocument(documentCategoryTarget, documentCategoryFile)}>رفع المستند</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
