'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';

/* ─── constants ─── */
const statusLabel = {
  /* new workflow */
  PENDING_MANAGER_APPROVAL: 'بانتظار اعتماد مدير المشاريع',
  PENDING_SUPPLIER_APPROVAL: 'بانتظار اعتماد المجهز',
  IN_PROGRESS: 'قيد التجهيز',
  PENDING_RECEIPT: 'بانتظار استلام الموظف',
  RECEIVED: 'تم الاستلام',
  PENDING_SETTLEMENT: 'بانتظار اعتماد التصفية',
  /* legacy + shared */
  NEW: 'جديد', UNDER_REVIEW: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض',
  PREPARING: 'جاري التجهيز', PREPARED: 'تم التجهيز', DELIVERED: 'تم التسليم',
  PENDING_RECONCILIATION: 'بانتظار التصفية', RECONCILED: 'تمت التصفية',
  PARTIALLY_RECONCILED: 'تصفية جزئية', FULLY_RECONCILED: 'تصفية كاملة', PARTIAL: 'جزئي',
  SUBMITTED: 'مرسل', OPEN: 'مفتوح', CLOSED: 'مغلق', ARCHIVED: 'مؤرشف',
};
const statusColor = {
  PENDING_MANAGER_APPROVAL: '#ffa726', PENDING_SUPPLIER_APPROVAL: '#42a5f5',
  IN_PROGRESS: '#ffb74d', PENDING_RECEIPT: '#ab47bc', RECEIVED: '#66bb6a',
  PENDING_SETTLEMENT: '#ffd54f',
  NEW: '#4fc3f7', APPROVED: '#81c784', REJECTED: '#e57373', PREPARING: '#ffb74d',
  PREPARED: '#aed581', DELIVERED: '#64b5f6', PENDING_RECONCILIATION: '#ffd54f',
  RECONCILED: '#81c784', PARTIALLY_RECONCILED: '#ffb74d', FULLY_RECONCILED: '#81c784', PARTIAL: '#ffb74d',
  SUBMITTED: '#4fc3f7', OPEN: '#4fc3f7', CLOSED: '#90a4ae', ARCHIVED: '#78909c',
};
const unitLabels = { PIECE: 'قطعة', METER: 'متر', KG: 'كجم', TON: 'طن', LITER: 'لتر', SQM: 'م²', BAG: 'كيس', ROLL: 'لفة', SET: 'طقم', PAIR: 'زوج', BOX: 'صندوق' };

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const makeItem = () => ({ id: uid(), materialName: '', unit: 'METER', requestedQty: '', notes: '' });

const flattenOrgChart = (roots = []) => {
  const q = Array.isArray(roots) ? [...roots] : [], list = [];
  while (q.length) {
    const n = q.shift(); if (!n) continue;
    list.push({ id: n.id, _id: n.id, fullName: n.fullName || '-', employeeCode: n.employeeCode || '', active: true });
    if (Array.isArray(n.children)) q.push(...n.children);
  }
  return list;
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
};

/* ─── Badge component ─── */
const lightBgs = new Set(['PENDING_SETTLEMENT', 'PENDING_RECONCILIATION', 'IN_PROGRESS', 'PREPARING', 'PENDING_MANAGER_APPROVAL']);
const Badge = ({ status }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', padding: '3px 12px', borderRadius: 12, fontSize: 12, lineHeight: '18px', fontWeight: 600, background: statusColor[status] || '#555', color: lightBgs.has(status) ? '#333' : '#fff' }}>
    {statusLabel[status] || status}
  </span>
);

/* ─── Modal component ─── */
const Modal = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ─── Main Component ─── */
export default function MaterialsPage() {
  const currentUser = authStorage.getUser();

  /* state */
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [allUsers, setAllUsers] = useState([]); /* all employees — used for preparer dropdown */
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [openCustodiesData, setOpenCustodiesData] = useState({ holders: [], totalHolders: 0 });
  const [activeTab, setActiveTab] = useState('requests');

  /* request filters */
  const [reqFilterStatus, setReqFilterStatus] = useState('');
  const [reqFilterSearch, setReqFilterSearch] = useState('');

  /* archive filter */
  const [archiveSearch, setArchiveSearch] = useState('');

  /* open custodies filter */
  const [custodyHolderSearch, setCustodyHolderSearch] = useState('');

  /* modals */
  const [reviewModal, setReviewModal] = useState(null);
  const [prepareModal, setPrepareModal] = useState(null);
  const [dispatchModal, setDispatchModal] = useState(null);
  const [reconcileModal, setReconcileModal] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [custodyDetailModal, setCustodyDetailModal] = useState(null);
  const [editRequestModal, setEditRequestModal] = useState(null);

  /* request form */
  const [requestForm, setRequestForm] = useState({
    projectId: '', manualProjectName: '', priority: 'NORMAL', clientName: '', requestedForId: '',
    assignedPreparerId: '', warehouseId: '', generalNotes: '', items: [makeItem()],
  });

  /* project combobox state */
  const [projectSearch, setProjectSearch] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectComboRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('projectId') || '';
    const requestedTab = params.get('tab');
    if (projectId) setRequestForm((prev) => ({ ...prev, projectId, manualProjectName: '' }));
    if (requestedTab === 'custodies') setActiveTab('custodies');
    else if (params.get('action') === 'request') setActiveTab('requests');
  }, []);

  useEffect(() => {
    if (!requestForm.projectId || projectSearch) return;
    const linkedProject = projects.find((project) => project._id === requestForm.projectId);
    if (linkedProject) setProjectSearch(linkedProject.name || linkedProject.code || '');
  }, [projects, requestForm.projectId, projectSearch]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.trim().toLowerCase();
    return projects.filter((p) => p.name?.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse?.active !== false),
    [warehouses],
  );

  useEffect(() => {
    if (!activeWarehouses.length) return;
    setRequestForm((prev) => {
      if (prev.warehouseId && activeWarehouses.some((warehouse) => warehouse._id === prev.warehouseId)) return prev;
      return { ...prev, warehouseId: activeWarehouses[0]._id };
    });
  }, [activeWarehouses]);

  const filteredRequests = useMemo(() => {
    let list = requests;
    if (reqFilterStatus) list = list.filter((r) => r.status === reqFilterStatus);
    if (reqFilterSearch.trim()) {
      const q = reqFilterSearch.trim().toLowerCase();
      list = list.filter((r) =>
        (r.requestNo || '').toLowerCase().includes(q) ||
        (r.project?.name || r.manualProjectName || '').toLowerCase().includes(q) ||
        (r.requestedFor?.fullName || '').toLowerCase().includes(q) ||
        (r.requestedBy?.fullName || '').toLowerCase().includes(q) ||
        (r.assignedPreparer?.fullName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, reqFilterStatus, reqFilterSearch]);

  const filteredArchive = useMemo(() => {
    if (!archiveSearch.trim()) return archivedRequests;
    const q = archiveSearch.trim().toLowerCase();
    return archivedRequests.filter((r) =>
      (r.requestNo || '').toLowerCase().includes(q) ||
      (r.project?.name || r.manualProjectName || '').toLowerCase().includes(q) ||
      (r.requestedFor?.fullName || '').toLowerCase().includes(q) ||
      (r.requestedBy?.fullName || '').toLowerCase().includes(q) ||
      (r.assignedPreparer?.fullName || '').toLowerCase().includes(q) ||
      (r.items || []).some((it) => (it.materialName || '').toLowerCase().includes(q))
    );
  }, [archivedRequests, archiveSearch]);

  const filteredCustodyHolders = useMemo(() => {
    if (!custodyHolderSearch.trim()) return openCustodiesData.holders;
    const q = custodyHolderSearch.trim().toLowerCase();
    return openCustodiesData.holders.filter((h) =>
      (h.holderName || '').toLowerCase().includes(q) ||
      (h.employeeCode || '').toLowerCase().includes(q) ||
      (h.projects || []).some((p) => p.toLowerCase().includes(q)) ||
      (h.custodies || []).some((c) =>
        (c.requestNo || '').toLowerCase().includes(q) ||
        (c.custodyNo || '').toLowerCase().includes(q) ||
        (c.preparerName || '').toLowerCase().includes(q) ||
        (c.requestedByName || '').toLowerCase().includes(q) ||
        (c.items || []).some((it) => (it.materialName || '').toLowerCase().includes(q))
      )
    );
  }, [openCustodiesData.holders, custodyHolderSearch]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (projectComboRef.current && !projectComboRef.current.contains(e.target)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* permissions */
  const canAccess = useMemo(() => hasAnyPermission(currentUser, [
    Permission.CREATE_MATERIAL_REQUESTS, Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS, Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY, Permission.CLOSE_MATERIAL_CUSTODY,
    Permission.VIEW_MATERIAL_REPORTS, Permission.MANAGE_MATERIAL_INVENTORY,
    Permission.MANAGE_MATERIAL_CATALOG,
  ]), [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canReview = hasPermission(currentUser, Permission.REVIEW_MATERIAL_REQUESTS);
  const canPrepare = hasPermission(currentUser, Permission.PREPARE_MATERIAL_REQUESTS);
  const canDispatch = hasPermission(currentUser, Permission.DISPATCH_MATERIAL_REQUESTS);
  const canReconcile = hasAnyPermission(currentUser, [Permission.RECONCILE_MATERIAL_CUSTODY, Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY]);
  const canClose = hasPermission(currentUser, Permission.CLOSE_MATERIAL_CUSTODY);
  const canReports = hasPermission(currentUser, Permission.VIEW_MATERIAL_REPORTS);

  /* check if current user is the assigned preparer for a request (or GM fallback) */
  const myId = currentUser?.id || currentUser?._id || '';
  const isGM = currentUser?.role === 'GENERAL_MANAGER';
  const isMyPreparer = (req) => {
    const pid = req.assignedPreparer?._id || req.assignedPreparer?.id || req.assignedPreparer;
    if (!pid) return isGM; /* no preparer assigned → only GM */
    return pid === myId || isGM;
  };

  const isMyRequest = (req) => {
    const rid = String(req.requestedBy?._id || req.requestedBy || '');
    const fid = String(req.requestedFor?._id || req.requestedFor || '');
    return rid === String(myId) || fid === String(myId) || isGM;
  };

  const canEditBeforePreparerApproval = (req) => {
    if (!req) return false;
    const editableStatuses = ['PENDING_MANAGER_APPROVAL', 'PENDING_SUPPLIER_APPROVAL', 'NEW', 'UNDER_REVIEW', 'APPROVED'];
    const hasPreparation = (req.preparations || []).length > 0
      || (req.items || []).some((item) => toNum(item.preparedQty) > 0 || toNum(item.deliveredQty) > 0);
    return editableStatuses.includes(req.status) && !hasPreparation && (isMyRequest(req) || canReview || currentUser?.role === 'GENERAL_MANAGER');
  };

  /* data loader */
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [mRes, wRes, pRes, uRes, allURes, rqRes, cuRes, rcRes, smRes, arRes, ocRes] = await Promise.all([
        api.get('/materials/catalog'),
        api.get('/materials/warehouses?active=true'),
        api.get('/projects').catch(() => ({ projects: [] })),
        api.get('/auth/users').catch(async () => {
          const chart = await api.get('/auth/org-chart').catch(() => ({ roots: [] }));
          return { users: flattenOrgChart(chart.roots || []) };
        }),
        api.get('/materials/employees').catch(async () => {
          const fromAuth = await api.get('/auth/users?allUsers=1').catch(async () => {
            const chart = await api.get('/auth/org-chart').catch(() => ({ roots: [] }));
            return { users: flattenOrgChart(chart.roots || []) };
          });
          return fromAuth;
        }),
        api.get('/materials/requests'),
        api.get('/materials/custodies'),
        api.get('/materials/reconciliations'),
        canReports ? api.get('/materials/reports/summary').catch(() => null) : Promise.resolve(null),
        api.get('/materials/requests?archived=true').catch(() => ({ requests: [] })),
        api.get('/materials/open-custodies-summary').catch(() => ({ holders: [], totalHolders: 0 })),
      ]);
      setMaterials(mRes.materials || []);
      setWarehouses(wRes.warehouses || []);
      setProjects(pRes.projects || []);
      setUsers((uRes.users || []).filter((u) => u?.active));
      setAllUsers((allURes.users || []).filter((u) => u?.active));
      setRequests(rqRes.requests || []);
      setCustodies(cuRes.custodies || []);
      setReconciliations(rcRes.reconciliations || []);
      setSummary(smRes);
      setArchivedRequests(arRes.requests || []);
      setOpenCustodiesData(ocRes || { holders: [], totalHolders: 0 });
    } catch (err) { setError(err.message || 'تعذر تحميل البيانات'); }
    finally { setLoading(false); }
  }, [canReports]);

  useEffect(() => { if (canAccess) load(); }, [canAccess, load]);

  /* helpers */
  const openWhatsapp = (lines) => {
    const url = `https://wa.me/?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sendRequestWhatsapp = (req) => {
    openWhatsapp([
      '[ طلب مواد - Delta Plus ]',
      '----------------------------------',
      `رقم الطلب: ${req.requestNo}`,
      `المشروع: ${req.project?.name || req.manualProjectName || req.projectName || '-'}`,
      `الطالب: ${req.requestedFor?.fullName || req.requestedBy?.fullName || '-'}`,
      `المجهز: ${req.assignedPreparer?.fullName || 'غير معين'}`,
      `عدد البنود: ${(req.items || []).length}`,
      '----------------------------------',
      'يرجى متابعة الطلب.',
      '[ صادر من نظام Delta Plus ]',
    ]);
  };

  const sendCustodyWhatsapp = (cu) => {
    openWhatsapp([
      '[ ذمة مواد - Delta Plus ]',
      '----------------------------------',
      `رقم الذمة: ${cu.custodyNo}`,
      `المستلم: ${cu.holder?.fullName || '-'}`,
      `المشروع: ${cu.project?.name || cu.manualProjectName || '-'}`,
      `عدد البنود: ${(cu.items || []).length}`,
      '----------------------------------',
      'يرجى متابعة الذمة.',
      '[ صادر من نظام Delta Plus ]',
    ]);
  };

  const sendReconciliationWhatsapp = (rc) => {
    openWhatsapp([
      '[ تصفية مواد - Delta Plus ]',
      '----------------------------------',
      `رقم التصفية: ${rc.reconcileNo}`,
      `الذمة: ${rc.custody?.custodyNo || '-'}`,
      '----------------------------------',
      'يرجى متابعة التصفية.',
      '[ صادر من نظام Delta Plus ]',
    ]);
  };

  const sendReportsWhatsapp = () => {
    const totals = summary?.totals || {};
    openWhatsapp([
      '[ تقارير المواد - Delta Plus ]',
      '----------------------------------',
      `إجمالي الطلبات: ${totals.totalRequests || 0}`,
      `إجمالي الذمم: ${totals.totalCustodies || 0}`,
      `إجمالي التصفيات: ${totals.totalReconciliations || 0}`,
      '----------------------------------',
      '[ صادر من نظام Delta Plus ]',
    ]);
  };

  const doAction = async (fn) => {
    setError(''); setInfo('');
    try { await fn(); await load(); } catch (err) { setError(err.message || 'فشلت العملية'); }
    finally { setBusy(''); }
  };

  /* ────── supplier approve / reject ────── */
  const handleSupplierApprove = async (req, action) => {
    setBusy('supplierApprove');
    await doAction(async () => {
      await api.patch(`/materials/requests/${req._id}/supplier-approve`, { action });
      setInfo(action === 'ACCEPT' ? 'تم قبول الطلب من المجهز' : 'تم رفض الطلب من المجهز');
    });
  };

  /* ────── confirm receipt ────── */
  const handleConfirmReceipt = async (req) => {
    setBusy('confirmReceipt');
    await doAction(async () => {
      await api.patch(`/materials/requests/${req._id}/confirm-receipt`, {});
      setInfo('تم تأكيد الاستلام بنجاح');
    });
  };

  /* ────── download per-request PDF ────── */
  const downloadRequestPdf = async (req) => {
    try {
      const res = await api.get(`/materials/requests/${req._id}/pdf`);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `طلب-مواد-${req.requestNo || req._id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'فشل تحميل ملف PDF');
    }
  };

  /* ────── archive request ────── */
  const handleArchive = async (req) => {
    if (!confirm(`هل تريد أرشفة الطلب ${req.requestNo}؟ سيختفي من القائمة الرئيسية.`)) return;
    setBusy('archive');
    await doAction(async () => {
      await api.patch(`/materials/requests/${req._id}/archive`, {});
      setInfo(`تم أرشفة الطلب ${req.requestNo} بنجاح`);
    });
  };

  const updateRequestItem = (itemId, changes) => {
    setRequestForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === itemId ? { ...it, ...changes } : it)),
    }));
  };

  const getMaterialOption = (mat) => `${mat.code} - ${mat.name} (${unitLabels[mat.unit] || mat.unit})`;

  /* ────────── CREATE REQUEST ────────── */
  const createRequest = async (e) => {
    e.preventDefault(); setBusy('create'); setError(''); setInfo('');
    try {
      const items = requestForm.items
        .filter((it) => it.materialName?.trim() && toNum(it.requestedQty) > 0)
        .map((it) => ({ materialName: it.materialName.trim(), unit: it.unit || 'PIECE', requestedQty: toNum(it.requestedQty), notes: it.notes }));
      if (!items.length) throw new Error('يرجى إضافة مادة واحدة على الأقل مع كمية أكبر من صفر.');
      await api.post('/materials/requests', { ...requestForm, items });
      setRequestForm({ projectId: '', manualProjectName: '', priority: 'NORMAL', clientName: '', requestedForId: '', assignedPreparerId: '', warehouseId: activeWarehouses[0]?._id || '', generalNotes: '', items: [makeItem()] });
      setProjectSearch('');
      setInfo('تم إنشاء الطلب بنجاح'); await load();
    } catch (err) { setError(err.message || 'فشل إنشاء الطلب'); }
    finally { setBusy(''); }
  };

  const openEditRequest = (req) => {
    setEditRequestModal({
      request: req,
      projectId: req.project?._id || req.project || '',
      manualProjectName: req.manualProjectName || req.projectName || '',
      priority: req.priority || 'NORMAL',
      clientName: req.clientName || '',
      requestedForId: req.requestedFor?._id || req.requestedFor || '',
      assignedPreparerId: req.assignedPreparer?._id || req.assignedPreparer || '',
      generalNotes: req.generalNotes || '',
      editReason: 'تعديل الطلب قبل اعتماد المجهز',
      items: (req.items || []).map((it) => ({
        id: uid(),
        materialName: it.materialName || it.material?.name || '',
        unit: it.unitSnapshot || it.material?.unit || 'PIECE',
        requestedQty: it.requestedQty || '',
        notes: it.lineNotes || '',
      })),
    });
  };

  const updateEditRequestItem = (itemId, changes) => {
    setEditRequestModal((prev) => prev ? ({
      ...prev,
      items: prev.items.map((it) => (it.id === itemId ? { ...it, ...changes } : it)),
    }) : prev);
  };

  const submitEditRequest = async (e) => {
    e.preventDefault();
    if (!editRequestModal?.request?._id) return;
    setBusy('editRequest'); setError(''); setInfo('');
    try {
      const items = editRequestModal.items
        .filter((it) => it.materialName?.trim() && toNum(it.requestedQty) > 0)
        .map((it) => ({
          materialName: it.materialName.trim(),
          unit: it.unit || 'PIECE',
          requestedQty: toNum(it.requestedQty),
          notes: it.notes,
        }));
      if (!items.length) throw new Error('يرجى إضافة مادة واحدة على الأقل مع كمية أكبر من صفر.');
      await api.patch(`/materials/requests/${editRequestModal.request._id}`, {
        projectId: editRequestModal.projectId,
        manualProjectName: editRequestModal.projectId ? '' : editRequestModal.manualProjectName,
        priority: editRequestModal.priority,
        clientName: editRequestModal.clientName,
        requestedForId: editRequestModal.requestedForId,
        assignedPreparerId: editRequestModal.assignedPreparerId,
        generalNotes: editRequestModal.generalNotes,
        editReason: editRequestModal.editReason,
        items,
      });
      setInfo('تم تعديل الطلب وإعادته لمرحلة اعتماد مدير المشاريع');
      setEditRequestModal(null);
      await load();
    } catch (err) {
      setError(err.message || 'فشل تعديل الطلب');
    } finally {
      setBusy('');
    }
  };

  /* ────────── REVIEW ────────── */
  const openReview = (req) => setReviewModal({
    request: req,
    action: 'APPROVE_FULL',
    rejectReason: '',
    items: (req.items || []).map((it) => ({
      materialId: it.material?._id || it.material,
      materialName: it.materialName || it.material?.name || '',
      requestedQty: toNum(it.requestedQty),
      approvedQty: toNum(it.approvedQty) > 0 ? toNum(it.approvedQty) : toNum(it.requestedQty),
      unit: it.unitSnapshot || it.material?.unit || 'PIECE',
      lineNotes: it.lineNotes || '',
    })),
  });
  const updateReviewItem = (materialId, changes) => {
    setReviewModal((prev) => prev ? ({
      ...prev,
      items: prev.items.map((item) => (String(item.materialId) === String(materialId) ? { ...item, ...changes } : item)),
    }) : prev);
  };
  const submitReview = async () => {
    if (!reviewModal) return;
    setBusy('review');
    await doAction(async () => {
      const body = { action: reviewModal.action };
      if (reviewModal.action === 'REJECT') {
        body.rejectReason = reviewModal.rejectReason;
        body.comment = reviewModal.rejectReason;
      }
      if (reviewModal.action === 'APPROVE_PARTIAL') {
        body.items = reviewModal.items.map((item) => ({
          materialId: item.materialId,
          approvedQty: Math.max(0, Math.min(toNum(item.requestedQty), toNum(item.approvedQty))),
          lineNotes: item.lineNotes,
        }));
      }
      await api.patch(`/materials/requests/${reviewModal.request._id}/review`, body);
      setInfo(reviewModal.action === 'REJECT' ? 'تم رفض الطلب' : 'تم اعتماد الطلب');
      setReviewModal(null);
    });
  };

  /* ────────── PREPARE ────────── */
  const openPrepare = (req) => {
    const items = (req.items || [])
      .filter((x) => toNum(x.approvedQty) > toNum(x.preparedQty))
      .map((x) => ({ materialId: x.material?._id || x.material, materialName: x.materialName, preparedQty: toNum(x.approvedQty) - toNum(x.preparedQty) }));
    setPrepareModal({ request: req, items, warehouseId: req.warehouse?._id || '' });
  };
  const submitPrepare = async () => {
    if (!prepareModal) return;
    setBusy('prepare');
    await doAction(async () => {
      await api.patch(`/materials/requests/${prepareModal.request._id}/prepare`, {
        warehouseId: prepareModal.warehouseId || undefined,
        items: prepareModal.items.filter((x) => toNum(x.preparedQty) > 0),
      });
      setInfo('تم تجهيز الطلب'); setPrepareModal(null);
    });
  };

  /* ────────── DISPATCH ────────── */
  const openDispatch = (req) => {
    const items = (req.items || [])
      .filter((x) => toNum(x.preparedQty) > toNum(x.deliveredQty))
      .map((x) => ({ materialId: x.material?._id || x.material, materialName: x.materialName, deliveredQty: toNum(x.preparedQty) - toNum(x.deliveredQty) }));
    setDispatchModal({ request: req, items, warehouseId: req.warehouse?._id || '', recipientId: req.requestedFor?._id || req.requestedBy?._id || '' });
  };
  const submitDispatch = async () => {
    if (!dispatchModal) return;
    setBusy('dispatch');
    await doAction(async () => {
      await api.patch(`/materials/requests/${dispatchModal.request._id}/dispatch`, {
        warehouseId: dispatchModal.warehouseId || undefined,
        items: dispatchModal.items.filter((x) => toNum(x.deliveredQty) > 0),
      });
      setInfo('تم تسليم المواد وتسجيلها كذمة'); setDispatchModal(null);
    });
  };

  /* ────────── RECONCILE ────────── */
  const openReconcile = (custody) => {
    const items = (custody.items || [])
      .filter((x) => x.lineStatus !== 'CLOSED')
      .map((x) => ({
        materialId: x.material?._id || x.material, materialName: x.materialName,
        receivedQty: toNum(x.receivedQty), consumedQty: 0, remainingQty: toNum(x.remainingQty),
        damagedQty: 0, lostQty: 0, toReturnQty: toNum(x.remainingQty),
      }));
    setReconcileModal({ custody, items });
  };
  const submitReconcile = async () => {
    if (!reconcileModal) return;
    setBusy('reconcile');
    await doAction(async () => {
      await api.post(`/materials/custodies/${reconcileModal.custody._id}/reconcile`, {
        items: reconcileModal.items.map((x) => ({
          materialId: x.materialId, consumedQty: toNum(x.consumedQty), remainingQty: toNum(x.remainingQty),
          damagedQty: toNum(x.damagedQty), lostQty: toNum(x.lostQty), toReturnQty: toNum(x.toReturnQty),
        })),
      });
      setInfo('تم إرسال التصفية للاعتماد'); setReconcileModal(null);
    });
  };

  /* ────────── RECEIVE RETURNS ────────── */
  const openReturn = (recon) => {
    const items = (recon.items || [])
      .filter((x) => toNum(x.toReturnQty) > toNum(x.returnedQtyConfirmed || 0))
      .map((x) => ({
        materialId: x.material?._id || x.material, materialName: x.materialName,
        returnedQty: toNum(x.toReturnQty) - toNum(x.returnedQtyConfirmed || 0), condition: 'NEW',
      }));
    setReturnModal({ recon, items, warehouseId: '' });
  };
  const submitReturn = async () => {
    if (!returnModal) return;
    setBusy('return');
    await doAction(async () => {
      await api.post(`/materials/reconciliations/${returnModal.recon._id}/returns`, {
        warehouseId: returnModal.warehouseId || undefined,
        items: returnModal.items.filter((x) => toNum(x.returnedQty) > 0),
      });
      setInfo('تم استلام المواد الراجعة وإرجاعها للمخزن'); setReturnModal(null);
    });
  };

  if (!canAccess) return <section className="card section">لا تملك صلاحية الوصول.</section>;

  /* ════════════════════════ RENDER ════════════════════════ */
  const tabStyle = (t) => ({ padding: '8px 20px', cursor: 'pointer', border: 'none', borderBottom: activeTab === t ? '3px solid var(--primary, #4fc3f7)' : '3px solid transparent', background: 'none', color: activeTab === t ? 'var(--primary, #4fc3f7)' : 'var(--text-soft)', fontWeight: 600, fontSize: 14 });

  return (
    <>
      {error && <div style={{ padding: '10px 16px', margin: '0 0 12px', borderRadius: 8, background: 'rgba(229,115,115,.15)', color: '#e57373', fontWeight: 500 }}>{error}</div>}
      {info && <div style={{ padding: '10px 16px', margin: '0 0 12px', borderRadius: 8, background: 'rgba(129,199,132,.15)', color: '#81c784', fontWeight: 500 }}>{info}</div>}

      {/* KPI */}
      <section className="grid-4" style={{ marginBottom: 16 }}>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الطلبات النشطة</p><h2>{requests.length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الذمم المفتوحة</p><h2>{openCustodiesData.totalHolders || custodies.filter((c) => c.status !== 'CLOSED').length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الأرشيف</p><h2>{archivedRequests.length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المواد بالكتلوج</p><h2>{materials.length}</h2></article>
      </section>

      {/* TABS */}
      <div className="tabs-bar">
        <button type="button" style={tabStyle('requests')} onClick={() => setActiveTab('requests')}>طلبات المواد</button>
        <button type="button" style={tabStyle('custodies')} onClick={() => setActiveTab('custodies')}>الذمم والتصفية</button>
        <button type="button" style={tabStyle('openCustodies')} onClick={() => setActiveTab('openCustodies')}>الذمم المفتوحة</button>
        <button type="button" style={tabStyle('archive')} onClick={() => setActiveTab('archive')}>الأرشيف</button>
        {canReports && <button type="button" style={tabStyle('reports')} onClick={() => setActiveTab('reports')}>التقارير</button>}
        <div className="tabs-spacer" />
        <button className="btn btn-soft" type="button" onClick={load} disabled={loading} style={{ alignSelf: 'center', fontSize: 12 }}>{loading ? 'جارٍ...' : 'تحديث ↻'}</button>
      </div>

      {/* ══════ TAB: REQUESTS ══════ */}
      {activeTab === 'requests' && (
        <>
          {/* new request form */}
          <section className="card section" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>طلب مواد جديد</h2>
            <form onSubmit={createRequest}>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <label>المشروع *
                  <div ref={projectComboRef} style={{ position: 'relative' }}>
                    <input
                      className="input"
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(e.target.value);
                        setProjectDropdownOpen(true);
                        setRequestForm((p) => ({ ...p, projectId: '', manualProjectName: e.target.value }));
                      }}
                      onFocus={() => setProjectDropdownOpen(true)}
                      placeholder="ابحث أو اكتب اسم المشروع"
                      required={!requestForm.projectId && !requestForm.manualProjectName}
                      autoComplete="off"
                    />
                    {projectDropdownOpen && filteredProjects.length > 0 && (
                      <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>
                        {filteredProjects.map((p) => (
                          <li
                            key={p._id}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                            onMouseDown={() => {
                              setRequestForm((prev) => ({ ...prev, projectId: p._id, manualProjectName: '' }));
                              setProjectSearch(p.name);
                              setProjectDropdownOpen(false);
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </label>
                <label>المخزن *
                  <select className="select" required value={requestForm.warehouseId} onChange={(e) => setRequestForm((p) => ({ ...p, warehouseId: e.target.value }))}>
                    <option value="" disabled>{activeWarehouses.length ? 'اختر المخزن' : 'لا توجد مخازن متاحة'}</option>
                    {activeWarehouses.map((w) => <option key={w._id} value={w._id}>{w.name}{w.code ? ` - ${w.code}` : ''}</option>)}
                  </select>
                </label>
                <label>مجهز الطلب<select className="select" value={requestForm.assignedPreparerId} onChange={(e) => setRequestForm((p) => ({ ...p, assignedPreparerId: e.target.value }))}><option value="">بدون تعيين</option>{allUsers.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}</select></label>
                <label>المستلم (طالب المواد)<select className="select" value={requestForm.requestedForId} onChange={(e) => setRequestForm((p) => ({ ...p, requestedForId: e.target.value }))}><option value="">نفس المستخدم</option>{users.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}</select></label>
                <label>العميل<input className="input" value={requestForm.clientName} onChange={(e) => setRequestForm((p) => ({ ...p, clientName: e.target.value }))} /></label>
                <label>الأولوية<select className="select" value={requestForm.priority} onChange={(e) => setRequestForm((p) => ({ ...p, priority: e.target.value }))}><option value="URGENT">عاجل</option><option value="NORMAL">طبيعي</option><option value="LOW">منخفض</option></select></label>
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>ملاحظات عامة<input className="input" value={requestForm.generalNotes} onChange={(e) => setRequestForm((p) => ({ ...p, generalNotes: e.target.value }))} style={{ width: '100%' }} /></label>

              <h4 style={{ margin: '8px 0' }}>بنود الطلب</h4>
              <table className="table" style={{ marginBottom: 8 }}>
                <thead><tr><th>المادة</th><th>الكمية</th><th>الوحدة</th><th>ملاحظات</th><th></th></tr></thead>
                <tbody>
                  {requestForm.items.map((it) => (
                    <tr key={it.id}>
                      <td><input className="input" value={it.materialName} onChange={(e) => updateRequestItem(it.id, { materialName: e.target.value })} placeholder="اسم المادة" style={{ minWidth: 200 }} /></td>
                      <td><input className="input" type="number" min={0} step="any" value={it.requestedQty} onChange={(e) => updateRequestItem(it.id, { requestedQty: e.target.value })} placeholder="الكمية" style={{ width: 100 }} /></td>
                      <td><select className="select" value={it.unit} onChange={(e) => updateRequestItem(it.id, { unit: e.target.value })} style={{ minWidth: 90 }}><option value="METER">متر</option><option value="PIECE">قطعة</option><option value="ROLL">لفة</option></select></td>
                      <td><input className="input" value={it.notes} onChange={(e) => updateRequestItem(it.id, { notes: e.target.value })} placeholder="ملاحظات" /></td>
                      <td>{requestForm.items.length > 1 && <button type="button" className="btn btn-soft" style={{ color: '#e57373', padding: '2px 8px' }} onClick={() => setRequestForm((p) => ({ ...p, items: p.items.filter((x) => x.id !== it.id) }))}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-soft" type="button" onClick={() => setRequestForm((p) => ({ ...p, items: [...p.items, makeItem()] }))}>+ إضافة بند</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</button>
              </div>
            </form>
          </section>

          {/* requests table */}
          <section className="card section">
            <h2 style={{ marginTop: 0 }}>طلبات المواد ({filteredRequests.length})</h2>
            {/* filter bar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input className="input" placeholder="بحث: رقم الطلب، المشروع، الطالب، المجهز" value={reqFilterSearch} onChange={(e) => setReqFilterSearch(e.target.value)} style={{ minWidth: 220, flex: 1 }} />
              <select className="select" value={reqFilterStatus} onChange={(e) => setReqFilterStatus(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">كل الحالات</option>
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {(reqFilterSearch || reqFilterStatus) && <button className="btn btn-soft" type="button" onClick={() => { setReqFilterSearch(''); setReqFilterStatus(''); }}>مسح الفلتر</button>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم الطلب</th><th>المشروع</th><th>الطالب</th><th>مجهز الطلب</th><th>الحالة</th><th>بنود</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {filteredRequests.length ? filteredRequests.map((req) => (
                    <tr key={req._id}>
                      <td><button type="button" className="btn btn-soft" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setDetailModal(req)}>{req.requestNo}</button></td>
                      <td>{req.project?.name || req.manualProjectName || req.projectName || '-'}</td>
                      <td>{req.requestedFor?.fullName || req.requestedBy?.fullName || '-'}</td>
                      <td>{req.assignedPreparer?.fullName || <span style={{ color: 'var(--text-soft)' }}>غير معين</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><Badge status={req.status} /></td>
                      <td>{(req.items || []).length}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendRequestWhatsapp(req)}>واتساب</button>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => downloadRequestPdf(req)}>PDF</button>
                          {canEditBeforePreparerApproval(req) && <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} type="button" disabled={!!busy} onClick={() => openEditRequest(req)}>تعديل</button>}
                          {/* Step 2: Manager approves */}
                          {canReview && ['PENDING_MANAGER_APPROVAL', 'NEW', 'UNDER_REVIEW'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#81c784' }} type="button" disabled={!!busy} onClick={() => openReview(req)}>اعتماد المدير</button>}
                          {/* Step 3: Supplier/Preparer approves */}
                          {isMyPreparer(req) && ['PENDING_SUPPLIER_APPROVAL', 'APPROVED'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#42a5f5' }} type="button" disabled={!!busy} onClick={() => handleSupplierApprove(req, 'ACCEPT')}>قبول المجهز</button>}
                          {isMyPreparer(req) && ['PENDING_SUPPLIER_APPROVAL', 'APPROVED'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#e57373' }} type="button" disabled={!!busy} onClick={() => handleSupplierApprove(req, 'REJECT')}>رفض المجهز</button>}
                          {/* Step 4: Prepare */}
                          {isMyPreparer(req) && ['IN_PROGRESS', 'PREPARING'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#ffb74d' }} type="button" disabled={!!busy} onClick={() => openPrepare(req)}>تجهيز</button>}
                          {/* Step 5: Employee confirms receipt */}
                          {isMyRequest(req) && ['PENDING_RECEIPT', 'PREPARED'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#ab47bc' }} type="button" disabled={!!busy} onClick={() => handleConfirmReceipt(req)}>تأكيد الاستلام</button>}
                          {/* Legacy dispatch button */}
                          {isMyPreparer(req) && ['PREPARED', 'PREPARING', 'IN_PROGRESS', 'PENDING_RECEIPT', 'RECEIVED'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#64b5f6' }} type="button" disabled={!!busy} onClick={() => openDispatch(req)}>تسليم يدوي</button>}
                          {/* Archive closed requests */}
                          {canReview && ['CLOSED', 'RECONCILED'].includes(req.status) && !req.archived && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#78909c' }} type="button" disabled={!!busy} onClick={() => handleArchive(req)}>أرشفة</button>}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={7} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد طلبات حالياً</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════ TAB: CUSTODIES & RECONCILIATION ══════ */}
      {activeTab === 'custodies' && (
        <>
          <section className="card section" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>الذمم ({custodies.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم الذمة</th><th>المستلم</th><th>المشروع</th><th>الحالة</th><th>البنود</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {custodies.length ? custodies.map((cu) => (
                    <tr key={cu._id}>
                      <td>{cu.custodyNo}</td>
                      <td>{cu.holder?.fullName || '-'}</td>
                      <td>{cu.project?.name || cu.manualProjectName || '-'}</td>
                      <td><Badge status={cu.status} /></td>
                      <td>{(cu.items || []).length}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendCustodyWhatsapp(cu)}>واتساب</button>
                          {(canPrepare || isGM) && ['OPEN', 'PARTIALLY_RECONCILED'].includes(cu.status) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#ffd54f' }} type="button" disabled={!!busy} onClick={() => openReconcile(cu)}>تصفية الذمة</button>
                          )}
                          {(canPrepare || isGM) && ['FULLY_RECONCILED'].includes(cu.status) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#90a4ae' }} type="button" disabled={!!busy} onClick={async () => { setBusy('close'); await doAction(async () => { await api.patch(`/materials/custodies/${cu._id}/close`, {}); setInfo('تم إغلاق الذمة'); }); }}>إغلاق</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد ذمم</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card section">
            <h2 style={{ marginTop: 0 }}>التصفيات ({reconciliations.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم التصفية</th><th>الذمة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {reconciliations.length ? reconciliations.map((rc) => (
                    <tr key={rc._id}>
                      <td>{rc.reconcileNo}</td>
                      <td>{rc.custody?.custodyNo || '-'}</td>
                      <td><Badge status={rc.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendReconciliationWhatsapp(rc)}>واتساب</button>
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'SUBMITTED' && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#81c784' }} type="button" disabled={!!busy} onClick={async () => { setBusy('approve-recon'); await doAction(async () => { await api.patch(`/materials/reconciliations/${rc._id}/review`, { action: 'APPROVE', points: 100 }); setInfo('تم اعتماد التصفية'); }); }}>اعتماد التصفية</button>
                          )}
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'SUBMITTED' && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#e57373' }} type="button" disabled={!!busy} onClick={async () => { setBusy('reject-recon'); await doAction(async () => { await api.patch(`/materials/reconciliations/${rc._id}/review`, { action: 'REJECT', rejectReason: 'مطلوب مراجعة البيانات' }); setInfo('تم رفض التصفية'); }); }}>رفض التصفية</button>
                          )}
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'APPROVED' && (rc.items || []).some((x) => toNum(x.toReturnQty) > toNum(x.returnedQtyConfirmed || 0)) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#4fc3f7' }} type="button" disabled={!!busy} onClick={() => openReturn(rc)}>استلام راجع</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد تصفيات</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════ TAB: OPEN CUSTODIES SUMMARY ══════ */}
      {activeTab === 'openCustodies' && (
        <section className="card section">
          <h2 style={{ marginTop: 0 }}>الموظفون الذين لديهم ذمم مفتوحة ({filteredCustodyHolders.length})</h2>
          <div style={{ marginBottom: 12 }}>
            <input className="input" placeholder="بحث: اسم الموظف، الكود، المشروع، رقم الطلب، المادة، المجهز" value={custodyHolderSearch} onChange={(e) => setCustodyHolderSearch(e.target.value)} style={{ minWidth: 220, maxWidth: 500 }} />
          </div>
          {filteredCustodyHolders.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredCustodyHolders.map((h) => (
                <div key={h.holderId} className="card" style={{ overflow: 'hidden' }}>
                  {/* holder header */}
                  <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, var(--primary), var(--primary-strong))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{h.holderName}</span>
                      {h.employeeCode && <span style={{ color: 'var(--text-soft)', fontSize: 12, marginRight: 8 }}>({h.employeeCode})</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap', color: 'var(--text-soft)' }}>
                      <span>عدد الذمم: <strong style={{ color: 'var(--text)' }}>{h.custodiesCount}</strong></span>
                      <span>إجمالي البنود: <strong style={{ color: 'var(--text)' }}>{h.totalItems}</strong></span>
                      <span>إجمالي المتبقي: <strong style={{ color: h.totalRemaining > 0 ? 'var(--danger, #f28787)' : 'var(--accent, #c4d743)' }}>{h.totalRemaining}</strong></span>
                      <span>المشاريع: <strong style={{ color: 'var(--text)' }}>{(h.projects || []).join('، ') || '-'}</strong></span>
                    </div>
                  </div>
                  {/* custodies list */}
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>رقم الذمة</th>
                            <th>رقم الطلب</th>
                            <th>المشروع</th>
                            <th>البنود</th>
                            <th>المتبقي</th>
                            <th>الحالة</th>
                            <th>تاريخ الفتح</th>
                            <th>التفاصيل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {h.custodies.map((c) => (
                            <tr key={c.custodyId}>
                              <td style={{ fontWeight: 600 }}>{c.custodyNo}</td>
                              <td>{c.requestNo}</td>
                              <td>{c.project}</td>
                              <td>{c.itemsCount}</td>
                              <td style={{ fontWeight: 700, color: c.remainingQty > 0 ? 'var(--danger, #f28787)' : 'var(--accent, #c4d743)' }}>{c.remainingQty}</td>
                              <td style={{ whiteSpace: 'nowrap' }}><Badge status={c.status} /></td>
                              <td>{c.openedAt ? new Date(c.openedAt).toLocaleDateString('ar-IQ') : '-'}</td>
                              <td>
                                <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 10px' }} type="button" onClick={() => setCustodyDetailModal({ ...c, holderName: h.holderName, holderEmployeeCode: h.employeeCode })}>عرض التفاصيل</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد ذمم مفتوحة حالياً</p>
          )}
        </section>
      )}

      {/* ══════ TAB: ARCHIVE ══════ */}
      {activeTab === 'archive' && (
        <section className="card section">
          <h2 style={{ marginTop: 0 }}>أرشيف الطلبات ({filteredArchive.length})</h2>
          <div style={{ marginBottom: 12 }}>
            <input className="input" placeholder="بحث: رقم الطلب، المشروع، الموظف، المادة" value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} style={{ minWidth: 220, maxWidth: 400 }} />
          </div>
          {filteredArchive.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>رقم الطلب</th>
                    <th>المشروع</th>
                    <th>الطالب</th>
                    <th>المجهز</th>
                    <th>الحالة</th>
                    <th>تاريخ الأرشفة</th>
                    <th>بنود</th>
                    <th>تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArchive.map((req) => (
                    <tr key={req._id}>
                      <td><button type="button" className="btn btn-soft" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setDetailModal(req)}>{req.requestNo}</button></td>
                      <td>{req.project?.name || req.manualProjectName || req.projectName || '-'}</td>
                      <td>{req.requestedFor?.fullName || req.requestedBy?.fullName || '-'}</td>
                      <td>{req.assignedPreparer?.fullName || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><Badge status={req.archived ? 'ARCHIVED' : req.status} /></td>
                      <td style={{ fontSize: 12 }}>{req.archivedAt ? new Date(req.archivedAt).toLocaleDateString('ar-IQ') : '-'}</td>
                      <td>{(req.items || []).length}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => downloadRequestPdf(req)}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد طلبات مؤرشفة</p>
          )}
        </section>
      )}

      {/* ══════ TAB: REPORTS ══════ */}
      {activeTab === 'reports' && canReports && (
        <section className="card section">
          <h2 style={{ marginTop: 0 }}>تقارير المواد</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button className="btn btn-primary" type="button" onClick={async () => { try { const blob = await api.get('/materials/reports/excel'); downloadBlob(blob, 'materials-report.xlsx'); } catch { setError('فشل تصدير Excel'); } }}>تصدير Excel</button>
            <button className="btn btn-soft" type="button" onClick={async () => { try { const blob = await api.get('/materials/reports/pdf'); downloadBlob(blob, 'materials-report.pdf'); } catch { setError('فشل تصدير PDF'); } }}>تصدير PDF</button>
            <button className="btn btn-soft" type="button" onClick={() => sendReportsWhatsapp()}>واتساب</button>
          </div>
          {summary?.totals && (
            <div className="grid-3">
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي الطلبات</p><h2>{summary.totals.requests || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي التسليمات</p><h2>{summary.totals.dispatches || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>ذمم مفتوحة</p><h2>{summary.totals.openCustodies || 0}</h2></article>
            </div>
          )}
        </section>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Review Modal */}
      <Modal open={!!reviewModal} title="مراجعة واعتماد الطلب" onClose={() => setReviewModal(null)}>
        {reviewModal && (
          <>
            <p>طلب رقم: <strong>{reviewModal.request.requestNo}</strong> — {reviewModal.request.project?.name}</p>
            <table className="table" style={{ marginBottom: 12 }}>
              <thead><tr><th>المادة</th><th>الكمية المطلوبة</th><th>الكمية المعتمدة</th><th>الوحدة</th><th>ملاحظات</th></tr></thead>
              <tbody>
                {(reviewModal.items || []).map((it, i) => (
                  <tr key={it.materialId || i}>
                    <td>{it.materialName}</td>
                    <td>{it.requestedQty}</td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={it.requestedQty}
                        step="any"
                        value={it.approvedQty}
                        disabled={reviewModal.action !== 'APPROVE_PARTIAL'}
                        onChange={(e) => updateReviewItem(it.materialId, { approvedQty: e.target.value })}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>{unitLabels[it.unit] || it.unit}</td>
                    <td><input className="input" value={it.lineNotes} disabled={reviewModal.action === 'REJECT'} onChange={(e) => updateReviewItem(it.materialId, { lineNotes: e.target.value })} placeholder="ملاحظة على البند" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label>القرار<select className="select" value={reviewModal.action} onChange={(e) => setReviewModal((p) => ({ ...p, action: e.target.value }))}>
              <option value="APPROVE_FULL">اعتماد كامل</option>
              <option value="APPROVE_PARTIAL">اعتماد بكميات معدلة</option>
              <option value="REJECT">رفض</option>
            </select></label>
            {reviewModal.action === 'REJECT' && <label style={{ display: 'block', marginTop: 8 }}>سبب الرفض<input className="input" value={reviewModal.rejectReason} onChange={(e) => setReviewModal((p) => ({ ...p, rejectReason: e.target.value }))} style={{ width: '100%' }} /></label>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReviewModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'review'} onClick={submitReview} style={{ background: reviewModal.action === 'REJECT' ? '#e57373' : undefined }}>{busy === 'review' ? 'جارٍ...' : reviewModal.action === 'REJECT' ? 'رفض الطلب' : 'اعتماد الطلب'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Prepare Modal */}
      <Modal open={!!prepareModal} title="تجهيز المواد" onClose={() => setPrepareModal(null)}>
        {prepareModal && (
          <>
            <p>طلب رقم: <strong>{prepareModal.request.requestNo}</strong></p>
            <label>المخزن<select className="select" value={prepareModal.warehouseId} onChange={(e) => setPrepareModal((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">افتراضي</option>{warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th></tr></thead>
              <tbody>
                {prepareModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.preparedQty} onChange={(e) => setPrepareModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, preparedQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setPrepareModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'prepare'} onClick={submitPrepare}>{busy === 'prepare' ? 'جارٍ...' : 'تأكيد التجهيز'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Dispatch Modal */}
      <Modal open={!!dispatchModal} title="تسليم المواد للمستلم" onClose={() => setDispatchModal(null)}>
        {dispatchModal && (
          <>
            <p>طلب رقم: <strong>{dispatchModal.request.requestNo}</strong> — المستلم: <strong>{dispatchModal.request.requestedFor?.fullName || dispatchModal.request.requestedBy?.fullName || '-'}</strong></p>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>بعد التسليم ستسجّل المواد كذمة على المستلم</p>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th></tr></thead>
              <tbody>
                {dispatchModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.deliveredQty} onChange={(e) => setDispatchModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, deliveredQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setDispatchModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'dispatch'} onClick={submitDispatch}>{busy === 'dispatch' ? 'جارٍ...' : 'تأكيد التسليم وتسجيل الذمة'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Reconcile Modal */}
      <Modal open={!!reconcileModal} title="تصفية ذمة المواد" onClose={() => setReconcileModal(null)}>
        {reconcileModal && (
          <>
            <p>ذمة رقم: <strong>{reconcileModal.custody.custodyNo}</strong> — {reconcileModal.custody.holder?.fullName}</p>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>حدد الكميات المصروفة على المشروع والكميات المتبقية للإرجاع</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: '12px 0' }}>
                <thead><tr><th>المادة</th><th>المستلم</th><th>المصروف</th><th>تالف</th><th>مفقود</th><th>للإرجاع</th></tr></thead>
                <tbody>
                  {reconcileModal.items.map((it, i) => {
                    const consumed = toNum(it.consumedQty);
                    const damaged = toNum(it.damagedQty);
                    const lost = toNum(it.lostQty);
                    const remaining = Math.max(0, it.receivedQty - consumed - damaged - lost);
                    return (
                      <tr key={i}>
                        <td>{it.materialName}</td>
                        <td style={{ color: 'var(--text-soft)' }}>{it.receivedQty}</td>
                        <td><input className="input" type="number" min={0} step="any" value={it.consumedQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, consumedQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(e.target.value) - toNum(x.damagedQty) - toNum(x.lostQty)), toReturnQty: Math.max(0, x.receivedQty - toNum(e.target.value) - toNum(x.damagedQty) - toNum(x.lostQty)) } : x) }))} style={{ width: 70 }} /></td>
                        <td><input className="input" type="number" min={0} step="any" value={it.damagedQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, damagedQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(e.target.value) - toNum(x.lostQty)), toReturnQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(e.target.value) - toNum(x.lostQty)) } : x) }))} style={{ width: 70 }} /></td>
                        <td><input className="input" type="number" min={0} step="any" value={it.lostQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, lostQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(x.damagedQty) - toNum(e.target.value)), toReturnQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(x.damagedQty) - toNum(e.target.value)) } : x) }))} style={{ width: 70 }} /></td>
                        <td style={{ color: '#4fc3f7', fontWeight: 600 }}>{remaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReconcileModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'reconcile'} onClick={submitReconcile}>{busy === 'reconcile' ? 'جارٍ...' : 'إرسال التصفية للاعتماد'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} title="استلام المواد الراجعة للمخزن" onClose={() => setReturnModal(null)}>
        {returnModal && (
          <>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>المواد الراجعة سترجع لرصيد المخزن مباشرة دون تسجيلها كذمة</p>
            <label>المخزن الوجهة<select className="select" value={returnModal.warehouseId} onChange={(e) => setReturnModal((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">افتراضي</option>{warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th><th>الحالة</th></tr></thead>
              <tbody>
                {returnModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.returnedQty} onChange={(e) => setReturnModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, returnedQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                    <td><select className="select" value={it.condition} onChange={(e) => setReturnModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, condition: e.target.value } : x) }))}><option value="NEW">جديد</option><option value="USED_PARTIAL">مستخدم جزئياً</option><option value="DAMAGED">تالف</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReturnModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'return'} onClick={submitReturn}>{busy === 'return' ? 'جارٍ...' : 'تأكيد استلام الراجع'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Custody Detail Modal */}
      <Modal open={!!custodyDetailModal} title={`تفاصيل الذمة ${custodyDetailModal?.custodyNo || ''}`} onClose={() => setCustodyDetailModal(null)}>
        {custodyDetailModal && (() => {
          const cd = custodyDetailModal;
          const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-IQ') : '-';
          const fmtDateTime = (d) => d ? new Date(d).toLocaleString('ar-IQ') : '-';
          const sectionStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, background: 'var(--surface-soft)' };
          const sectionTitle = { fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: 6 };
          const infoRow = { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, lineHeight: '1.8' };
          const label = { color: 'var(--text-soft)', minWidth: 90 };
          const val = { fontWeight: 600 };
          const InfoItem = ({ l, v }) => (<div style={{ flex: '1 1 200px' }}><span style={label}>{l}:</span> <span style={val}>{v || '-'}</span></div>);
          return (
            <div style={{ maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden' }}>
              {/* ── Section 1: معلومات الذمة ── */}
              <div style={sectionStyle}>
                <div style={sectionTitle}>معلومات الذمة</div>
                <div style={infoRow}>
                  <InfoItem l="رقم الذمة" v={cd.custodyNo} />
                  <InfoItem l="حالة الذمة" v={statusLabel[cd.status] || cd.status} />
                  <InfoItem l="تاريخ الفتح" v={fmtDate(cd.openedAt)} />
                  {cd.dueDate && <InfoItem l="تاريخ الاستحقاق" v={fmtDate(cd.dueDate)} />}
                </div>
                <div style={{ ...infoRow, marginTop: 4 }}>
                  <InfoItem l="الموظف المستلم" v={`${cd.holderName}${cd.holderEmployeeCode ? ` (${cd.holderEmployeeCode})` : ''}`} />
                  <InfoItem l="إجمالي المتبقي" v={String(cd.remainingQty)} />
                </div>
              </div>

              {/* ── Section 2: معلومات الطلب ── */}
              <div style={sectionStyle}>
                <div style={sectionTitle}>معلومات الطلب</div>
                <div style={infoRow}>
                  <InfoItem l="رقم الطلب" v={cd.requestNo} />
                  <InfoItem l="حالة الطلب" v={statusLabel[cd.requestStatus] || cd.requestStatus} />
                  <InfoItem l="الأولوية" v={cd.priority === 'URGENT' ? 'عاجل' : cd.priority === 'LOW' ? 'منخفض' : 'عادي'} />
                </div>
                <div style={{ ...infoRow, marginTop: 4 }}>
                  <InfoItem l="تاريخ الطلب" v={fmtDate(cd.requestDate)} />
                  <InfoItem l="مقدم الطلب" v={cd.requestedByName} />
                  <InfoItem l="المستلم" v={cd.requestedForName} />
                </div>
              </div>

              {/* ── Section 3: معلومات المشروع والمجهز ── */}
              <div style={sectionStyle}>
                <div style={sectionTitle}>المشروع والمجهز</div>
                <div style={infoRow}>
                  <InfoItem l="المشروع" v={cd.project} />
                  {cd.projectCode && <InfoItem l="كود المشروع" v={cd.projectCode} />}
                  <InfoItem l="المجهز" v={cd.preparerName} />
                </div>
              </div>

              {/* ── Section 4: المواد المطلوبة (من الطلب الأصلي) ── */}
              {(cd.requestItems || []).length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>المواد المطلوبة (الطلب الأصلي)</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>المادة</th>
                          <th>الوحدة</th>
                          <th>المطلوب</th>
                          <th>المعتمد</th>
                          <th>المجهز</th>
                          <th>المسلم</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cd.requestItems.map((ri, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{ri.materialName}{ri.materialCode ? ` (${ri.materialCode})` : ''}</td>
                            <td>{unitLabels[ri.unit] || ri.unit}</td>
                            <td>{ri.requestedQty}</td>
                            <td>{ri.approvedQty}</td>
                            <td>{ri.preparedQty}</td>
                            <td>{ri.deliveredQty}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-soft)' }}>{ri.lineNotes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Section 5: حالة الذمة (الأصناف على المستلم) ── */}
              {(cd.items || []).length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>حالة الذمة (الأصناف على المستلم)</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>المادة</th>
                          <th>الوحدة</th>
                          <th>المستلم</th>
                          <th>المستهلك</th>
                          <th>المرتجع</th>
                          <th>تالف</th>
                          <th>مفقود</th>
                          <th style={{ fontWeight: 700 }}>المتبقي</th>
                          <th>الحالة</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cd.items.map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 500 }}>{it.materialName}{it.materialCode ? ` (${it.materialCode})` : ''}</td>
                            <td>{unitLabels[it.unit] || it.unit}</td>
                            <td>{it.receivedQty}</td>
                            <td>{it.consumedQty}</td>
                            <td>{it.returnedQty}</td>
                            <td>{it.damagedQty}</td>
                            <td>{it.lostQty}</td>
                            <td style={{ fontWeight: 700, color: it.remainingQty > 0 ? 'var(--danger, #f28787)' : 'var(--accent, #c4d743)' }}>{it.remainingQty}</td>
                            <td style={{ whiteSpace: 'nowrap' }}><Badge status={it.lineStatus} /></td>
                            <td style={{ fontSize: 11, color: 'var(--text-soft)' }}>{it.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Section 6: الملاحظات ── */}
              {(cd.generalNotes || cd.notes) && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>الملاحظات</div>
                  {cd.generalNotes && <div style={{ fontSize: 13, marginBottom: 4 }}><span style={label}>ملاحظات الطلب:</span> {cd.generalNotes}</div>}
                  {cd.notes && <div style={{ fontSize: 13 }}><span style={label}>ملاحظات الذمة:</span> {cd.notes}</div>}
                </div>
              )}

              {/* ── Section 7: التسليم ── */}
              {(cd.dispatchInfo || []).length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>سجل التسليم</div>
                  <ul style={{ margin: 0, padding: '0 16px', fontSize: 13 }}>
                    {cd.dispatchInfo.map((d, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{d.dispatchNo}</strong> — <Badge status={d.status} /> — {fmtDateTime(d.deliveredAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Section 8: سجل الاعتمادات ── */}
              {(cd.approvals || []).length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>سجل الاعتمادات</div>
                  <ul style={{ margin: 0, padding: '0 16px', fontSize: 13 }}>
                    {cd.approvals.map((a, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{a.approvedBy}</strong> — {a.action === 'APPROVE_FULL' ? 'اعتماد كامل' : a.action === 'APPROVE_PARTIAL' ? 'اعتماد جزئي' : a.action === 'REJECT' ? 'رفض' : a.action} — {fmtDateTime(a.approvedAt)}
                        {a.comment && <span style={{ color: 'var(--text-soft)' }}> — {a.comment}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Section 9: سجل التجهيز ── */}
              {(cd.preparations || []).length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitle}>سجل التجهيز</div>
                  <ul style={{ margin: 0, padding: '0 16px', fontSize: 13 }}>
                    {cd.preparations.map((p, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{p.preparedBy}</strong> — {p.mode === 'FULL' ? 'تجهيز كامل' : 'تجهيز جزئي'} — المخزن: {p.warehouse} — {fmtDateTime(p.preparedAt)}
                        {p.notes && <span style={{ color: 'var(--text-soft)' }}> — {p.notes}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Edit Request Modal */}
      <Modal open={!!editRequestModal} title={`تعديل الطلب ${editRequestModal?.request?.requestNo || ''}`} onClose={() => setEditRequestModal(null)}>
        {editRequestModal && (
          <form onSubmit={submitEditRequest}>
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>
              يمكن تعديل الطلب قبل اعتماد المجهز فقط. بعد الحفظ سيعود الطلب إلى مرحلة اعتماد مدير المشاريع حتى تتم مراجعة الكميات الجديدة.
            </p>
            <div className="grid-3" style={{ marginBottom: 12 }}>
              <label>المشروع
                <select className="select" value={editRequestModal.projectId} onChange={(e) => setEditRequestModal((p) => ({ ...p, projectId: e.target.value, manualProjectName: e.target.value ? '' : p.manualProjectName }))}>
                  <option value="">مشروع يدوي</option>
                  {projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}
                </select>
              </label>
              <label>اسم المشروع اليدوي
                <input className="input" value={editRequestModal.manualProjectName} disabled={!!editRequestModal.projectId} onChange={(e) => setEditRequestModal((p) => ({ ...p, manualProjectName: e.target.value }))} placeholder="اكتب اسم المشروع" />
              </label>
              <label>مجهز الطلب
                <select className="select" value={editRequestModal.assignedPreparerId} onChange={(e) => setEditRequestModal((p) => ({ ...p, assignedPreparerId: e.target.value }))}>
                  <option value="">بدون تعيين</option>
                  {allUsers.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}
                </select>
              </label>
              <label>المستلم
                <select className="select" value={editRequestModal.requestedForId} onChange={(e) => setEditRequestModal((p) => ({ ...p, requestedForId: e.target.value }))}>
                  <option value="">نفس المستخدم</option>
                  {users.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}
                </select>
              </label>
              <label>العميل
                <input className="input" value={editRequestModal.clientName} onChange={(e) => setEditRequestModal((p) => ({ ...p, clientName: e.target.value }))} />
              </label>
              <label>الأولوية
                <select className="select" value={editRequestModal.priority} onChange={(e) => setEditRequestModal((p) => ({ ...p, priority: e.target.value }))}>
                  <option value="URGENT">عاجل</option>
                  <option value="NORMAL">طبيعي</option>
                  <option value="LOW">منخفض</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>سبب التعديل
              <input className="input" value={editRequestModal.editReason} onChange={(e) => setEditRequestModal((p) => ({ ...p, editReason: e.target.value }))} required />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>ملاحظات عامة
              <input className="input" value={editRequestModal.generalNotes} onChange={(e) => setEditRequestModal((p) => ({ ...p, generalNotes: e.target.value }))} style={{ width: '100%' }} />
            </label>
            <h4 style={{ margin: '8px 0' }}>بنود الطلب</h4>
            <table className="table" style={{ marginBottom: 8 }}>
              <thead><tr><th>المادة</th><th>الكمية</th><th>الوحدة</th><th>ملاحظات</th><th></th></tr></thead>
              <tbody>
                {editRequestModal.items.map((it) => (
                  <tr key={it.id}>
                    <td><input className="input" value={it.materialName} onChange={(e) => updateEditRequestItem(it.id, { materialName: e.target.value })} placeholder="اسم المادة" style={{ minWidth: 200 }} /></td>
                    <td><input className="input" type="number" min={0} step="any" value={it.requestedQty} onChange={(e) => updateEditRequestItem(it.id, { requestedQty: e.target.value })} placeholder="الكمية" style={{ width: 100 }} /></td>
                    <td>
                      <select className="select" value={it.unit} onChange={(e) => updateEditRequestItem(it.id, { unit: e.target.value })} style={{ minWidth: 90 }}>
                        {Object.entries(unitLabels).map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
                      </select>
                    </td>
                    <td><input className="input" value={it.notes} onChange={(e) => updateEditRequestItem(it.id, { notes: e.target.value })} placeholder="ملاحظات" /></td>
                    <td>{editRequestModal.items.length > 1 && <button type="button" className="btn btn-soft" style={{ color: '#e57373', padding: '2px 8px' }} onClick={() => setEditRequestModal((p) => ({ ...p, items: p.items.filter((x) => x.id !== it.id) }))}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-soft" type="button" onClick={() => setEditRequestModal((p) => ({ ...p, items: [...p.items, makeItem()] }))}>+ إضافة بند</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-soft" type="button" onClick={() => setEditRequestModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="submit" disabled={busy === 'editRequest'}>{busy === 'editRequest' ? 'جارٍ الحفظ...' : 'حفظ التعديل'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailModal} title={`تفاصيل الطلب ${detailModal?.requestNo || ''}`} onClose={() => setDetailModal(null)}>
        {detailModal && (
          <>
            <div className="grid-3" style={{ gap: 8, marginBottom: 12 }}>
              <div><span style={{ color: 'var(--text-soft)' }}>المشروع:</span> {detailModal.project?.name || detailModal.manualProjectName || detailModal.projectName || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>الطالب:</span> {detailModal.requestedBy?.fullName || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>المستلم:</span> {detailModal.requestedFor?.fullName || detailModal.requestedBy?.fullName || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>المجهز:</span> {detailModal.assignedPreparer?.fullName || 'غير معين'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>الحالة:</span> <Badge status={detailModal.archived ? 'ARCHIVED' : detailModal.status} /></div>
              <div><span style={{ color: 'var(--text-soft)' }}>الأولوية:</span> {detailModal.priority || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>تاريخ الإنشاء:</span> {detailModal.requestDate ? new Date(detailModal.requestDate).toLocaleDateString('ar-IQ') : detailModal.createdAt ? new Date(detailModal.createdAt).toLocaleDateString('ar-IQ') : '-'}</div>
              {detailModal.closedAt && <div><span style={{ color: 'var(--text-soft)' }}>تاريخ الإغلاق:</span> {new Date(detailModal.closedAt).toLocaleDateString('ar-IQ')}</div>}
              {detailModal.archivedAt && <div><span style={{ color: 'var(--text-soft)' }}>تاريخ الأرشفة:</span> {new Date(detailModal.archivedAt).toLocaleDateString('ar-IQ')}</div>}
            </div>
            <table className="table">
              <thead><tr><th>المادة</th><th>المطلوب</th><th>المعتمد</th><th>المجهز</th><th>المسلم</th><th>الوحدة</th></tr></thead>
              <tbody>
                {(detailModal.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td>{it.requestedQty}</td>
                    <td>{it.approvedQty}</td>
                    <td>{it.preparedQty}</td>
                    <td>{it.deliveredQty}</td>
                    <td>{unitLabels[it.unitSnapshot] || it.unitSnapshot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailModal.generalNotes && <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>ملاحظات: {detailModal.generalNotes}</p>}
            {/* Approval trail */}
            {(detailModal.approvals || []).length > 0 && (
              <>
                <h4 style={{ margin: '12px 0 6px' }}>سجل الاعتمادات</h4>
                <ul style={{ margin: 0, padding: '0 16px', fontSize: 13 }}>
                  {detailModal.approvals.map((a, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong>{a.approvedBy?.fullName || '-'}</strong> — {a.action === 'APPROVE_FULL' ? 'اعتماد كامل' : a.action === 'APPROVE_PARTIAL' ? 'اعتماد بكميات معدلة' : a.action === 'REJECT' ? 'رفض' : a.action} — {a.approvedAt ? new Date(a.approvedAt).toLocaleString('ar-IQ') : '-'}
                      {a.comment && <span style={{ color: 'var(--text-soft)' }}> — {a.comment}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* Preparations */}
            {(detailModal.preparations || []).length > 0 && (
              <>
                <h4 style={{ margin: '12px 0 6px' }}>سجل التجهيز</h4>
                <ul style={{ margin: 0, padding: '0 16px', fontSize: 13 }}>
                  {detailModal.preparations.map((p, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong>{p.preparedBy?.fullName || '-'}</strong> — {p.mode === 'FULL' ? 'تجهيز كامل' : 'تجهيز جزئي'} — {p.preparedAt ? new Date(p.preparedAt).toLocaleString('ar-IQ') : '-'}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
