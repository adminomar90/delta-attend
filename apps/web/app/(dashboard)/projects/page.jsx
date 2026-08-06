'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission } from '../../../lib/permissions';
import {
  buildWorkReportApprovalPayload,
  buildWorkReportApprovalPointsMap,
} from '../../../lib/workReportPoints';
import { buildDailyWorkPlanFormData } from '../../../lib/dailyWorkPlans';
import DailyWorkPlanCalendar from '../../../components/daily-work-plans/DailyWorkPlanCalendar';
import DailyWorkPlanModal from '../../../components/daily-work-plans/DailyWorkPlanModal';
import DailyWorkPlanAssigneePicker from '../../../components/daily-work-plans/DailyWorkPlanAssigneePicker';

const statusLabel = {
  PENDING_APPROVAL: 'قيد الموافقة',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  DONE: 'مكتمل',
  REJECTED: 'مرفوض',
};

const statusClass = {
  PENDING_APPROVAL: 'status-submitted',
  ACTIVE: 'status-approved',
  ON_HOLD: 'status-inprogress',
  DONE: 'status-todo',
  REJECTED: 'status-rejected',
};

const stageStatusLabel = {
  NOT_STARTED: 'لم تبدأ',
  IN_PROGRESS: 'قيد التنفيذ',
  STOPPED: 'متوقفة',
  DELAYED: 'متأخرة',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

const stageStatusClass = {
  NOT_STARTED: 'status-todo',
  IN_PROGRESS: 'status-inprogress',
  STOPPED: 'status-submitted',
  DELAYED: 'status-rejected',
  COMPLETED: 'status-approved',
  CANCELLED: 'status-rejected',
};

const workReportStatusLabel = {
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

const workReportStatusClass = {
  SUBMITTED: 'status-submitted',
  APPROVED: 'status-approved',
  REJECTED: 'status-rejected',
};

const projectDashboardTabs = [
  { id: 'overview', label: 'نظرة عامة', icon: '▦' },
  { id: 'stages', label: 'المراحل', icon: '◇' },
  { id: 'tasks', label: 'المهام', icon: '☑' },
  { id: 'workReports', label: 'تقارير العمل', icon: '▧' },
  { id: 'timeline', label: 'الجدول الزمني', icon: '▣' },
  { id: 'team', label: 'الكادر', icon: '♙' },
  { id: 'departments', label: 'الأقسام', icon: '▤' },
  { id: 'supervisors', label: 'المسؤولين', icon: '◎' },
  { id: 'finance', label: 'المالية', icon: '▥' },
  { id: 'invoices', label: 'الفواتير', icon: '□' },
  { id: 'warehouse', label: 'مخزن المشروع', icon: '⌂' },
  { id: 'documents', label: 'المستندات', icon: '▱' },
];

const projectDashboardTabInfo = {
  overview: { title: 'نظرة عامة', text: 'ملخص المشروع والمؤشرات الرئيسية سيتم تطويرها هنا.' },
  supervisors: { title: 'المسؤولين', text: 'سيتم تحديد مسؤولي المشروع والمراحل وسلسلة الاعتماد.' },
  warehouse: { title: 'مخزن المشروع', text: 'سيتم عرض المواد المصروفة والمرتجعة والتالفة المرتبطة بالمشروع.' },
  documents: { title: 'المستندات', text: 'سيتم رفع ملفات المشروع وصوره ومرفقاته وتنظيمها.' },
};

const projectTaskStatusLabel = {
  NEW: 'جديدة',
  PLANNED: 'مخطط لها',
  IN_PROGRESS: 'قيد التنفيذ',
  PAUSED: 'معلقة',
  WAITING_MATERIALS: 'بانتظار المواد',
  DELAYED: 'متأخرة',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

const projectTaskPriorityLabel = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

const financialTypeLabel = {
  TRANSPORT_EXPENSE: 'نقل',
  FOOD_EXPENSE: 'طعام',
  MATERIALS_EXPENSE: 'مواد',
  WORK_ADVANCE: 'سلفة عمل',
  SALARY_ADVANCE: 'سلفة من راتب',
  BUSINESS_EXPENSE: 'مصروف تشغيلي',
  EXCEPTIONAL_EXPENSE: 'مصروف استثنائي',
  TRAVEL_EXPENSE: 'مصروف السفر',
  PURCHASE_REIMBURSEMENT: 'استرداد شراء',
  OTHER: 'أخرى',
};

const financialTypeOptions = Object.entries(financialTypeLabel);

const financialStatusLabel = {
  DRAFT: 'مسودة',
  PENDING_PROJECT_MANAGER_APPROVAL: 'بانتظار مدير المشروع',
  PENDING_FINANCIAL_MANAGER_APPROVAL: 'بانتظار الاعتماد المالي',
  PENDING_GENERAL_MANAGER_APPROVAL: 'بانتظار المدير العام',
  READY_FOR_DISBURSEMENT: 'جاهزة للصرف',
  DISBURSED: 'مصروفة',
  PENDING_RECEIPT_CONFIRMATION: 'بانتظار استلام',
  RECEIVED: 'مستلمة',
  CLOSED: 'مغلقة',
  RETURNED_FOR_REVIEW: 'معادة للمراجعة',
  REJECTED_BY_PROJECT_MANAGER: 'مرفوضة من مدير المشروع',
  REJECTED_BY_FINANCIAL_MANAGER: 'مرفوضة مالياً',
  REJECTED_BY_GENERAL_MANAGER: 'مرفوضة من المدير العام',
};

const financialDeliveredStatuses = ['DISBURSED', 'PENDING_RECEIPT_CONFIRMATION', 'RECEIVED', 'CLOSED'];
const financialPendingProjectOrFinancialApprovalStatuses = [
  'PENDING_PROJECT_MANAGER_APPROVAL',
  'PENDING_FINANCIAL_MANAGER_APPROVAL',
];

const emptyProjectTaskForm = {
  title: '',
  description: '',
  stage: '',
  priority: 'MEDIUM',
  startDate: '',
  dueDate: '',
  progressPercent: 0,
  status: 'NEW',
  assignees: [],
  teamLeader: '',
  estimatedHours: 0,
  location: '',
  notes: '',
};

const emptyDailyLaborerForm = {
  fullName: '',
  phone: '',
  jobTitle: '',
  dailyWage: 0,
  currency: 'IQD',
  startDate: '',
  notes: '',
};

const emptyProjectDepartmentForm = {
  name: '',
  description: '',
  manager: '',
  members: [],
  notes: '',
};

const emptyProjectSupervisorForm = {
  employee: '',
  role: 'SUPERVISOR',
  title: '',
  notes: '',
};

const projectSupervisorRoleLabel = {
  PROJECT_MANAGER: 'مدير مشروع',
  SUPERVISOR: 'مسؤول مشروع',
};

const emptyProjectFinanceForm = {
  currency: 'IQD',
  transactionDate: '',
  requestType: 'MATERIALS_EXPENSE',
  amount: '',
  description: '',
  notes: '',
  files: [],
};

const emptyProjectInvoiceForm = {
  supplier: '',
  supplierName: '',
  materialType: '',
  invoiceNo: '',
  invoiceAmount: '',
  transportAmount: '',
  invoiceDate: '',
  currency: 'IQD',
  paymentMethod: 'CREDIT',
  paidAmount: '',
  notes: '',
  originalInvoice: null,
};

const emptyProjectDocumentForm = {
  documentType: 'PHOTO',
  title: '',
  notes: '',
  files: [],
};

const projectDocumentTypeLabel = {
  PHOTO: 'صور المشروع',
  PLAN: 'مخططات',
  CONTRACT: 'عقود',
  REQUIREMENT: 'مستمسكات',
  OTHER: 'ملفات أخرى',
};

const projectDocumentTypeOptions = Object.entries(projectDocumentTypeLabel);

const emptyProjectForm = {
  name: '', code: '', customerId: '', workCategories: [], description: '', budget: 0, startDate: '', endDate: '',
};

const emptyProjectStageForm = {
  name: '',
  description: '',
  order: '',
  plannedStartDate: '',
  plannedEndDate: '',
  actualStartDate: '',
  actualEndDate: '',
  progressPercent: 0,
  manager: '',
  participants: [],
  status: 'NOT_STARTED',
  notes: '',
};

const projectWorkCategories = [
  'كاميرات مراقبة',
  'بدالة داخلية',
  'شبكة نيت ورك',
  'أنظمة إنذار وإطفاء الحريق',
  'برمجيات',
  'أنظمة الصوت',
  'طاقة شمسية',
  'أخرى',
];

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const formatProjectMoney = (value, currency = 'IQD') => {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${safeAmount.toLocaleString('en-US')} ${currency || 'IQD'}`;
};
const monthAnchor = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
};
const monthRange = (value) => {
  const start = monthAnchor(value);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
  return { from: toDateInput(start), to: toDateInput(end) };
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [view, setView] = useState('cards');
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeProjectTab, setActiveProjectTab] = useState('stages');
  const [projectPlans, setProjectPlans] = useState([]);
  const [projectStages, setProjectStages] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [projectWorkReports, setProjectWorkReports] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [workReportsLoading, setWorkReportsLoading] = useState(false);
  const [workReportActionId, setWorkReportActionId] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => monthAnchor(new Date()));
  const [calendarDate, setCalendarDate] = useState('');
  const [stageEmployees, setStageEmployees] = useState([]);
  const [stageForm, setStageForm] = useState(emptyProjectStageForm);
  const [editingStageId, setEditingStageId] = useState('');
  const [stageSaving, setStageSaving] = useState(false);
  const [stageStatusFilter, setStageStatusFilter] = useState('');
  const [taskForm, setTaskForm] = useState(emptyProjectTaskForm);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskStageFilter, setTaskStageFilter] = useState('');
  const [dailyPlanTaskPickerOpen, setDailyPlanTaskPickerOpen] = useState(false);
  const [projectTeamMemberIds, setProjectTeamMemberIds] = useState([]);
  const [dailyLaborerForm, setDailyLaborerForm] = useState(emptyDailyLaborerForm);
  const [teamFormMode, setTeamFormMode] = useState('');
  const [projectTeamSaving, setProjectTeamSaving] = useState(false);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [departmentForm, setDepartmentForm] = useState(emptyProjectDepartmentForm);
  const [projectDepartmentSaving, setProjectDepartmentSaving] = useState(false);
  const [supervisorFormOpen, setSupervisorFormOpen] = useState(false);
  const [supervisorForm, setSupervisorForm] = useState(emptyProjectSupervisorForm);
  const [projectSupervisorSaving, setProjectSupervisorSaving] = useState(false);
  const [projectFinancialRequests, setProjectFinancialRequests] = useState([]);
  const [projectCustomerReceipts, setProjectCustomerReceipts] = useState([]);
  const [projectInvoices, setProjectInvoices] = useState([]);
  const [projectWarehouseMaterials, setProjectWarehouseMaterials] = useState([]);
  const [projectWarehouseSummary, setProjectWarehouseSummary] = useState(null);
  const [projectWarehouseLoading, setProjectWarehouseLoading] = useState(false);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [projectDocumentsLoading, setProjectDocumentsLoading] = useState(false);
  const [projectDocumentFormOpen, setProjectDocumentFormOpen] = useState(false);
  const [projectDocumentForm, setProjectDocumentForm] = useState(emptyProjectDocumentForm);
  const [projectDocumentSaving, setProjectDocumentSaving] = useState(false);
  const [projectFinanceLoading, setProjectFinanceLoading] = useState(false);
  const [projectFinanceFormOpen, setProjectFinanceFormOpen] = useState(false);
  const [projectFinanceForm, setProjectFinanceForm] = useState(emptyProjectFinanceForm);
  const [projectFinanceSaving, setProjectFinanceSaving] = useState(false);
  const [projectInvoiceFormOpen, setProjectInvoiceFormOpen] = useState(false);
  const [projectInvoiceForm, setProjectInvoiceForm] = useState(emptyProjectInvoiceForm);
  const [editingProjectInvoiceId, setEditingProjectInvoiceId] = useState('');
  const [projectInvoiceSaving, setProjectInvoiceSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [planUsers, setPlanUsers] = useState([]);
  const [planForm, setPlanForm] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [plansRefreshKey, setPlansRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyProjectForm);

  const user = authStorage.getUser();
  const currentUserId = String(user?.id || user?._id || '');
  const canManage = useMemo(() => {
    return hasAnyPermission(user, [
      Permission.MANAGE_PROJECTS,
      Permission.MANAGE_MATERIAL_INVENTORY,
      Permission.ADD_PROJECT_FROM_WAREHOUSE,
    ]);
  }, [user]);
  const canCreateDailyPlan = useMemo(() => hasAnyPermission(user, [
    Permission.CREATE_DAILY_WORK_PLANS,
    Permission.MANAGE_DAILY_WORK_PLANS,
  ]), [user]);
  const canViewProjectDashboard = useMemo(() => hasAnyPermission(user, [
    Permission.VIEW_PROJECT_DASHBOARD,
    Permission.MANAGE_PROJECTS,
    Permission.MANAGE_PROJECT_STAGES,
    Permission.MANAGE_MATERIAL_INVENTORY,
    Permission.ADD_PROJECT_FROM_WAREHOUSE,
    Permission.VIEW_FINANCIAL_REPORTS,
    Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
    Permission.VIEW_SUPPLIER_FINANCIALS,
  ]), [user]);
  const canManageStages = useMemo(() => hasAnyPermission(user, [
    Permission.MANAGE_PROJECTS,
    Permission.MANAGE_PROJECT_STAGES,
  ]), [user]);
  const canManageProjectTasks = useMemo(() => hasAnyPermission(user, [
    Permission.MANAGE_PROJECTS,
    Permission.MANAGE_TASKS,
  ]), [user]);
  const canViewProjectWorkReports = useMemo(() => hasAnyPermission(user, [
    Permission.VIEW_OWN_WORK_REPORTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.VIEW_COMPLETED_WORK_REPORTS,
    Permission.VIEW_PROJECT_DASHBOARD,
    Permission.MANAGE_PROJECTS,
  ]), [user]);
  const canApproveProjectWorkReports = useMemo(() => hasAnyPermission(user, [
    Permission.APPROVE_TASKS,
    Permission.VIEW_TEAM_WORK_REPORTS,
  ]), [user]);
  const canCreateProjectFinance = useMemo(() => hasAnyPermission(user, [
    Permission.CREATE_FINANCIAL_DISBURSEMENTS,
  ]), [user]);
  const canViewProjectFinance = useMemo(() => hasAnyPermission(user, [
    Permission.CREATE_FINANCIAL_DISBURSEMENTS,
    Permission.REVIEW_FINANCIAL_DISBURSEMENTS,
    Permission.DISBURSE_FINANCIAL_FUNDS,
    Permission.VIEW_FINANCIAL_REPORTS,
    Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
  ]), [user]);

  const load = async () => {
    try {
      const [projectsResponse, customersResponse] = await Promise.all([
        api.get('/projects'),
        canManage ? api.get('/projects/customers/options') : Promise.resolve({ customers: [] }),
      ]);
      setProjects(projectsResponse.projects || []);
      setCustomers(customersResponse.customers || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل المشاريع');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!canCreateDailyPlan) return;
    api.get('/daily-work-plans/meta')
      .then((response) => setPlanUsers((response.users || []).map((item) => ({ ...item, id: item.id || item._id }))))
      .catch(() => {});
  }, [canCreateDailyPlan]);

  useEffect(() => {
    if (!canViewProjectDashboard && !canManageStages) return;
    api.get('/auth/users')
      .then((response) => setStageEmployees((response.users || []).filter((employee) => employee.active !== false)))
      .catch(() => setStageEmployees([]));
  }, [canViewProjectDashboard, canManageStages]);

  useEffect(() => {
    if (!canManage && !canViewProjectFinance) return;
    api.get('/suppliers')
      .then((response) => setSuppliers(response.suppliers || []))
      .catch(() => setSuppliers([]));
  }, [canManage, canViewProjectFinance]);

  useEffect(() => {
    if (!selectedProject) return;
    const loadProjectPlans = async () => {
      setPlansLoading(true);
      try {
        const range = monthRange(calendarMonth);
        const response = await api.get(`/projects/${selectedProject._id}/daily-work-plans?from=${range.from}&to=${range.to}`);
        setProjectPlans(response.plans || []);
      } catch (err) {
        setError(err.message || 'تعذر تحميل أيام العمل المرتبطة بالمشروع');
        setProjectPlans([]);
      } finally {
        setPlansLoading(false);
      }
    };
    loadProjectPlans();
  }, [selectedProject?._id, calendarMonth, plansRefreshKey]);

  const loadProjectStages = async (projectId = selectedProject?._id, status = stageStatusFilter) => {
    if (!projectId || !canViewProjectDashboard) return;
    setStagesLoading(true);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const response = await api.get(`/projects/${projectId}/stages${query}`);
      setProjectStages(response.stages || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل مراحل المشروع');
      setProjectStages([]);
    } finally {
      setStagesLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectDashboard) return;
    loadProjectStages(selectedProject._id, stageStatusFilter);
  }, [selectedProject?._id, stageStatusFilter, canViewProjectDashboard]);

  const loadProjectTasks = async (projectId = selectedProject?._id, stageId = taskStageFilter) => {
    if (!projectId || !canViewProjectDashboard) return;
    setTasksLoading(true);
    try {
      const query = stageId ? `?stageId=${encodeURIComponent(stageId)}` : '';
      const response = await api.get(`/projects/${projectId}/tasks${query}`);
      setProjectTasks(response.tasks || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل مهام المشروع');
      setProjectTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectDashboard) return;
    loadProjectTasks(selectedProject._id, taskStageFilter);
  }, [selectedProject?._id, taskStageFilter, canViewProjectDashboard]);

  const reportProjectMatches = (report, project) => {
    if (!report || !project) return false;
    const projectId = String(project._id || project.id || '');
    const reportProjectId = String(report.project?._id || report.project?.id || report.project || report.projectId || '');
    if (projectId && reportProjectId && projectId === reportProjectId) return true;

    const projectName = String(project.name || '').trim().toLowerCase();
    const reportProjectName = String(report.project?.name || report.projectName || '').trim().toLowerCase();
    return Boolean(projectName && reportProjectName && projectName === reportProjectName);
  };

  const loadProjectWorkReports = async (project = selectedProject) => {
    if (!project || !canViewProjectWorkReports) return;
    setWorkReportsLoading(true);
    try {
      const response = await api.get('/work-reports');
      const reports = (response.reports || []).filter((report) => reportProjectMatches(report, project));
      setProjectWorkReports(reports);
    } catch (err) {
      setError(err.message || 'تعذر تحميل تقارير العمل المرتبطة بالمشروع');
      setProjectWorkReports([]);
    } finally {
      setWorkReportsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectWorkReports) return;
    loadProjectWorkReports(selectedProject);
  }, [selectedProject?._id, canViewProjectWorkReports]);

  const loadProjectWarehouse = async (projectId = selectedProject?._id) => {
    if (!projectId || !canViewProjectDashboard) return;
    setProjectWarehouseLoading(true);
    try {
      const response = await api.get(`/projects/${projectId}/warehouse/materials`);
      setProjectWarehouseMaterials(response.materials || []);
      setProjectWarehouseSummary(response.summary || null);
    } catch (err) {
      setError(err.message || 'تعذر تحميل مخزن المشروع');
      setProjectWarehouseMaterials([]);
      setProjectWarehouseSummary(null);
    } finally {
      setProjectWarehouseLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectDashboard) return;
    loadProjectWarehouse(selectedProject._id);
  }, [selectedProject?._id, canViewProjectDashboard]);

  const loadProjectDocuments = async (projectId = selectedProject?._id) => {
    if (!projectId || !canViewProjectDashboard) return;
    setProjectDocumentsLoading(true);
    try {
      const response = await api.get(`/projects/${projectId}/documents`);
      setProjectDocuments(response.documents || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل مستندات المشروع');
      setProjectDocuments([]);
    } finally {
      setProjectDocumentsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectDashboard) return;
    loadProjectDocuments(selectedProject._id);
  }, [selectedProject?._id, canViewProjectDashboard]);

  const loadProjectFinance = async (projectId = selectedProject?._id) => {
    if (!projectId || !canViewProjectFinance) return;
    setProjectFinanceLoading(true);
    try {
      const [requestsResponse, receiptsResponse] = await Promise.all([
        api.get(`/financial-disbursements?project=${encodeURIComponent(projectId)}`),
        api.get(`/customer-receipts?project=${encodeURIComponent(projectId)}`).catch(() => ({ receipts: [] })),
      ]);
      setProjectFinancialRequests(requestsResponse.requests || []);
      setProjectCustomerReceipts(receiptsResponse.receipts || []);
      api.get(`/projects/${projectId}/invoices`)
        .then((response) => setProjectInvoices(response.invoices || []))
        .catch(() => setProjectInvoices([]));
    } catch (err) {
      setError(err.message || 'تعذر تحميل مالية المشروع');
      setProjectFinancialRequests([]);
      setProjectCustomerReceipts([]);
      setProjectInvoices([]);
    } finally {
      setProjectFinanceLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject || !canViewProjectFinance) return;
    loadProjectFinance(selectedProject._id);
  }, [selectedProject?._id, canViewProjectFinance]);

  const openDailyPlanForm = (project, date = '') => {
    const customer = project.customer || {};
    if (selectedProject?._id !== project._id) {
      setSelectedProject(project);
      setProjectPlans([]);
      setCalendarMonth(monthAnchor(date || new Date()));
      setCalendarDate(date || '');
    }
    setError('');
    setInfo('');
    setPlanForm({
      project: { _id: project._id },
      customer: customer._id || customer.id || '',
      customerName: customer.name || project.clientName || '',
      customerSnapshot: {
        phone: customer.phone || project.clientPhone || '',
        whatsapp: customer.whatsapp || customer.phone || project.clientPhone || '',
      },
      location: project.location || '',
      planDate: date || toDateInput(new Date()),
      title: '',
      description: '',
      assignees: [],
    });
  };

  const projectStageFallbackPeople = useMemo(() => {
    if (!selectedProject) return [];
    const people = [
      selectedProject.projectManager,
      selectedProject.owner,
      ...(selectedProject.teamMembers || []),
    ].filter(Boolean);
    const seen = new Set();
    return people.filter((person) => {
      const id = String(person._id || person.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [selectedProject]);

  const stageEmployeeOptions = useMemo(() => {
    const people = stageEmployees.length ? stageEmployees : projectStageFallbackPeople;
    const seen = new Set();
    return people.filter((person) => {
      const id = String(person._id || person.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map((person) => ({
      ...person,
      id: String(person.id || person._id || ''),
      fullName: person.fullName || person.name || '',
    })).sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'ar'));
  }, [stageEmployees, projectStageFallbackPeople]);

  const averageStageProgress = useMemo(() => {
    if (!projectStages.length) return 0;
    const total = projectStages.reduce((sum, stage) => sum + Number(stage.progressPercent || 0), 0);
    return Math.round(total / projectStages.length);
  }, [projectStages]);

  const projectFinanceSummary = useMemo(() => {
    const currency = projectFinancialRequests[0]?.currency || projectFinanceForm.currency || 'IQD';
    const amountOf = (request) => Number(request.approvedAmount != null ? request.approvedAmount : request.amount || 0);
    const invoiceTotal = projectInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
    const supplierDebtTotal = projectInvoices
      .reduce((sum, invoice) => sum + Number(invoice.remainingAmount != null ? invoice.remainingAmount : invoice.paymentMethod === 'CREDIT' ? invoice.totalAmount : 0), 0);
    const supplierPaidTotal = projectInvoices
      .reduce((sum, invoice) => sum + Number(invoice.paidAmount || (invoice.paymentMethod === 'CASH' ? invoice.totalAmount : 0)), 0);
    const projectAdvances = projectFinancialRequests
      .filter((request) => request.isProjectAdvance)
      .filter((request) => ['READY_FOR_DISBURSEMENT', ...financialDeliveredStatuses].includes(request.status))
      .reduce((sum, request) => sum + amountOf(request), 0);
    const projectExpenses = projectFinancialRequests
      .filter((request) => !request.isProjectAdvance)
      .filter((request) => financialDeliveredStatuses.includes(request.status))
      .reduce((sum, request) => sum + amountOf(request), 0);
    return {
      currency,
      totalDisbursed: projectExpenses,
      totalAdvances: projectAdvances,
      totalCustomerReceipts: projectCustomerReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0),
      invoiceTotal,
      supplierDebtTotal,
      supplierPaidTotal,
      advanceBalance: Math.max(0, projectAdvances - projectExpenses),
      totalPendingApproval: projectFinancialRequests
        .filter((request) => financialPendingProjectOrFinancialApprovalStatuses.includes(request.status))
        .reduce((sum, request) => sum + amountOf(request), 0),
      totalRequests: projectFinancialRequests.length,
    };
  }, [projectFinancialRequests, projectCustomerReceipts, projectInvoices, projectFinanceForm.currency]);

  const projectWarehouseDisplaySummary = useMemo(() => ({
    dispatchesCount: projectWarehouseSummary?.dispatchesCount ?? new Set(projectWarehouseMaterials.map((row) => row.dispatchId || row.dispatchNo)).size,
    itemsCount: projectWarehouseSummary?.itemsCount ?? projectWarehouseMaterials.length,
    uniqueMaterialsCount: projectWarehouseSummary?.uniqueMaterialsCount ?? new Set(projectWarehouseMaterials.map((row) => row.materialCode || row.materialName).filter(Boolean)).size,
    warehousesCount: projectWarehouseSummary?.warehousesCount ?? new Set(projectWarehouseMaterials.map((row) => row.warehouseName).filter(Boolean)).size,
  }), [projectWarehouseSummary, projectWarehouseMaterials]);

  const projectDocumentSummary = useMemo(() => ({
    total: projectDocuments.length,
    photos: projectDocuments.filter((item) => item.documentType === 'PHOTO').length,
    plans: projectDocuments.filter((item) => item.documentType === 'PLAN').length,
    contracts: projectDocuments.filter((item) => item.documentType === 'CONTRACT').length,
    requirements: projectDocuments.filter((item) => item.documentType === 'REQUIREMENT').length,
  }), [projectDocuments]);

  const projectWorkReportSummary = useMemo(() => ({
    total: projectWorkReports.length,
    submitted: projectWorkReports.filter((report) => report.status === 'SUBMITTED').length,
    approved: projectWorkReports.filter((report) => report.status === 'APPROVED').length,
    rejected: projectWorkReports.filter((report) => report.status === 'REJECTED').length,
  }), [projectWorkReports]);

  const projectSupervisorSummary = useMemo(() => {
    const supervisors = selectedProject?.projectSupervisors || [];
    return {
      total: supervisors.length,
      managers: supervisors.filter((item) => item.role === 'PROJECT_MANAGER').length,
      supervisors: supervisors.filter((item) => item.role !== 'PROJECT_MANAGER').length,
    };
  }, [selectedProject?.projectSupervisors]);

  const resetStageForm = () => {
    setEditingStageId('');
    setStageForm(emptyProjectStageForm);
  };

  const resetTaskForm = () => {
    setEditingTaskId('');
    setTaskForm(emptyProjectTaskForm);
  };

  const syncProjectTeamForm = (project) => {
    setProjectTeamMemberIds((project?.teamMembers || []).map((member) => String(member._id || member.id || member)).filter(Boolean));
    setDailyLaborerForm(emptyDailyLaborerForm);
    setTeamFormMode('');
  };

  const resetDepartmentForm = () => {
    setDepartmentForm(emptyProjectDepartmentForm);
    setDepartmentFormOpen(false);
  };

  const resetSupervisorForm = () => {
    setSupervisorForm(emptyProjectSupervisorForm);
    setSupervisorFormOpen(false);
  };

  const resetProjectFinanceForm = () => {
    setProjectFinanceForm(emptyProjectFinanceForm);
    setProjectFinanceFormOpen(false);
  };

  const resetProjectInvoiceForm = () => {
    setProjectInvoiceForm(emptyProjectInvoiceForm);
    setEditingProjectInvoiceId('');
    setProjectInvoiceFormOpen(false);
  };

  const resetProjectDocumentForm = () => {
    setProjectDocumentForm(emptyProjectDocumentForm);
    setProjectDocumentFormOpen(false);
  };

  const submitProjectStage = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;
    setStageSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        ...stageForm,
        order: stageForm.order ? Number(stageForm.order) : undefined,
        progressPercent: Number(stageForm.progressPercent || 0),
        participants: stageForm.participants || [],
      };
      if (editingStageId) {
        await api.patch(`/projects/${selectedProject._id}/stages/${editingStageId}`, payload);
        setInfo('تم حفظ تعديل المرحلة بنجاح.');
      } else {
        await api.post(`/projects/${selectedProject._id}/stages`, payload);
        setInfo('تمت إضافة المرحلة بنجاح.');
      }
      resetStageForm();
      await loadProjectStages(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المرحلة');
    } finally {
      setStageSaving(false);
    }
  };

  const startEditStage = (stage) => {
    setEditingStageId(stage._id);
    setStageForm({
      name: stage.name || '',
      description: stage.description || '',
      order: stage.order || '',
      plannedStartDate: toDateInput(stage.plannedStartDate),
      plannedEndDate: toDateInput(stage.plannedEndDate),
      actualStartDate: toDateInput(stage.actualStartDate),
      actualEndDate: toDateInput(stage.actualEndDate),
      progressPercent: stage.progressPercent || 0,
      manager: stage.manager?._id || stage.manager || '',
      participants: (stage.participants || []).map((person) => person._id || person).filter(Boolean),
      status: stage.status || 'NOT_STARTED',
      notes: stage.notes || '',
    });
  };

  const updateStageStatus = async (stage, status) => {
    if (!selectedProject) return;
    setStageSaving(true);
    setError('');
    try {
      await api.patch(`/projects/${selectedProject._id}/stages/${stage._id}`, { status });
      await loadProjectStages(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر تحديث حالة المرحلة');
    } finally {
      setStageSaving(false);
    }
  };

  const duplicateStage = async (stage) => {
    if (!selectedProject) return;
    setStageSaving(true);
    setError('');
    try {
      await api.post(`/projects/${selectedProject._id}/stages/${stage._id}/duplicate`, {});
      setInfo('تم نسخ المرحلة بنجاح.');
      await loadProjectStages(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر نسخ المرحلة');
    } finally {
      setStageSaving(false);
    }
  };

  const deleteStage = async (stage) => {
    if (!selectedProject || !window.confirm(`هل تريد حذف مرحلة «${stage.name}»؟ لن يتم الحذف إذا كانت مرتبطة بمهام أو معاملات.`)) return;
    setStageSaving(true);
    setError('');
    try {
      await api.delete(`/projects/${selectedProject._id}/stages/${stage._id}`);
      setInfo('تم حذف المرحلة من المشروع.');
      if (editingStageId === stage._id) resetStageForm();
      await loadProjectStages(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر حذف المرحلة');
    } finally {
      setStageSaving(false);
    }
  };

  const submitProjectTask = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;
    setTaskSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        ...taskForm,
        progressPercent: Number(taskForm.progressPercent || 0),
        estimatedHours: Number(taskForm.estimatedHours || 0),
      };
      if (editingTaskId) {
        await api.patch(`/projects/${selectedProject._id}/tasks/${editingTaskId}`, payload);
        setInfo('تم حفظ تعديل المهمة بنجاح.');
      } else {
        await api.post(`/projects/${selectedProject._id}/tasks`, payload);
        setInfo('تمت إضافة المهمة بنجاح.');
      }
      resetTaskForm();
      await loadProjectTasks(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المهمة');
    } finally {
      setTaskSaving(false);
    }
  };

  const startEditTask = (task) => {
    setEditingTaskId(task._id);
    setTaskForm({
      title: task.title || '',
      description: task.description || '',
      stage: task.stage?._id || task.stage || '',
      priority: task.priority || 'MEDIUM',
      startDate: toDateInput(task.startDate),
      dueDate: toDateInput(task.dueDate),
      progressPercent: task.progressPercent || 0,
      status: task.status || 'NEW',
      assignees: (task.assignees || []).map((person) => person._id || person).filter(Boolean),
      teamLeader: task.teamLeader?._id || task.teamLeader || '',
      estimatedHours: task.estimatedHours || 0,
      location: task.location || '',
      notes: task.notes || '',
    });
  };

  const deleteTask = async (task) => {
    if (!selectedProject || !window.confirm(`هل تريد حذف مهمة «${task.title}» من المشروع؟`)) return;
    setTaskSaving(true);
    setError('');
    try {
      await api.delete(`/projects/${selectedProject._id}/tasks/${task._id}`);
      setInfo('تم حذف المهمة من المشروع.');
      if (editingTaskId === task._id) resetTaskForm();
      await loadProjectTasks(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر حذف المهمة');
    } finally {
      setTaskSaving(false);
    }
  };

  const fillTaskFromDailyPlan = (plan) => {
    const stageId = plan.stage?._id || plan.stage || '';
    const taskId = plan.task?._id || plan.task || '';
    const linkedTask = taskId ? projectTasks.find((task) => String(task._id) === String(taskId)) : null;
    if (linkedTask) {
      startEditTask(linkedTask);
      setInfo('تم فتح المهمة المرتبطة بهذا البلان للتعديل.');
      setDailyPlanTaskPickerOpen(false);
      setActiveProjectTab('tasks');
      return;
    }

    setEditingTaskId('');
    setTaskForm({
      ...emptyProjectTaskForm,
      title: plan.title || '',
      description: plan.description || '',
      stage: stageId,
      priority: plan.priority || 'MEDIUM',
      startDate: toDateInput(plan.planDate),
      dueDate: toDateInput(plan.dueAt || plan.planDate),
      progressPercent: plan.progressPercent || 0,
      status: plan.status === 'COMPLETED' ? 'COMPLETED' : plan.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NEW',
      assignees: (plan.assignees || []).map((item) => item.user?._id || item.user?.id || item.user).filter(Boolean),
      teamLeader: plan.teamLeader?._id || plan.teamLeader || '',
      location: plan.location || '',
      notes: plan.adminNotes || '',
    });
    setInfo('تم تعبئة نموذج المهمة من بلان العمل اليومي. يمكنك مراجعته ثم حفظه.');
    setDailyPlanTaskPickerOpen(false);
    setActiveProjectTab('tasks');
  };

  const saveProjectTeam = async (nextDailyLaborers = selectedProject?.dailyLaborers || []) => {
    if (!selectedProject) return;
    setProjectTeamSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        teamMembers: projectTeamMemberIds,
        dailyLaborers: (nextDailyLaborers || []).map((laborer) => ({
          _id: laborer._id,
          fullName: laborer.fullName || '',
          phone: laborer.phone || '',
          jobTitle: laborer.jobTitle || '',
          dailyWage: Number(laborer.dailyWage || 0),
          currency: laborer.currency || 'IQD',
          startDate: toDateInput(laborer.startDate),
          notes: laborer.notes || '',
          active: laborer.active !== false,
          addedBy: laborer.addedBy?._id || laborer.addedBy || '',
          addedAt: laborer.addedAt || '',
        })),
      };
      const response = await api.patch(`/projects/${selectedProject._id}/team`, payload);
      setSelectedProject(response.project);
      setProjects((items) => items.map((project) => (project._id === response.project._id ? response.project : project)));
      syncProjectTeamForm(response.project);
      setInfo('تم حفظ كادر المشروع بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر حفظ كادر المشروع');
    } finally {
      setProjectTeamSaving(false);
    }
  };

  const addDailyLaborer = async (event) => {
    event.preventDefault();
    if (!dailyLaborerForm.fullName.trim()) {
      setError('اسم موظف الأجر اليومي مطلوب');
      return;
    }
    await saveProjectTeam([...(selectedProject?.dailyLaborers || []), dailyLaborerForm]);
  };

  const removeDailyLaborer = async (laborerId) => {
    if (!selectedProject || !window.confirm('هل تريد إزالة موظف الأجر اليومي من هذا المشروع؟')) return;
    await saveProjectTeam((selectedProject.dailyLaborers || []).filter((laborer) => String(laborer._id) !== String(laborerId)));
  };

  const saveProjectDepartments = async (nextDepartments) => {
    if (!selectedProject) return;
    setProjectDepartmentSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/projects/${selectedProject._id}/departments`, {
        projectDepartments: (nextDepartments || []).map((department) => ({
          _id: department._id,
          name: department.name || '',
          description: department.description || '',
          manager: department.manager?._id || department.manager || '',
          members: (department.members || []).map((member) => member._id || member.id || member).filter(Boolean),
          notes: department.notes || '',
          active: department.active !== false,
          addedBy: department.addedBy?._id || department.addedBy || '',
          addedAt: department.addedAt || '',
        })),
      });
      setSelectedProject(response.project);
      setProjects((items) => items.map((project) => (project._id === response.project._id ? response.project : project)));
      setInfo('تم حفظ أقسام المشروع بنجاح.');
      resetDepartmentForm();
    } catch (err) {
      setError(err.message || 'تعذر حفظ أقسام المشروع');
    } finally {
      setProjectDepartmentSaving(false);
    }
  };

  const addProjectDepartment = async (event) => {
    event.preventDefault();
    if (!departmentForm.name.trim()) {
      setError('اسم القسم مطلوب');
      return;
    }
    await saveProjectDepartments([...(selectedProject?.projectDepartments || []), departmentForm]);
  };

  const removeProjectDepartment = async (departmentId) => {
    if (!selectedProject || !window.confirm('هل تريد إزالة هذا القسم من المشروع؟')) return;
    await saveProjectDepartments((selectedProject.projectDepartments || []).filter((department) => String(department._id) !== String(departmentId)));
  };

  const saveProjectSupervisors = async (nextSupervisors) => {
    if (!selectedProject) return;
    setProjectSupervisorSaving(true);
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/projects/${selectedProject._id}/supervisors`, {
        projectSupervisors: (nextSupervisors || []).map((supervisor) => ({
          _id: supervisor._id,
          employee: supervisor.employee?._id || supervisor.employee?.id || supervisor.employee || '',
          role: supervisor.role || 'SUPERVISOR',
          title: supervisor.title || '',
          notes: supervisor.notes || '',
          active: supervisor.active !== false,
          addedBy: supervisor.addedBy?._id || supervisor.addedBy || '',
          addedAt: supervisor.addedAt || '',
        })),
      });
      setSelectedProject(response.project);
      setProjects((items) => items.map((project) => (project._id === response.project._id ? response.project : project)));
      setInfo('تم حفظ مسؤولي المشروع بنجاح.');
      resetSupervisorForm();
    } catch (err) {
      setError(err.message || 'تعذر حفظ مسؤولي المشروع');
    } finally {
      setProjectSupervisorSaving(false);
    }
  };

  const addProjectSupervisor = async (event) => {
    event.preventDefault();
    if (!supervisorForm.employee) {
      setError('اختر الموظف المسؤول من قائمة الموظفين.');
      return;
    }
    const selectedEmployee = stageEmployeeOptions.find((person) => String(person.id) === String(supervisorForm.employee));
    await saveProjectSupervisors([
      ...(selectedProject?.projectSupervisors || []),
      {
        ...supervisorForm,
        title: supervisorForm.title || (supervisorForm.role === 'PROJECT_MANAGER' ? 'مدير مشروع' : 'مسؤول مشروع'),
        employee: selectedEmployee?._id || selectedEmployee?.id || supervisorForm.employee,
      },
    ]);
  };

  const removeProjectSupervisor = async (supervisorId) => {
    if (!selectedProject || !window.confirm('هل تريد إزالة هذا المسؤول من المشروع؟')) return;
    await saveProjectSupervisors((selectedProject.projectSupervisors || []).filter((supervisor) => String(supervisor._id) !== String(supervisorId)));
  };

  const openDailyPlanForTask = (task) => {
    if (!selectedProject) return;
    const customer = selectedProject.customer || {};
    setError('');
    setInfo('');
    setPlanForm({
      project: { _id: selectedProject._id },
      stage: task.stage?._id || task.stage || '',
      task: task._id,
      customer: customer._id || customer.id || '',
      customerName: customer.name || selectedProject.clientName || '',
      customerSnapshot: {
        phone: customer.phone || selectedProject.clientPhone || '',
        whatsapp: customer.whatsapp || customer.phone || selectedProject.clientPhone || '',
      },
      location: task.location || selectedProject.location || '',
      planDate: toDateInput(task.startDate || new Date()),
      title: task.title || '',
      description: task.description || task.notes || '',
      assignees: (task.assignees || []).map((person) => ({ user: person._id || person })),
      teamLeader: task.teamLeader?._id || task.teamLeader || '',
    });
  };

  const saveDailyPlan = async (dailyPlanForm) => {
    setPlanSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post('/daily-work-plans', buildDailyWorkPlanFormData(dailyPlanForm));
      setPlanForm(null);
      setInfo('تم إنشاء بلان العمل وربطه بالمشروع، وسيظهر أيضاً في قائمة بلان العمل اليومي.');
      setCalendarDate(dailyPlanForm.planDate || '');
      setCalendarMonth(monthAnchor(dailyPlanForm.planDate || new Date()));
      setPlansRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'تعذر إنشاء بلان العمل اليومي');
    } finally {
      setPlanSaving(false);
    }
  };

  const submitProjectFinance = async (event, mode = 'draft') => {
    event?.preventDefault?.();
    if (!selectedProject) return;
    if (!projectFinanceForm.amount || !projectFinanceForm.description.trim()) {
      setError('يرجى إدخال المبلغ ووصف طلب الصرف.');
      return;
    }

    setProjectFinanceSaving(true);
    setError('');
    setInfo('');

    try {
      const formData = new FormData();
      formData.append('project', selectedProject._id);
      formData.append('currency', projectFinanceForm.currency || 'IQD');
      formData.append('requestType', projectFinanceForm.requestType || 'MATERIALS_EXPENSE');
      formData.append('amount', String(projectFinanceForm.amount || ''));
      formData.append('description', projectFinanceForm.description || '');
      formData.append('notes', projectFinanceForm.notes || '');
      if (projectFinanceForm.transactionDate) {
        formData.append('transactionDate', projectFinanceForm.transactionDate);
      }
      if (mode === 'submit') {
        formData.append('submitNow', 'true');
      }
      (projectFinanceForm.files || []).forEach((file) => {
        formData.append('attachments', file);
      });

      await api.postWithProgress('/financial-disbursements', formData, { timeoutMs: 8 * 60 * 1000 });
      setInfo(mode === 'submit'
        ? 'تم إرسال طلب الصرف وربطه بمالية المشروع.'
        : 'تم حفظ طلب الصرف وربطه بمالية المشروع.');
      resetProjectFinanceForm();
      await loadProjectFinance(selectedProject._id);
    } catch (err) {
      setError(err.message || 'تعذر حفظ صرف المشروع');
    } finally {
      setProjectFinanceSaving(false);
    }
  };

  const exportProjectFinanceExcel = async () => {
    if (!selectedProject) return;
    try {
      const blob = await api.downloadBlob(`/financial-disbursements/export/excel?project=${encodeURIComponent(selectedProject._id)}`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `project-finance-${selectedProject.code || selectedProject.name || selectedProject._id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'فشل تصدير مالية المشروع Excel');
    }
  };

  const exportProjectWarehouseExcel = async () => {
    if (!selectedProject) return;
    try {
      const blob = await api.downloadBlob(`/projects/${selectedProject._id}/warehouse/materials/export/excel`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `project-warehouse-${selectedProject.code || selectedProject.name || selectedProject._id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'فشل تصدير مخزن المشروع Excel');
    }
  };

  const submitProjectDocuments = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;
    if (!projectDocumentForm.files.length) {
      setError('اختر ملفًا واحدًا على الأقل لرفعه ضمن مستندات المشروع.');
      return;
    }

    setProjectDocumentSaving(true);
    setError('');
    setInfo('');

    try {
      const formData = new FormData();
      formData.append('documentType', projectDocumentForm.documentType || 'OTHER');
      formData.append('title', projectDocumentForm.title || '');
      formData.append('notes', projectDocumentForm.notes || '');
      projectDocumentForm.files.forEach((file) => formData.append('documents', file));
      const response = await api.postWithProgress(`/projects/${selectedProject._id}/documents`, formData, { timeoutMs: 8 * 60 * 1000 });
      setProjectDocuments(response.documents || []);
      if (response.project) {
        setSelectedProject(response.project);
        setProjects((items) => items.map((project) => (project._id === response.project._id ? response.project : project)));
      }
      setInfo('تم رفع مستندات المشروع بنجاح.');
      resetProjectDocumentForm();
    } catch (err) {
      setError(err.message || 'تعذر رفع مستندات المشروع');
    } finally {
      setProjectDocumentSaving(false);
    }
  };

  const deleteProjectDocument = async (document) => {
    if (!selectedProject || !window.confirm(`هل تريد حذف المستند «${document.title || document.originalName || 'مستند'}»؟`)) return;
    setError('');
    setInfo('');
    try {
      const response = await api.delete(`/projects/${selectedProject._id}/documents/${document._id}`);
      setProjectDocuments(response.documents || []);
      if (response.project) {
        setSelectedProject(response.project);
        setProjects((items) => items.map((project) => (project._id === response.project._id ? response.project : project)));
      }
      setInfo('تم حذف المستند من المشروع.');
    } catch (err) {
      setError(err.message || 'تعذر حذف مستند المشروع');
    }
  };

  const submitProjectInvoice = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;
    if (!projectInvoiceForm.materialType.trim() || !projectInvoiceForm.invoiceNo.trim() || !projectInvoiceForm.invoiceAmount) {
      setError('يرجى إدخال نوع المواد ورقم الفاتورة ومبلغ الفاتورة.');
      return;
    }
    if (!projectInvoiceForm.supplier && !projectInvoiceForm.supplierName.trim()) {
      setError('اختر المورد من القائمة أو اكتب اسم مورد خارجي.');
      return;
    }

    setProjectInvoiceSaving(true);
    setError('');
    setInfo('');

    try {
      const selectedSupplier = suppliers.find((supplier) => String(supplier._id || supplier.id) === String(projectInvoiceForm.supplier));
      const formData = new FormData();
      formData.append('supplier', projectInvoiceForm.supplier || '');
      formData.append('supplierName', projectInvoiceForm.supplierName || selectedSupplier?.supplierName || selectedSupplier?.companyName || '');
      formData.append('materialType', projectInvoiceForm.materialType || '');
      formData.append('invoiceNo', projectInvoiceForm.invoiceNo || '');
      formData.append('invoiceAmount', String(projectInvoiceForm.invoiceAmount || ''));
      formData.append('transportAmount', String(projectInvoiceForm.transportAmount || 0));
      formData.append('invoiceDate', projectInvoiceForm.invoiceDate || '');
      formData.append('currency', projectInvoiceForm.currency || 'IQD');
      formData.append('paymentMethod', projectInvoiceForm.paymentMethod || 'CREDIT');
      formData.append('paidAmount', String(projectInvoiceForm.paymentMethod === 'PARTIAL' ? projectInvoiceForm.paidAmount || 0 : 0));
      formData.append('notes', projectInvoiceForm.notes || '');
      if (projectInvoiceForm.originalInvoice) {
        formData.append('originalInvoice', projectInvoiceForm.originalInvoice);
      }

      if (editingProjectInvoiceId) {
        await api.patch(`/projects/${selectedProject._id}/invoices/${editingProjectInvoiceId}`, formData);
        setInfo('تم حفظ تعديل الفاتورة.');
      } else {
        await api.post(`/projects/${selectedProject._id}/invoices`, formData);
        setInfo('تمت إضافة الفاتورة وربطها بمالية المشروع.');
      }
      resetProjectInvoiceForm();
      const response = await api.get(`/projects/${selectedProject._id}/invoices`);
      setProjectInvoices(response.invoices || []);
    } catch (err) {
      setError(err.message || 'تعذر حفظ فاتورة المشروع');
    } finally {
      setProjectInvoiceSaving(false);
    }
  };

  const startEditProjectInvoice = (invoice) => {
    setEditingProjectInvoiceId(invoice._id || invoice.id);
    setProjectInvoiceForm({
      supplier: invoice.supplier?._id || invoice.supplier?.id || invoice.supplier || '',
      supplierName: invoice.supplierName || '',
      materialType: invoice.materialType || '',
      invoiceNo: invoice.invoiceNo || '',
      invoiceAmount: invoice.invoiceAmount || '',
      transportAmount: invoice.transportAmount || '',
      invoiceDate: toDateInput(invoice.invoiceDate),
      currency: invoice.currency || 'IQD',
      paymentMethod: invoice.paymentMethod || 'CREDIT',
      paidAmount: invoice.paidAmount || '',
      notes: invoice.notes || '',
      originalInvoice: null,
    });
    setProjectInvoiceFormOpen(true);
    setActiveProjectTab('invoices');
  };

  const downloadProjectInvoicePdf = async (invoice) => {
    if (!selectedProject) return;
    try {
      const invoiceId = invoice._id || invoice.id;
      const blob = await api.downloadBlob(`/projects/${selectedProject._id}/invoices/${invoiceId}/pdf`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `project-invoice-${invoice.invoiceNo || invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'فشل تصدير الفاتورة PDF');
    }
  };

  const downloadProjectCustomerReceiptPdf = async (receipt) => {
    try {
      const blob = await api.downloadBlob(`/customer-receipts/${receipt.id}/pdf`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `customer-receipt-${receipt.receiptNo || receipt.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'فشل تصدير سند الاستلام PDF');
    }
  };

  const resolveWorkReportOwnerId = (report) => String(report?.user?._id || report?.user?.id || report?.user || '');
  const isOwnWorkReport = (report) => resolveWorkReportOwnerId(report) === currentUserId;
  const canEditProjectWorkReport = (report) => {
    if (!report) return false;
    return isOwnWorkReport(report) || user?.role === 'GENERAL_MANAGER' || (canApproveProjectWorkReports && !isOwnWorkReport(report));
  };
  const canDeleteProjectWorkReport = (report) => {
    if (!report) return false;
    if (report.status === 'APPROVED') return user?.role === 'GENERAL_MANAGER';
    return isOwnWorkReport(report) || user?.role === 'GENERAL_MANAGER';
  };
  const canDirectApproveProjectWorkReport = (report) => {
    return Boolean(report && report.status === 'SUBMITTED' && canApproveProjectWorkReports && !isOwnWorkReport(report));
  };

  const openProjectWorkReport = (report, mode = 'view') => {
    const reportId = encodeURIComponent(String(report?._id || ''));
    if (!reportId) return;
    window.location.href = mode === 'edit'
      ? `/work-reports?reportId=${reportId}&mode=edit`
      : `/work-reports?reportId=${reportId}`;
  };

  const openProjectWorkReportPdf = async (report) => {
    if (!report?._id) return;
    setError('');
    try {
      const blob = await api.get(`/work-reports/${report._id}/pdf?regenerate=1`);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err.message || 'تعذر فتح PDF لتقرير العمل');
    }
  };

  const approveProjectWorkReport = async (report) => {
    if (!canDirectApproveProjectWorkReport(report)) return;
    setWorkReportActionId(String(report._id));
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${report._id}/approve`, {
        pointsByUser: buildWorkReportApprovalPayload(buildWorkReportApprovalPointsMap(report)),
      });
      setInfo('تم اعتماد تقرير العمل المرتبط بالمشروع بنجاح.');
      await loadProjectWorkReports(selectedProject);
    } catch (err) {
      setError(err.message || 'فشل اعتماد تقرير العمل');
    } finally {
      setWorkReportActionId('');
    }
  };

  const rejectProjectWorkReport = async (report) => {
    if (!canDirectApproveProjectWorkReport(report)) return;
    const reason = window.prompt('اكتب سبب رفض تقرير العمل:');
    if (reason === null) return;
    setWorkReportActionId(String(report._id));
    setError('');
    setInfo('');
    try {
      await api.patch(`/work-reports/${report._id}/reject`, { reason, managerComment: reason });
      setInfo('تم رفض تقرير العمل وإرسال الملاحظة للموظف.');
      await loadProjectWorkReports(selectedProject);
    } catch (err) {
      setError(err.message || 'فشل رفض تقرير العمل');
    } finally {
      setWorkReportActionId('');
    }
  };

  const deleteProjectWorkReport = async (report) => {
    if (!canDeleteProjectWorkReport(report)) return;
    const title = report.title || report.projectName || 'تقرير عمل';
    if (!window.confirm(`هل تريد حذف «${title}»؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setWorkReportActionId(String(report._id));
    setError('');
    setInfo('');
    try {
      await api.delete(`/work-reports/${report._id}`);
      setInfo('تم حذف تقرير العمل من سجل المشروع.');
      await loadProjectWorkReports(selectedProject);
    } catch (err) {
      setError(err.message || 'فشل حذف تقرير العمل');
    } finally {
      setWorkReportActionId('');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.workCategories.length) {
      setError('اختر تصنيفًا واحدًا على الأقل لنوع أعمال المشروع');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        budget: Number(form.budget),
      };
      if (editingId) await api.patch(`/projects/${editingId}`, payload);
      else await api.post('/projects', payload);
      setForm(emptyProjectForm);
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء المشروع');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (project) => {
    setEditingId(project._id);
    setForm({
      name: project.name || '',
      code: project.code || '',
      customerId: project.customer?._id || project.customer || '',
      workCategories: project.workCategories || [],
      description: project.description || '',
      budget: project.budget || 0,
      startDate: toDateInput(project.startDate),
      endDate: toDateInput(project.endDate),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleWorkCategory = (category) => {
    setForm((previous) => ({
      ...previous,
      workCategories: previous.workCategories.includes(category)
        ? previous.workCategories.filter((item) => item !== category)
        : [...previous.workCategories, category],
    }));
  };

  const cancelEdit = () => {
    setEditingId('');
    setForm(emptyProjectForm);
  };

  const deleteProject = async (project) => {
    if (!window.confirm(`هل تريد حذف المشروع «${project.name}» من القائمة؟ ستبقى السجلات والذمم التاريخية محفوظة.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/projects/${project._id}`);
      if (editingId === project._id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'تعذر حذف المشروع');
    } finally {
      setSaving(false);
    }
  };

  const openProjectDetails = (project) => {
    setSelectedProject(project);
    setActiveProjectTab('stages');
    setProjectPlans([]);
    setProjectStages([]);
    setProjectTasks([]);
    setProjectWorkReports([]);
    resetStageForm();
    resetTaskForm();
    syncProjectTeamForm(project);
    resetDepartmentForm();
    setDailyPlanTaskPickerOpen(false);
    setCalendarMonth(monthAnchor(new Date()));
    setCalendarDate('');
  };

  const projectActionButtons = (project) => (
    <div className="form-actions daily-plan-actions project-plan-card-actions">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => openProjectDetails(project)}>لوحة تحكم المشروع</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { window.location.href = `/project-custodies?projectId=${project._id}`; }}>المواد وذمة المشروع</button>
      {canCreateDailyPlan ? <button type="button" className="btn btn-primary btn-sm" onClick={() => openDailyPlanForm(project)}>إضافة بلان</button> : null}
      {canManage ? <button type="button" className="btn btn-primary btn-sm" onClick={() => sendProjectToWhatsApp(project)}>واتساب</button> : null}
      {canManage ? <button type="button" className="btn btn-primary btn-sm" onClick={() => startEdit(project)} disabled={saving}>تعديل</button> : null}
      {canManage ? <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteProject(project)} disabled={saving}>حذف</button> : null}
    </div>
  );

  const sendProjectToWhatsApp = (project) => {
    const ownerName = project.owner?.fullName || 'صاحب المشروع';
    const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString('ar-IQ') : '-';
    const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString('ar-IQ') : '-';
    const message = [
      '[ مشروع - Delta Plus ]',
      '----------------------------------',
      `السلام عليكم ${ownerName}،`,
      '',
      'تفاصيل المشروع:',
      `- اسم المشروع: ${project.name || '-'}`,
      `- الكود: ${project.code || '-'}`,
      `- الحالة الحالية: ${statusLabel[project.status] || project.status || '-'}`,
      `- الميزانية: ${project.budget || 0}`,
      `- تاريخ البداية: ${startDate}`,
      `- تاريخ النهاية: ${endDate}`,
      `- الوصف: ${project.description || '-'}`,
      '----------------------------------',
      'يرجى مراجعة التفاصيل وتأكيد الاستلام.',
      '[ صادر من نظام Delta Plus ]',
    ].join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--success)' }}>{info}</section> : null}

      {canManage ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>{editingId ? 'تعديل المشروع' : 'إضافة مشروع جديد'}</h2>
          <form className="grid-3" onSubmit={submit}>
            <label>
              اسم المشروع
              <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>

            <label>
              الكود
              <input className="input" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
            </label>

            <label>
              اسم الزبون
              <select className="select" value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} required>
                <option value="">اختر الزبون من القائمة</option>
                {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ''}</option>)}
              </select>
            </label>

            <label>
              الميزانية
              <input className="input" type="number" min={0} value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} />
            </label>

            <label>
              تاريخ البداية
              <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            </label>

            <label>
              تاريخ النهاية
              <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
            </label>

            <label className="grid-span-full">
              الوصف
              <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </label>

            <div className="grid-span-full">
              <p style={{ margin: '0 0 8px' }}>تصنيفات المشروع / نوع الأعمال</p>
              <div className="inline-checks">
                {projectWorkCategories.map((category) => (
                  <label key={category} className="checkbox-row">
                    <input type="checkbox" checked={form.workCategories.includes(category)} onChange={() => toggleWorkCategory(category)} />
                    {category}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إنشاء المشروع مباشرة'}</button>
              {editingId ? <button className="btn btn-soft" type="button" onClick={cancelEdit} disabled={saving}>إلغاء التعديل</button> : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="card section">
        <div className="section-header">
          <div><h2>قائمة المشاريع</h2><p>عرض المشاريع ككروت أو جدول مع ملف العمل اليومي لكل مشروع.</p></div>
          <div className="form-actions">
            <button type="button" className={`btn ${view === 'cards' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setView('cards')}>كروت</button>
            <button type="button" className={`btn ${view === 'table' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setView('table')}>جدول</button>
          </div>
        </div>

        {view === 'cards' ? (
          <div className="project-card-grid">
            {projects.map((project) => (
              <article className="project-card" key={project._id}>
                <header className="project-card-header">
                  <div className="project-card-identity">
                    <span className="project-code" dir="ltr">{project.code}</span>
                    <h3>{project.name}</h3>
                    <p>{project.customer?.name || project.clientName || 'بدون زبون'}</p>
                  </div>
                  <span className={`status-pill ${statusClass[project.status] || 'status-todo'}`}>{statusLabel[project.status] || project.status}</span>
                </header>
                <div className="project-card-info">
                  <div><span>مدير المشروع</span><strong>{project.projectManager?.fullName || project.owner?.fullName || '-'}</strong></div>
                  <div><span>الميزانية</span><strong className="project-budget" dir="ltr">{Number(project.budget || 0).toLocaleString('en-US')}</strong></div>
                  <div><span>تاريخ البداية</span><strong dir="ltr">{project.startDate ? toDateInput(project.startDate) : '-'}</strong></div>
                  <div><span>تاريخ الانتهاء</span><strong dir="ltr">{project.endDate ? toDateInput(project.endDate) : '-'}</strong></div>
                </div>
                <div className="project-categories">
                  <span className="project-categories-label">أنواع الأعمال</span>
                  <div className="project-category-list">
                    {(project.workCategories || []).length
                      ? project.workCategories.map((category) => <span className="project-category-chip" key={category}>{category}</span>)
                      : <span className="project-category-empty">غير محدد</span>}
                  </div>
                </div>
                <footer>{projectActionButtons(project)}</footer>
              </article>
            ))}
            {!projects.length ? <p>لا توجد مشاريع مسجلة.</p> : null}
          </div>
        ) : (
        <div style={{ overflowX: 'auto' }}><table className="table">
          <thead>
            <tr>
              <th>المشروع</th>
              <th>المالك</th>
              <th>الحالة</th>
              <th>الميزانية</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              return (
                <tr key={project._id}>
                  <td>
                    <strong>{project.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{project.code} — {project.customer?.name || project.clientName || 'بدون زبون'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{(project.workCategories || []).join('، ') || 'التصنيف غير محدد'}</div>
                  </td>
                  <td>{project.owner?.fullName || '-'}</td>
                  <td>
                    <span className={`status-pill ${statusClass[project.status] || 'status-todo'}`}>
                      {statusLabel[project.status] || project.status}
                    </span>
                  </td>
                  <td>{project.budget || 0}</td>
                  <td>{projectActionButtons(project)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        )}
      </section>

      {selectedProject ? (
        <div className="project-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProject(null)}>
          <section className="project-detail-panel">
            <header className="section-header">
              <div>
                <small>{selectedProject.code}</small>
                <h2>{selectedProject.name}</h2>
                <p>{selectedProject.customer?.name || selectedProject.clientName || '-'} — {(selectedProject.workCategories || []).join('، ') || 'التصنيف غير محدد'}</p>
              </div>
              <button type="button" className="btn btn-soft" onClick={() => setSelectedProject(null)}>إغلاق</button>
            </header>
            <div className="project-detail-summary">
              <div><span>الحالة</span><strong>{statusLabel[selectedProject.status] || selectedProject.status}</strong></div>
              <div><span>مدير المشروع</span><strong>{selectedProject.projectManager?.fullName || selectedProject.owner?.fullName || '-'}</strong></div>
              <div><span>عدد المراحل</span><strong>{projectStages.length}</strong></div>
              <div><span>إنجاز المراحل</span><strong dir="ltr">{averageStageProgress}%</strong></div>
              <div><span>عدد خطط الشهر</span><strong>{projectPlans.length}</strong></div>
              <div><span>الميزانية</span><strong dir="ltr">{Number(selectedProject.budget || 0).toLocaleString('en-US')}</strong></div>
            </div>

            <nav className="project-dashboard-tabs" aria-label="تبويبات لوحة المشروع">
              {projectDashboardTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`project-dashboard-tab ${activeProjectTab === tab.id ? 'project-dashboard-tab-active' : ''}`}
                  onClick={() => setActiveProjectTab(tab.id)}
                >
                  <span>{tab.icon}</span>
                  <strong>{tab.label}</strong>
                </button>
              ))}
            </nav>

            {activeProjectTab === 'overview' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>نظرة عامة</h3>
                    <p>ملخص سريع للمشروع قبل الدخول إلى التفاصيل.</p>
                  </div>
                </div>
                <div className="project-overview-grid">
                  <div><span>نسبة الإنجاز</span><strong dir="ltr">{averageStageProgress}%</strong></div>
                  <div><span>المراحل</span><strong>{projectStages.length}</strong></div>
                  <div><span>خطط الشهر</span><strong>{projectPlans.length}</strong></div>
                  <div><span>الحالة</span><strong>{statusLabel[selectedProject.status] || selectedProject.status}</strong></div>
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'stages' ? (
            <section className="project-dashboard-section">
              <div className="section-header project-dashboard-header">
                <div>
                  <h3>مراحل المشروع</h3>
                  <p>إدارة مراحل المشروع مع نسبة الإنجاز والمسؤولين والمشاركين.</p>
                </div>
                <div className="project-stage-weight">
                  <span>متوسط الإنجاز</span>
                  <strong dir="ltr">{averageStageProgress}%</strong>
                </div>
              </div>

              <div className="project-stage-progress">
                <span style={{ width: `${Math.min(averageStageProgress, 100)}%` }} />
              </div>

              {canManageStages ? (
                <form className="project-stage-form" onSubmit={submitProjectStage}>
                  <label>
                    اسم المرحلة
                    <input className="input" value={stageForm.name} onChange={(e) => setStageForm((p) => ({ ...p, name: e.target.value }))} required />
                  </label>
                  <label>
                    الترتيب
                    <input className="input" type="number" min={1} value={stageForm.order} onChange={(e) => setStageForm((p) => ({ ...p, order: e.target.value }))} placeholder="تلقائي" />
                  </label>
                  <label>
                    الإنجاز %
                    <input className="input" type="number" min={0} max={100} value={stageForm.progressPercent} onChange={(e) => setStageForm((p) => ({ ...p, progressPercent: e.target.value }))} />
                  </label>
                  <label>
                    الحالة
                    <select className="select" value={stageForm.status} onChange={(e) => setStageForm((p) => ({ ...p, status: e.target.value }))}>
                      {Object.entries(stageStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    مسؤول المرحلة
                    <select className="select" value={stageForm.manager} onChange={(e) => setStageForm((p) => ({ ...p, manager: e.target.value }))}>
                      <option value="">بدون تحديد</option>
                      {stageEmployeeOptions.map((person) => <option key={person._id || person.id} value={person._id || person.id}>{person.fullName || person.name || '-'}</option>)}
                    </select>
                  </label>
                  <label>
                    بداية مخططة
                    <input className="input" type="date" value={stageForm.plannedStartDate} onChange={(e) => setStageForm((p) => ({ ...p, plannedStartDate: e.target.value }))} />
                  </label>
                  <label>
                    نهاية مخططة
                    <input className="input" type="date" value={stageForm.plannedEndDate} onChange={(e) => setStageForm((p) => ({ ...p, plannedEndDate: e.target.value }))} />
                  </label>
                  <label>
                    بداية فعلية
                    <input className="input" type="date" value={stageForm.actualStartDate} onChange={(e) => setStageForm((p) => ({ ...p, actualStartDate: e.target.value }))} />
                  </label>
                  <label>
                    نهاية فعلية
                    <input className="input" type="date" value={stageForm.actualEndDate} onChange={(e) => setStageForm((p) => ({ ...p, actualEndDate: e.target.value }))} />
                  </label>
                  <div className="project-stage-wide project-stage-assignee-picker">
                    <DailyWorkPlanAssigneePicker
                      users={stageEmployeeOptions}
                      selectedIds={stageForm.participants}
                      onChange={(participantIds) => setStageForm((p) => ({ ...p, participants: participantIds }))}
                      title="الموظفون المشاركون في المرحلة"
                      hint="اختر موظفًا أو أكثر لهذه المرحلة من قائمة الموظفين، مع إمكانية البحث وتحديد الظاهر وإزالة المختارين بسهولة."
                    />
                  </div>
                  <label className="project-stage-wide">
                    وصف المرحلة
                    <textarea className="textarea" rows={2} value={stageForm.description} onChange={(e) => setStageForm((p) => ({ ...p, description: e.target.value }))} />
                  </label>
                  <label className="project-stage-wide">
                    الملاحظات
                    <textarea className="textarea" rows={2} value={stageForm.notes} onChange={(e) => setStageForm((p) => ({ ...p, notes: e.target.value }))} />
                  </label>
                  <div className="form-actions project-stage-wide">
                    <button className="btn btn-primary" type="submit" disabled={stageSaving}>{stageSaving ? 'جارٍ الحفظ...' : editingStageId ? 'حفظ المرحلة' : 'إضافة مرحلة'}</button>
                    {editingStageId ? <button type="button" className="btn btn-soft" onClick={resetStageForm} disabled={stageSaving}>إلغاء التعديل</button> : null}
                  </div>
                </form>
              ) : null}

              <div className="project-stage-toolbar">
                <select className="select" value={stageStatusFilter} onChange={(e) => setStageStatusFilter(e.target.value)}>
                  <option value="">كل الحالات</option>
                  {Object.entries(stageStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" className="btn btn-soft" onClick={() => loadProjectStages(selectedProject._id)} disabled={stagesLoading}>تحديث المراحل</button>
              </div>

              <div className="project-stage-list">
                {stagesLoading ? <p>جارٍ تحميل المراحل...</p> : null}
                {!stagesLoading && !projectStages.length ? <p>لا توجد مراحل مسجلة لهذا المشروع.</p> : null}
                {projectStages.map((stage) => (
                  <article className="project-stage-item" key={stage._id}>
                    <header>
                      <div>
                        <small>#{stage.order || '-'}</small>
                        <h4>{stage.name}</h4>
                        <p>{stage.description || 'بدون وصف'}</p>
                      </div>
                      <span className={`status-pill ${stageStatusClass[stage.status] || 'status-todo'}`}>{stageStatusLabel[stage.status] || stage.status}</span>
                    </header>
                    <div className="project-stage-metrics">
                      <div><span>الإنجاز</span><strong dir="ltr">{stage.progressPercent || 0}%</strong></div>
                      <div><span>المسؤول</span><strong>{stage.manager?.fullName || '-'}</strong></div>
                      <div><span>المشاركون</span><strong>{(stage.participants || []).length}</strong></div>
                    </div>
                    <div className="project-stage-progress compact">
                      <span style={{ width: `${Math.min(Number(stage.progressPercent || 0), 100)}%` }} />
                    </div>
                    <div className="project-stage-dates">
                      <span>مخطط: {toDateInput(stage.plannedStartDate) || '-'} إلى {toDateInput(stage.plannedEndDate) || '-'}</span>
                      <span>فعلي: {toDateInput(stage.actualStartDate) || '-'} إلى {toDateInput(stage.actualEndDate) || '-'}</span>
                    </div>
                    {canManageStages ? (
                      <footer className="form-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => startEditStage(stage)} disabled={stageSaving}>تعديل</button>
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => updateStageStatus(stage, 'STOPPED')} disabled={stageSaving || stage.status === 'STOPPED'}>إيقاف</button>
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => duplicateStage(stage)} disabled={stageSaving}>نسخ</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteStage(stage)} disabled={stageSaving}>حذف</button>
                      </footer>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            ) : null}

            {activeProjectTab === 'timeline' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>الجدول الزمني</h3>
                    <p>بلانات العمل اليومية المرتبطة بالمشروع حسب التقويم.</p>
                  </div>
                </div>
                {canCreateDailyPlan ? (
                  <div className="project-plan-actions">
                    <button type="button" className="btn btn-primary" onClick={() => openDailyPlanForm(selectedProject)}>
                      إضافة بلان عمل يومي
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={!calendarDate}
                      onClick={() => openDailyPlanForm(selectedProject, calendarDate)}
                    >
                      {calendarDate ? `إضافة بلان ليوم ${calendarDate}` : 'اختر يوماً من التقويم لإضافة بلان'}
                    </button>
                  </div>
                ) : null}
                <DailyWorkPlanCalendar
                  open
                  loading={plansLoading}
                  monthDate={calendarMonth}
                  plans={projectPlans}
                  selectedDate={calendarDate}
                  onSelectDate={setCalendarDate}
                  onChangeMonth={(value) => { setCalendarMonth(monthAnchor(value)); setCalendarDate(''); }}
                  onOpenDetails={() => { window.location.href = `/daily-work-plans?project=${selectedProject._id}`; }}
                />
              </section>
            ) : null}

            {activeProjectTab === 'tasks' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>مهام المشروع</h3>
                    <p>إضافة مهام مرتبطة بالمراحل ثم إنشاء بلان عمل يومي مباشرة من المهمة.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <div className="project-stage-weight">
                      <span>عدد المهام</span>
                      <strong>{projectTasks.length}</strong>
                    </div>
                    {canManageProjectTasks ? (
                      <button type="button" className="btn btn-primary" onClick={() => setDailyPlanTaskPickerOpen((value) => !value)}>
                        إضافة مهمة
                      </button>
                    ) : null}
                  </div>
                </div>

                {dailyPlanTaskPickerOpen ? (
                  <div className="project-plan-task-picker">
                    <div className="project-stage-toolbar">
                      <strong>اختيار بلان عمل يومي لتحويله إلى مهمة</strong>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setActiveProjectTab('timeline')}>عرض الجدول الزمني</button>
                    </div>
                    <div className="project-plan-task-list">
                      {projectPlans.length ? projectPlans.map((plan) => (
                        <button key={plan._id} type="button" className="project-plan-task-row" onClick={() => fillTaskFromDailyPlan(plan)}>
                          <span>
                            <strong>{plan.title}</strong>
                            <small>{plan.projectNameSnapshot || selectedProject.name} - {toDateInput(plan.planDate) || '-'}</small>
                          </span>
                          <em>{plan.stage?.name || 'بدون مرحلة'}</em>
                        </button>
                      )) : <p>لا توجد بلانات عمل يومية مرتبطة بهذا المشروع ضمن الشهر المعروض.</p>}
                    </div>
                  </div>
                ) : null}

                {canManageProjectTasks ? (
                  <form className="project-stage-form" onSubmit={submitProjectTask}>
                    <label>
                      عنوان المهمة
                      <input className="input" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required />
                    </label>
                    <label>
                      المرحلة
                      <select className="select" value={taskForm.stage} onChange={(e) => setTaskForm((p) => ({ ...p, stage: e.target.value }))} required>
                        <option value="">اختر المرحلة</option>
                        {projectStages.map((stage) => <option key={stage._id} value={stage._id}>{stage.order ? `${stage.order} - ` : ''}{stage.name}</option>)}
                      </select>
                    </label>
                    <label>
                      الأولوية
                      <select className="select" value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}>
                        {Object.entries(projectTaskPriorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      الحالة
                      <select className="select" value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))}>
                        {Object.entries(projectTaskStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      الإنجاز %
                      <input className="input" type="number" min={0} max={100} value={taskForm.progressPercent} onChange={(e) => setTaskForm((p) => ({ ...p, progressPercent: e.target.value }))} />
                    </label>
                    <label>
                      تاريخ البدء
                      <input className="input" type="date" value={taskForm.startDate} onChange={(e) => setTaskForm((p) => ({ ...p, startDate: e.target.value }))} />
                    </label>
                    <label>
                      الموعد النهائي
                      <input className="input" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} />
                    </label>
                    <label>
                      الوقت المتوقع
                      <input className="input" type="number" min={0} value={taskForm.estimatedHours} onChange={(e) => setTaskForm((p) => ({ ...p, estimatedHours: e.target.value }))} />
                    </label>
                    <label>
                      قائد الفريق
                      <select className="select" value={taskForm.teamLeader} onChange={(e) => setTaskForm((p) => ({ ...p, teamLeader: e.target.value }))}>
                        <option value="">بدون تحديد</option>
                        {stageEmployeeOptions.map((person) => <option key={person.id} value={person.id}>{person.fullName || '-'}</option>)}
                      </select>
                    </label>
                    <label>
                      الموقع
                      <input className="input" value={taskForm.location} onChange={(e) => setTaskForm((p) => ({ ...p, location: e.target.value }))} />
                    </label>
                    <div className="project-stage-wide project-stage-assignee-picker">
                      <DailyWorkPlanAssigneePicker
                        users={stageEmployeeOptions}
                        selectedIds={taskForm.assignees}
                        onChange={(assignees) => setTaskForm((p) => ({ ...p, assignees }))}
                        title="الموظفون المكلفون بالمهمة"
                        hint="اختر موظفًا أو أكثر لتنفيذ هذه المهمة، وسيتم نقلهم تلقائيًا عند إنشاء بلان عمل يومي من المهمة."
                      />
                    </div>
                    <label className="project-stage-wide">
                      وصف المهمة
                      <textarea className="textarea" rows={2} value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} />
                    </label>
                    <label className="project-stage-wide">
                      الملاحظات
                      <textarea className="textarea" rows={2} value={taskForm.notes} onChange={(e) => setTaskForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <div className="form-actions project-stage-wide">
                      <button className="btn btn-primary" type="submit" disabled={taskSaving || !projectStages.length}>{taskSaving ? 'جارٍ الحفظ...' : editingTaskId ? 'حفظ المهمة' : 'إضافة مهمة'}</button>
                      {editingTaskId ? <button type="button" className="btn btn-soft" onClick={resetTaskForm} disabled={taskSaving}>إلغاء التعديل</button> : null}
                    </div>
                  </form>
                ) : null}

                <div className="project-stage-toolbar">
                  <select className="select" value={taskStageFilter} onChange={(e) => setTaskStageFilter(e.target.value)}>
                    <option value="">كل المراحل</option>
                    {projectStages.map((stage) => <option key={stage._id} value={stage._id}>{stage.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-soft" onClick={() => loadProjectTasks(selectedProject._id)} disabled={tasksLoading}>تحديث المهام</button>
                </div>

                <div className="project-stage-list">
                  {tasksLoading ? <p>جارٍ تحميل المهام...</p> : null}
                  {!tasksLoading && !projectTasks.length ? <p>لا توجد مهام مسجلة لهذا المشروع.</p> : null}
                  {projectTasks.map((task) => (
                    <article className="project-stage-item" key={task._id}>
                      <header>
                        <div>
                          <small>{task.stage?.name || 'بدون مرحلة'}</small>
                          <h4>{task.title}</h4>
                          <p>{task.description || 'بدون وصف'}</p>
                        </div>
                        <span className={`status-pill ${stageStatusClass[task.status === 'COMPLETED' ? 'COMPLETED' : task.status === 'DELAYED' ? 'DELAYED' : task.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NOT_STARTED'] || 'status-todo'}`}>{projectTaskStatusLabel[task.status] || task.status}</span>
                      </header>
                      <div className="project-stage-metrics">
                        <div><span>الأولوية</span><strong>{projectTaskPriorityLabel[task.priority] || task.priority || '-'}</strong></div>
                        <div><span>الإنجاز</span><strong dir="ltr">{task.progressPercent || 0}%</strong></div>
                        <div><span>قائد الفريق</span><strong>{task.teamLeader?.fullName || '-'}</strong></div>
                        <div><span>المكلفون</span><strong>{(task.assignees || []).length}</strong></div>
                      </div>
                      <div className="project-stage-progress compact">
                        <span style={{ width: `${Math.min(Number(task.progressPercent || 0), 100)}%` }} />
                      </div>
                      <div className="project-stage-dates">
                        <span>البدء: {toDateInput(task.startDate) || '-'}</span>
                        <span>النهاية: {toDateInput(task.dueDate) || '-'}</span>
                      </div>
                      <footer className="form-actions">
                        {canCreateDailyPlan ? <button type="button" className="btn btn-primary btn-sm" onClick={() => openDailyPlanForTask(task)}>إضافة بلان</button> : null}
                        {canManageProjectTasks ? <button type="button" className="btn btn-primary btn-sm" onClick={() => startEditTask(task)} disabled={taskSaving}>تعديل</button> : null}
                        {canManageProjectTasks ? <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteTask(task)} disabled={taskSaving}>حذف</button> : null}
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'workReports' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>تقارير عمل المشروع</h3>
                    <p>تظهر هنا تقارير العمل المرتبطة بهذا المشروع عند اختيار اسم المشروع أثناء إنشاء التقرير.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <button type="button" className="btn btn-soft" onClick={() => loadProjectWorkReports(selectedProject)} disabled={workReportsLoading}>
                      {workReportsLoading ? 'جارٍ التحديث...' : 'تحديث التقارير'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => { window.location.href = `/work-reports?project=${selectedProject._id}`; }}>
                      فتح تقارير العمل
                    </button>
                  </div>
                </div>

                <div className="project-work-report-summary">
                  <article><span>إجمالي التقارير</span><strong>{projectWorkReportSummary.total}</strong></article>
                  <article><span>بانتظار الاعتماد</span><strong>{projectWorkReportSummary.submitted}</strong></article>
                  <article><span>معتمدة</span><strong>{projectWorkReportSummary.approved}</strong></article>
                  <article><span>مرفوضة</span><strong>{projectWorkReportSummary.rejected}</strong></article>
                </div>

                <div className="project-work-report-list">
                  {workReportsLoading ? <p>جارٍ تحميل تقارير العمل...</p> : null}
                  {!workReportsLoading && !projectWorkReports.length ? (
                    <p>لا توجد تقارير عمل مرتبطة بهذا المشروع حتى الآن.</p>
                  ) : null}
                  {!workReportsLoading && projectWorkReports.map((report) => {
                    const ownerName = report.employeeName || report.user?.fullName || '-';
                    const percent = Number(report.progressPercent || 0);
                    const actionBusy = workReportActionId === String(report._id);
                    return (
                      <article className="project-work-report-card" key={report._id}>
                        <header>
                          <div>
                            <small>{toDateInput(report.workDate || report.createdAt) || '-'}</small>
                            <h4>{report.title || report.projectName || 'تقرير عمل'}</h4>
                            <p>{report.details || report.accomplishments || 'بدون تفاصيل مختصرة'}</p>
                          </div>
                          <span className={`status-pill ${workReportStatusClass[report.status] || 'status-todo'}`}>
                            {workReportStatusLabel[report.status] || report.status}
                          </span>
                        </header>
                        <div className="project-stage-metrics">
                          <div><span>الموظف</span><strong>{ownerName}</strong></div>
                          <div><span>نوع العمل</span><strong>{report.activityType || '-'}</strong></div>
                          <div><span>نسبة الإنجاز</span><strong dir="ltr">{percent}%</strong></div>
                          <div><span>المشاركون</span><strong>{report.participantCount || (report.participants || []).length || 0}</strong></div>
                        </div>
                        <div className="project-stage-progress compact">
                          <span style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
                        </div>
                        <footer className="form-actions project-work-report-actions">
                          <button type="button" className="btn btn-soft btn-sm" onClick={() => openProjectWorkReport(report)}>تفاصيل</button>
                          <button type="button" className="btn btn-soft btn-sm" onClick={() => openProjectWorkReportPdf(report)}>PDF</button>
                          {canEditProjectWorkReport(report) ? (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => openProjectWorkReport(report, 'edit')}>تعديل</button>
                          ) : null}
                          {canDirectApproveProjectWorkReport(report) ? (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => approveProjectWorkReport(report)} disabled={actionBusy}>
                                {actionBusy ? 'جارٍ الاعتماد...' : 'اعتماد'}
                              </button>
                              <button type="button" className="btn btn-soft btn-sm" style={{ color: 'var(--danger)' }} onClick={() => rejectProjectWorkReport(report)} disabled={actionBusy}>
                                رفض
                              </button>
                            </>
                          ) : null}
                          {canDeleteProjectWorkReport(report) ? (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteProjectWorkReport(report)} disabled={actionBusy}>حذف</button>
                          ) : null}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'team' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>كادر المشروع</h3>
                    <p>إضافة موظفين من النظام أو تسجيل عامل أجر يومي خاص بهذا المشروع فقط.</p>
                  </div>
                  <div className="project-stage-weight">
                    <span>إجمالي الكادر</span>
                    <strong>{projectTeamMemberIds.length + (selectedProject.dailyLaborers || []).length}</strong>
                  </div>
                </div>

                {canManage ? (
                  <div className="project-team-actions-bar">
                    <button
                      type="button"
                      className={`btn ${teamFormMode === 'employees' ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setTeamFormMode((mode) => (mode === 'employees' ? '' : 'employees'))}
                    >
                      إضافة كادر من الموظفين
                    </button>
                    <button
                      type="button"
                      className={`btn ${teamFormMode === 'external' ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setTeamFormMode((mode) => (mode === 'external' ? '' : 'external'))}
                    >
                      إضافة فني خارجي
                    </button>
                  </div>
                ) : null}

                {canManage && teamFormMode ? (
                  <div className="project-team-form-wrap">
                    {teamFormMode === 'employees' ? (
                    <section className="project-team-panel">
                      <DailyWorkPlanAssigneePicker
                        users={stageEmployeeOptions}
                        selectedIds={projectTeamMemberIds}
                        onChange={setProjectTeamMemberIds}
                        title="موظفون موجودون داخل النظام"
                        hint="اختر موظفًا أو أكثر لإضافتهم إلى كادر المشروع الرسمي."
                      />
                      <div className="form-actions">
                        <button type="button" className="btn btn-primary" onClick={() => saveProjectTeam()} disabled={projectTeamSaving}>
                          {projectTeamSaving ? 'جارٍ الحفظ...' : 'حفظ موظفي النظام'}
                        </button>
                        <button type="button" className="btn btn-soft" onClick={() => setTeamFormMode('')} disabled={projectTeamSaving}>إغلاق</button>
                      </div>
                    </section>
                    ) : null}

                    {teamFormMode === 'external' ? (
                    <form className="project-team-panel project-daily-labor-form" onSubmit={addDailyLaborer}>
                      <h4 className="project-labor-title">إضافة فني خارجي / أجر يومي</h4>
                      <label>
                        الاسم الكامل
                        <input className="input" value={dailyLaborerForm.fullName} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, fullName: e.target.value }))} required />
                      </label>
                      <label>
                        رقم الهاتف
                        <input className="input" value={dailyLaborerForm.phone} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, phone: e.target.value }))} />
                      </label>
                      <label>
                        طبيعة العمل
                        <input className="input" value={dailyLaborerForm.jobTitle} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, jobTitle: e.target.value }))} placeholder="عامل، فني مساعد، نقل..." />
                      </label>
                      <label>
                        الأجر اليومي
                        <input className="input" type="number" min={0} value={dailyLaborerForm.dailyWage} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, dailyWage: e.target.value }))} />
                      </label>
                      <label>
                        تاريخ المباشرة
                        <input className="input" type="date" value={dailyLaborerForm.startDate} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, startDate: e.target.value }))} />
                      </label>
                      <label>
                        العملة
                        <input className="input" value={dailyLaborerForm.currency} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, currency: e.target.value }))} />
                      </label>
                      <label className="project-labor-full">
                        ملاحظات
                        <textarea className="textarea" rows={2} value={dailyLaborerForm.notes} onChange={(e) => setDailyLaborerForm((p) => ({ ...p, notes: e.target.value }))} />
                      </label>
                      <div className="form-actions project-labor-full project-labor-actions">
                        <button className="btn btn-primary" disabled={projectTeamSaving}>{projectTeamSaving ? 'جارٍ الحفظ...' : 'إضافة أجر يومي'}</button>
                        <button type="button" className="btn btn-soft" onClick={() => setTeamFormMode('')} disabled={projectTeamSaving}>إغلاق</button>
                      </div>
                    </form>
                    ) : null}
                  </div>
                ) : canManage ? (
                  <div className="project-team-empty-form">
                    اختر نوع الإضافة من الأزرار أعلاه لإظهار الاستمارة المطلوبة.
                  </div>
                ) : null}

                <div className="project-team-lists">
                  <section className="project-stage-item">
                    <header>
                      <div>
                        <h4>موظفو النظام</h4>
                        <p>موظفون لديهم حسابات داخل النظام ومرتبطون بالمشروع.</p>
                      </div>
                    </header>
                    <div className="project-team-card-grid">
                      {(selectedProject.teamMembers || []).length ? selectedProject.teamMembers.map((member) => (
                        <article className="project-team-member-card" key={member._id || member.id || member}>
                          <div className="project-team-avatar">{String(member.fullName || '?').slice(0, 1)}</div>
                          <div>
                            <strong>{member.fullName || '-'}</strong>
                            <span>{member.jobTitle || member.role || '-'}</span>
                            <small>{member.department || 'بدون قسم'}</small>
                          </div>
                        </article>
                      )) : <p>لا يوجد موظفون من النظام مضافون بعد.</p>}
                    </div>
                  </section>

                  <section className="project-stage-item">
                    <header>
                      <div>
                        <h4>الأجر اليومي</h4>
                        <p>أسماء محفوظة داخل هذا المشروع فقط ولا يتم إنشاء حسابات لها.</p>
                      </div>
                    </header>
                    <div className="project-team-card-grid">
                      {(selectedProject.dailyLaborers || []).length ? selectedProject.dailyLaborers.map((laborer) => (
                        <article className="project-team-member-card project-team-external-card" key={laborer._id}>
                          <div className="project-team-avatar project-team-avatar-external">{String(laborer.fullName || '?').slice(0, 1)}</div>
                          <div>
                            <strong>{laborer.fullName}</strong>
                            <span>{laborer.jobTitle || 'فني خارجي'}</span>
                            <small>{laborer.phone || 'بدون هاتف'}</small>
                            <em dir="ltr">{Number(laborer.dailyWage || 0).toLocaleString('en-US')} {laborer.currency || 'IQD'}</em>
                          </div>
                          {canManage ? <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDailyLaborer(laborer._id)} disabled={projectTeamSaving}>إزالة</button> : null}
                        </article>
                      )) : <p>لا يوجد موظفو أجر يومي مضافون بعد.</p>}
                    </div>
                  </section>
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'departments' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>أقسام المشروع</h3>
                    <p>تنظيم أقسام العمل داخل المشروع مثل الإطفاء والقدرة والكاميرات مع مسؤول وكادر لكل قسم.</p>
                  </div>
                  <div className="project-stage-weight">
                    <span>عدد الأقسام</span>
                    <strong>{(selectedProject.projectDepartments || []).length}</strong>
                  </div>
                </div>

                {canManage ? (
                  <div className="project-team-actions-bar">
                    <button
                      type="button"
                      className={`btn ${departmentFormOpen ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setDepartmentFormOpen((value) => !value)}
                    >
                      إضافة قسم
                    </button>
                  </div>
                ) : null}

                {canManage && departmentFormOpen ? (
                  <form className="project-team-panel project-department-form" onSubmit={addProjectDepartment}>
                    <label>
                      اسم القسم
                      <input className="input" value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))} placeholder="قسم الإطفاء، قسم القدرة..." required />
                    </label>
                    <label>
                      مسؤول القسم
                      <select className="select" value={departmentForm.manager} onChange={(e) => setDepartmentForm((p) => ({ ...p, manager: e.target.value }))}>
                        <option value="">بدون تحديد</option>
                        {stageEmployeeOptions.map((person) => <option key={person.id} value={person.id}>{person.fullName || '-'}</option>)}
                      </select>
                    </label>
                    <label className="project-labor-full">
                      تفاصيل بسيطة
                      <textarea className="textarea" rows={2} value={departmentForm.description} onChange={(e) => setDepartmentForm((p) => ({ ...p, description: e.target.value }))} />
                    </label>
                    <div className="project-labor-full project-stage-assignee-picker">
                      <DailyWorkPlanAssigneePicker
                        users={stageEmployeeOptions}
                        selectedIds={departmentForm.members}
                        onChange={(members) => setDepartmentForm((p) => ({ ...p, members }))}
                        title="الكادر المشترك داخل القسم"
                        hint="اختر الموظفين المشاركين في هذا القسم داخل المشروع."
                      />
                    </div>
                    <label className="project-labor-full">
                      ملاحظات
                      <textarea className="textarea" rows={2} value={departmentForm.notes} onChange={(e) => setDepartmentForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <div className="form-actions project-labor-full">
                      <button className="btn btn-primary" disabled={projectDepartmentSaving}>{projectDepartmentSaving ? 'جارٍ الحفظ...' : 'حفظ القسم'}</button>
                      <button type="button" className="btn btn-soft" onClick={resetDepartmentForm} disabled={projectDepartmentSaving}>إغلاق</button>
                    </div>
                  </form>
                ) : canManage ? (
                  <div className="project-team-empty-form">اضغط على زر إضافة قسم لإظهار الاستمارة.</div>
                ) : null}

                <div className="project-department-grid">
                  {(selectedProject.projectDepartments || []).length ? selectedProject.projectDepartments.map((department) => (
                    <article className="project-department-card" key={department._id}>
                      <header>
                        <div>
                          <h4>{department.name}</h4>
                          <p>{department.description || 'بدون تفاصيل'}</p>
                        </div>
                        {canManage ? <button type="button" className="btn btn-danger btn-sm" onClick={() => removeProjectDepartment(department._id)} disabled={projectDepartmentSaving}>إزالة</button> : null}
                      </header>
                      <div className="project-stage-metrics">
                        <div><span>مسؤول القسم</span><strong>{department.manager?.fullName || '-'}</strong></div>
                        <div><span>الكادر المشترك</span><strong>{(department.members || []).length}</strong></div>
                      </div>
                      <div className="project-team-card-grid">
                        {(department.members || []).map((member) => (
                          <article className="project-team-member-card" key={member._id || member.id || member}>
                            <div className="project-team-avatar">{String(member.fullName || '?').slice(0, 1)}</div>
                            <div>
                              <strong>{member.fullName || '-'}</strong>
                              <span>{member.jobTitle || member.role || '-'}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  )) : <p>لا توجد أقسام مضافة لهذا المشروع بعد.</p>}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'supervisors' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>مسؤولو المشروع</h3>
                    <p>تحديد مدير المشروع والمسؤولين من الموظفين الموجودين داخل النظام.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <div className="project-stage-weight">
                      <span>عدد المسؤولين</span>
                      <strong>{projectSupervisorSummary.total}</strong>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className={`btn ${supervisorFormOpen ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => setSupervisorFormOpen((value) => !value)}
                      >
                        إضافة مسؤول
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="project-finance-summary">
                  <article>
                    <span>مدير المشروع الحالي</span>
                    <strong>{selectedProject.projectManager?.fullName || selectedProject.owner?.fullName || '-'}</strong>
                  </article>
                  <article>
                    <span>مدراء المشروع</span>
                    <strong>{projectSupervisorSummary.managers}</strong>
                  </article>
                  <article>
                    <span>المسؤولون</span>
                    <strong>{projectSupervisorSummary.supervisors}</strong>
                  </article>
                  <article>
                    <span>الموظفون المتاحون</span>
                    <strong>{stageEmployeeOptions.length}</strong>
                  </article>
                </div>

                {canManage && supervisorFormOpen ? (
                  <form className="project-team-panel project-supervisor-form" onSubmit={addProjectSupervisor}>
                    <label>
                      الموظف
                      <select className="select" value={supervisorForm.employee} onChange={(e) => setSupervisorForm((p) => ({ ...p, employee: e.target.value }))} required>
                        <option value="">اختر موظفًا من النظام</option>
                        {stageEmployeeOptions.map((person) => (
                          <option key={person.id} value={person.id}>{person.fullName || '-'}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      الدور
                      <select className="select" value={supervisorForm.role} onChange={(e) => setSupervisorForm((p) => ({ ...p, role: e.target.value }))}>
                        <option value="SUPERVISOR">مسؤول مشروع</option>
                        <option value="PROJECT_MANAGER">مدير مشروع</option>
                      </select>
                    </label>
                    <label>
                      المسمى داخل المشروع
                      <input className="input" value={supervisorForm.title} onChange={(e) => setSupervisorForm((p) => ({ ...p, title: e.target.value }))} placeholder="مثلاً: مسؤول تنفيذ، مدير مشروع" />
                    </label>
                    <label className="project-labor-full">
                      ملاحظات
                      <textarea className="textarea" rows={2} value={supervisorForm.notes} onChange={(e) => setSupervisorForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <div className="form-actions project-labor-full">
                      <button className="btn btn-primary" disabled={projectSupervisorSaving}>{projectSupervisorSaving ? 'جارٍ الحفظ...' : 'حفظ المسؤول'}</button>
                      <button type="button" className="btn btn-soft" onClick={resetSupervisorForm} disabled={projectSupervisorSaving}>إغلاق</button>
                    </div>
                  </form>
                ) : canManage ? (
                  <div className="project-team-empty-form">اضغط على زر إضافة مسؤول لاختيار موظف من النظام وتحديد دوره داخل المشروع.</div>
                ) : null}

                <div className="project-department-grid">
                  {(selectedProject.projectSupervisors || []).length ? selectedProject.projectSupervisors.map((supervisor) => {
                    const employee = supervisor.employee || {};
                    return (
                      <article className="project-department-card" key={supervisor._id}>
                        <header>
                          <div>
                            <small>{projectSupervisorRoleLabel[supervisor.role] || 'مسؤول مشروع'}</small>
                            <h4>{employee.fullName || '-'}</h4>
                            <p>{supervisor.title || employee.jobTitle || projectSupervisorRoleLabel[supervisor.role] || '-'}</p>
                          </div>
                          {canManage ? <button type="button" className="btn btn-danger btn-sm" onClick={() => removeProjectSupervisor(supervisor._id)} disabled={projectSupervisorSaving}>إزالة</button> : null}
                        </header>
                        <div className="project-stage-metrics">
                          <div><span>القسم</span><strong>{employee.department || '-'}</strong></div>
                          <div><span>الهاتف</span><strong dir="ltr">{employee.phone || '-'}</strong></div>
                          <div><span>البريد</span><strong>{employee.email || '-'}</strong></div>
                          <div><span>أضيف بواسطة</span><strong>{supervisor.addedBy?.fullName || '-'}</strong></div>
                        </div>
                        {supervisor.notes ? <p style={{ marginTop: 10 }}>{supervisor.notes}</p> : null}
                      </article>
                    );
                  }) : <p>لا يوجد مسؤولون مضافون لهذا المشروع بعد.</p>}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'finance' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>مالية المشروع</h3>
                    <p>طلبات الصرف المرتبطة بهذا المشروع مع إجمالي المصروف والطلبات الجاهزة للصرف.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <div className="project-stage-weight">
                      <span>المستندات</span>
                      <strong>{projectFinanceSummary.totalRequests}</strong>
                    </div>
                    {canCreateProjectFinance ? (
                      <button
                        type="button"
                        className={`btn ${projectFinanceFormOpen ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => setProjectFinanceFormOpen((value) => !value)}
                      >
                        صرف مالي
                      </button>
                    ) : null}
                    {canViewProjectFinance ? (
                      <button type="button" className="btn btn-soft" onClick={exportProjectFinanceExcel}>
                        تصدير Excel
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="project-finance-summary">
                  <article>
                    <span>مبلغ السلف المتبقي</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.advanceBalance, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>إجمالي مبالغ السلف</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.totalAdvances, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>إجمالي المبلغ المستلم من الزبون</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.totalCustomerReceipts, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>إجمالي الصرف على المشروع</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.totalDisbursed, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>مبالغ الفواتير</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.invoiceTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>مجموع ديون الموردين</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.supplierDebtTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>مجموع المبالغ المدفوعة للموردين</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.supplierPaidTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>غير معتمدة من مدير المشاريع والمدير المالي</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.totalPendingApproval, projectFinanceSummary.currency)}</strong>
                  </article>
                </div>

                {canCreateProjectFinance && projectFinanceFormOpen ? (
                  <form className="project-team-panel project-finance-form" onSubmit={(event) => submitProjectFinance(event, 'draft')}>
                    <label>
                      العملة
                      <input className="input" value={projectFinanceForm.currency} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
                    </label>
                    <label>
                      تاريخ المعاملة
                      <input className="input" type="date" value={projectFinanceForm.transactionDate} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, transactionDate: e.target.value }))} />
                    </label>
                    <label>
                      نوع الصرف
                      <select className="select" value={projectFinanceForm.requestType} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, requestType: e.target.value }))}>
                        {financialTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      المبلغ
                      <input className="input" type="number" min={1} value={projectFinanceForm.amount} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, amount: e.target.value }))} required />
                    </label>
                    <label className="project-labor-full">
                      على مشروع
                      <input className="input" value={selectedProject.name} disabled />
                    </label>
                    <label className="project-labor-full">
                      وصف طلب الصرف
                      <textarea className="textarea" rows={2} value={projectFinanceForm.description} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, description: e.target.value }))} required />
                    </label>
                    <label className="project-labor-full">
                      ملاحظات
                      <textarea className="textarea" rows={2} value={projectFinanceForm.notes} onChange={(e) => setProjectFinanceForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <label className="project-labor-full">
                      المرفقات
                      <input
                        className="input"
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = '';
                          setProjectFinanceForm((p) => ({ ...p, files }));
                        }}
                      />
                    </label>
                    <div className="form-actions project-labor-full">
                      <button className="btn btn-soft" type="button" disabled={projectFinanceSaving} onClick={(event) => submitProjectFinance(event, 'draft')}>{projectFinanceSaving ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}</button>
                      <button className="btn btn-primary" type="button" disabled={projectFinanceSaving} onClick={(event) => submitProjectFinance(event, 'submit')}>{projectFinanceSaving ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</button>
                      <button type="button" className="btn btn-soft" disabled={projectFinanceSaving} onClick={resetProjectFinanceForm}>إغلاق</button>
                    </div>
                  </form>
                ) : canCreateProjectFinance ? (
                  <div className="project-team-empty-form">اضغط على زر صرف مالي لإظهار استمارة الصرف المرتبطة بهذا المشروع.</div>
                ) : null}

                <div className="project-finance-list">
                  {projectFinanceLoading ? <p>جارٍ تحميل مالية المشروع...</p> : null}
                  {!projectFinanceLoading && !projectFinancialRequests.length && !projectCustomerReceipts.length ? <p>لا توجد معاملات مالية مرتبطة بهذا المشروع بعد.</p> : null}
                  {projectFinancialRequests.map((request) => (
                    <article className="project-finance-card" key={request.id}>
                      <header>
                        <div>
                          <small>{request.requestNo || '-'}</small>
                          <h4>{request.isProjectAdvance ? 'سلفة مشروع' : (financialTypeLabel[request.requestType] || request.requestType || 'طلب صرف')}</h4>
                          <p>{request.description || 'بدون وصف'}</p>
                        </div>
                        <span className="status-pill">{financialStatusLabel[request.status] || request.status}</span>
                      </header>
                      <div className="project-stage-metrics">
                        <div><span>المبلغ</span><strong dir="ltr">{formatProjectMoney(request.amount, request.currency)}</strong></div>
                        <div><span>المعتمد</span><strong dir="ltr">{formatProjectMoney(request.approvedAmount != null ? request.approvedAmount : request.amount, request.currency)}</strong></div>
                        <div><span>الموظف</span><strong>{request.employee?.fullName || '-'}</strong></div>
                        <div><span>المستلف</span><strong>{request.advanceRecipient?.fullName || '-'}</strong></div>
                        <div><span>التاريخ</span><strong dir="ltr">{toDateInput(request.transactionDate || request.createdAt) || '-'}</strong></div>
                      </div>
                    </article>
                  ))}
                  {projectCustomerReceipts.map((receipt) => (
                    <article className="project-finance-card" key={`receipt-${receipt.id}`}>
                      <header>
                        <div>
                          <small>{receipt.receiptNo || '-'}</small>
                          <h4>مبلغ مستلم من زبون</h4>
                          <p>{receipt.details || receipt.notes || 'سند استلام مرتبط بالمشروع'}</p>
                        </div>
                        <span className="status-pill status-approved">مستلم</span>
                      </header>
                      <div className="project-stage-metrics">
                        <div><span>المبلغ</span><strong dir="ltr">{formatProjectMoney(receipt.amount, receipt.currency)}</strong></div>
                        <div><span>الزبون</span><strong>{receipt.customerName || receipt.customer?.name || '-'}</strong></div>
                        <div><span>المستلم</span><strong>{receipt.receivedBy?.fullName || '-'}</strong></div>
                        <div><span>التاريخ</span><strong dir="ltr">{toDateInput(receipt.receiptDate || receipt.createdAt) || '-'}</strong></div>
                      </div>
                      <footer className="form-actions" style={{ marginTop: 12 }}>
                        <button className="btn btn-soft btn-sm" type="button" onClick={() => downloadProjectCustomerReceiptPdf(receipt)}>
                          PDF
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'invoices' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>فواتير المشروع</h3>
                    <p>إضافة فواتير الموردين وربط مبالغها بمالية المشروع حسب طريقة الدفع.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <div className="project-stage-weight">
                      <span>عدد الفواتير</span>
                      <strong>{projectInvoices.length}</strong>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className={`btn ${projectInvoiceFormOpen ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => setProjectInvoiceFormOpen((value) => !value)}
                      >
                        إضافة فاتورة
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="project-finance-summary">
                  <article>
                    <span>إجمالي الفواتير بالآجل</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.supplierDebtTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>إجمالي الفواتير النقدية</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.supplierPaidTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                  <article>
                    <span>إجمالي مبالغ الفواتير</span>
                    <strong dir="ltr">{formatProjectMoney(projectFinanceSummary.invoiceTotal, projectFinanceSummary.currency)}</strong>
                  </article>
                </div>

                {canManage && projectInvoiceFormOpen ? (
                  <form className="project-team-panel project-invoice-form" onSubmit={submitProjectInvoice}>
                    <label>
                      المورد من القائمة
                      <select
                        className="select"
                        value={projectInvoiceForm.supplier}
                        onChange={(e) => {
                          const supplierId = e.target.value;
                          const selectedSupplier = suppliers.find((supplier) => String(supplier._id || supplier.id) === String(supplierId));
                          setProjectInvoiceForm((current) => ({
                            ...current,
                            supplier: supplierId,
                            supplierName: selectedSupplier?.supplierName || selectedSupplier?.companyName || current.supplierName,
                          }));
                        }}
                      >
                        <option value="">مورد خارجي / غير مسجل</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier._id || supplier.id} value={supplier._id || supplier.id}>
                            {supplier.supplierName || supplier.companyName || '-'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      اسم مورد خارجي
                      <input className="input" value={projectInvoiceForm.supplierName} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, supplierName: e.target.value }))} />
                    </label>
                    <label>
                      نوع المواد
                      <input className="input" value={projectInvoiceForm.materialType} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, materialType: e.target.value }))} required />
                    </label>
                    <label>
                      رقم الفاتورة
                      <input className="input" value={projectInvoiceForm.invoiceNo} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, invoiceNo: e.target.value }))} required />
                    </label>
                    <label>
                      مبلغ الفاتورة
                      <input className="input" type="number" min={0} value={projectInvoiceForm.invoiceAmount} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, invoiceAmount: e.target.value }))} required />
                    </label>
                    <label>
                      مبلغ النقل
                      <input className="input" type="number" min={0} value={projectInvoiceForm.transportAmount} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, transportAmount: e.target.value }))} />
                    </label>
                    <label>
                      تاريخ الفاتورة
                      <input className="input" type="date" value={projectInvoiceForm.invoiceDate} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, invoiceDate: e.target.value }))} />
                    </label>
                    <label>
                      العملة
                      <select className="select" value={projectInvoiceForm.currency} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, currency: e.target.value }))}>
                        <option value="IQD">دينار عراقي</option>
                        <option value="USD">دولار أمريكي</option>
                      </select>
                    </label>
                    <label>
                      طريقة الدفع
                      <select className="select" value={projectInvoiceForm.paymentMethod} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                        <option value="CREDIT">آجل</option>
                        <option value="CASH">نقدي</option>
                        <option value="PARTIAL">تسديد جزئي</option>
                      </select>
                    </label>
                    {projectInvoiceForm.paymentMethod === 'PARTIAL' ? (
                      <label>
                        مبلغ التسديد
                        <input className="input" type="number" min={0} value={projectInvoiceForm.paidAmount} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, paidAmount: e.target.value }))} />
                      </label>
                    ) : null}
                    <label className="project-labor-full">
                      ملف الفاتورة الأصلية
                      <input
                        className="input"
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.target.value = '';
                          setProjectInvoiceForm((p) => ({ ...p, originalInvoice: file }));
                        }}
                      />
                      {projectInvoiceForm.originalInvoice ? <small style={{ color: 'var(--text-soft)' }}>{projectInvoiceForm.originalInvoice.name}</small> : null}
                    </label>
                    <label className="project-labor-full">
                      ملاحظات
                      <textarea className="textarea" rows={2} value={projectInvoiceForm.notes} onChange={(e) => setProjectInvoiceForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <div className="form-actions project-labor-full">
                      <button className="btn btn-primary" disabled={projectInvoiceSaving}>{projectInvoiceSaving ? 'جارٍ الحفظ...' : editingProjectInvoiceId ? 'حفظ التعديل' : 'حفظ الفاتورة'}</button>
                      <button type="button" className="btn btn-soft" disabled={projectInvoiceSaving} onClick={resetProjectInvoiceForm}>إغلاق</button>
                    </div>
                  </form>
                ) : canManage ? (
                  <div className="project-team-empty-form">اضغط على زر إضافة فاتورة لإظهار الاستمارة.</div>
                ) : null}

                <div className="project-finance-list">
                  {!projectInvoices.length ? <p>لا توجد فواتير مضافة لهذا المشروع بعد.</p> : null}
                  {projectInvoices.map((invoice) => (
                    <article className="project-finance-card" key={invoice._id || invoice.id}>
                      <header>
                        <div>
                          <small>{invoice.invoiceNo || '-'}</small>
                          <h4>{invoice.supplierName || 'مورد غير محدد'}</h4>
                          <p>{invoice.materialType || 'نوع المواد غير محدد'}</p>
                        </div>
                        <span className={`status-pill ${invoice.paymentMethod === 'CASH' ? 'status-approved' : invoice.paymentMethod === 'PARTIAL' ? 'status-submitted' : 'status-inprogress'}`}>
                          {invoice.paymentMethod === 'CASH' ? 'نقدي' : invoice.paymentMethod === 'PARTIAL' ? 'تسديد جزئي' : 'آجل'}
                        </span>
                      </header>
                      <div className="project-stage-metrics">
                        <div><span>مبلغ الفاتورة</span><strong dir="ltr">{formatProjectMoney(invoice.invoiceAmount, invoice.currency)}</strong></div>
                        <div><span>النقل</span><strong dir="ltr">{formatProjectMoney(invoice.transportAmount, invoice.currency)}</strong></div>
                        <div><span>الإجمالي</span><strong dir="ltr">{formatProjectMoney(invoice.totalAmount, invoice.currency)}</strong></div>
                        <div><span>المسدد</span><strong dir="ltr">{formatProjectMoney(invoice.paidAmount, invoice.currency)}</strong></div>
                        <div><span>المتبقي</span><strong dir="ltr">{formatProjectMoney(invoice.remainingAmount, invoice.currency)}</strong></div>
                        <div><span>التاريخ</span><strong dir="ltr">{toDateInput(invoice.invoiceDate) || '-'}</strong></div>
                      </div>
                      {invoice.originalInvoice?.url ? (
                        <footer className="form-actions" style={{ marginTop: 12 }}>
                          {canManage ? (
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => startEditProjectInvoice(invoice)}>
                              تعديل
                            </button>
                          ) : null}
                          <button className="btn btn-soft btn-sm" type="button" onClick={() => downloadProjectInvoicePdf(invoice)}>
                            PDF
                          </button>
                          <a className="btn btn-soft btn-sm" href={assetUrl(invoice.originalInvoice.url)} target="_blank" rel="noreferrer">
                            ملف الفاتورة
                          </a>
                        </footer>
                      ) : canManage ? (
                        <footer className="form-actions" style={{ marginTop: 12 }}>
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => startEditProjectInvoice(invoice)}>
                            تعديل
                          </button>
                          <button className="btn btn-soft btn-sm" type="button" onClick={() => downloadProjectInvoicePdf(invoice)}>
                            PDF
                          </button>
                        </footer>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'warehouse' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>مخزن المشروع</h3>
                    <p>سجل المواد المصروفة من المخازن على هذا المشروع حسب سندات التسليم.</p>
                  </div>
                  <div className="project-task-header-actions">
                    <button type="button" className="btn btn-soft" onClick={() => loadProjectWarehouse(selectedProject._id)} disabled={projectWarehouseLoading}>
                      تحديث السجل
                    </button>
                    <button type="button" className="btn btn-primary" onClick={exportProjectWarehouseExcel} disabled={!projectWarehouseMaterials.length}>
                      تصدير Excel
                    </button>
                  </div>
                </div>

                <div className="project-finance-summary">
                  <article>
                    <span>سندات التسليم</span>
                    <strong>{projectWarehouseDisplaySummary.dispatchesCount}</strong>
                  </article>
                  <article>
                    <span>أنواع المواد المصروفة</span>
                    <strong>{projectWarehouseDisplaySummary.uniqueMaterialsCount}</strong>
                  </article>
                  <article>
                    <span>إجمالي الفقرات المصروفة</span>
                    <strong>{projectWarehouseDisplaySummary.itemsCount}</strong>
                  </article>
                  <article>
                    <span>المخازن المستخدمة</span>
                    <strong>{projectWarehouseDisplaySummary.warehousesCount}</strong>
                  </article>
                </div>

                <div className="project-table-wrap">
                  {projectWarehouseLoading ? <p>جارٍ تحميل سجل مواد المشروع...</p> : null}
                  {!projectWarehouseLoading && !projectWarehouseMaterials.length ? <p>لا توجد مواد مصروفة من المخازن على هذا المشروع بعد.</p> : null}
                  {projectWarehouseMaterials.length ? (
                    <table className="table project-warehouse-table">
                      <thead>
                        <tr>
                          <th>السند</th>
                          <th>طلب المواد</th>
                          <th>التاريخ</th>
                          <th>المخزن</th>
                          <th>المادة</th>
                          <th>الوحدة</th>
                          <th>الكمية</th>
                          <th>المستلم</th>
                          <th>المسلم</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectWarehouseMaterials.map((row) => (
                          <tr key={row.id}>
                            <td>{row.dispatchNo || '-'}</td>
                            <td>{row.requestNo || '-'}</td>
                            <td dir="ltr">{row.deliveredAt || '-'}</td>
                            <td>{row.warehouseName || '-'}</td>
                            <td>
                              <strong>{row.materialName || '-'}</strong>
                              {row.materialCode ? <small>{row.materialCode}</small> : null}
                            </td>
                            <td>{row.unit || '-'}</td>
                            <td dir="ltr">{Number(row.deliveredQty || 0).toLocaleString('en-US')}</td>
                            <td>{row.recipientName || '-'}</td>
                            <td>{row.deliveredByName || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeProjectTab === 'documents' ? (
              <section className="project-dashboard-section">
                <div className="section-header project-dashboard-header">
                  <div>
                    <h3>مستندات المشروع</h3>
                    <p>رفع وتنظيم صور المشروع والمخططات والعقود والمستمسكات المطلوبة.</p>
                  </div>
                  <div className="project-task-header-actions">
                    {canManage ? (
                      <button
                        type="button"
                        className={`btn ${projectDocumentFormOpen ? 'btn-primary' : 'btn-soft'}`}
                        onClick={() => setProjectDocumentFormOpen((value) => !value)}
                      >
                        رفع مستندات
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-soft" onClick={() => loadProjectDocuments(selectedProject._id)} disabled={projectDocumentsLoading}>
                      تحديث
                    </button>
                  </div>
                </div>

                <div className="project-finance-summary">
                  <article><span>إجمالي المستندات</span><strong>{projectDocumentSummary.total}</strong></article>
                  <article><span>صور المشروع</span><strong>{projectDocumentSummary.photos}</strong></article>
                  <article><span>المخططات</span><strong>{projectDocumentSummary.plans}</strong></article>
                  <article><span>العقود والمستمسكات</span><strong>{projectDocumentSummary.contracts + projectDocumentSummary.requirements}</strong></article>
                </div>

                {canManage && projectDocumentFormOpen ? (
                  <form className="project-team-panel project-document-form" onSubmit={submitProjectDocuments}>
                    <label>
                      نوع المستند
                      <select className="select" value={projectDocumentForm.documentType} onChange={(e) => setProjectDocumentForm((p) => ({ ...p, documentType: e.target.value }))}>
                        {projectDocumentTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      عنوان المستند
                      <input className="input" value={projectDocumentForm.title} onChange={(e) => setProjectDocumentForm((p) => ({ ...p, title: e.target.value }))} placeholder="مثلاً: مخطط الطابق الأرضي" />
                    </label>
                    <label className="project-labor-full">
                      الملفات
                      <input
                        className="input"
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = '';
                          setProjectDocumentForm((p) => ({ ...p, files }));
                        }}
                      />
                    </label>
                    <label className="project-labor-full">
                      ملاحظات
                      <textarea className="textarea" rows={2} value={projectDocumentForm.notes} onChange={(e) => setProjectDocumentForm((p) => ({ ...p, notes: e.target.value }))} />
                    </label>
                    {projectDocumentForm.files.length ? (
                      <div className="project-document-selected project-labor-full">
                        {projectDocumentForm.files.map((file) => (
                          <span key={`${file.name}-${file.size}`}>{file.name}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="form-actions project-labor-full">
                      <button className="btn btn-primary" disabled={projectDocumentSaving}>{projectDocumentSaving ? 'جارٍ الرفع...' : 'حفظ المستندات'}</button>
                      <button type="button" className="btn btn-soft" disabled={projectDocumentSaving} onClick={resetProjectDocumentForm}>إغلاق</button>
                    </div>
                  </form>
                ) : canManage ? (
                  <div className="project-team-empty-form">اضغط على زر رفع مستندات لإضافة صور أو مخططات أو عقود أو مستمسكات للمشروع.</div>
                ) : null}

                <div className="project-document-grid">
                  {projectDocumentsLoading ? <p>جارٍ تحميل مستندات المشروع...</p> : null}
                  {!projectDocumentsLoading && !projectDocuments.length ? <p>لا توجد مستندات مرفوعة لهذا المشروع بعد.</p> : null}
                  {projectDocuments.map((document) => {
                    const isImage = String(document.mimeType || '').startsWith('image/');
                    return (
                      <article className="project-document-card" key={document._id}>
                        <a className="project-document-preview" href={assetUrl(document.publicUrl)} target="_blank" rel="noreferrer">
                          {isImage ? <img src={assetUrl(document.publicUrl)} alt={document.title || document.originalName || 'مستند مشروع'} /> : <span>{projectDocumentTypeLabel[document.documentType] || 'مستند'}</span>}
                        </a>
                        <div>
                          <small>{projectDocumentTypeLabel[document.documentType] || 'ملف'}</small>
                          <h4>{document.title || document.originalName || 'مستند مشروع'}</h4>
                          <p>{document.notes || document.originalName || 'بدون ملاحظات'}</p>
                          <div className="project-document-meta">
                            <span>{document.uploadedBy?.fullName || '-'}</span>
                            <span dir="ltr">{toDateInput(document.uploadedAt) || '-'}</span>
                            <span dir="ltr">{((Number(document.size || 0) / 1024 / 1024) || 0).toFixed(2)} MB</span>
                          </div>
                        </div>
                        <footer className="form-actions">
                          <a className="btn btn-soft btn-sm" href={assetUrl(document.publicUrl)} target="_blank" rel="noreferrer">فتح</a>
                          {canManage ? <button className="btn btn-soft btn-sm" type="button" onClick={() => deleteProjectDocument(document)}>حذف</button> : null}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {projectDashboardTabInfo[activeProjectTab] && activeProjectTab !== 'overview' && activeProjectTab !== 'warehouse' && activeProjectTab !== 'documents' && activeProjectTab !== 'supervisors' ? (
              <section className="project-dashboard-section">
                <div className="project-tab-placeholder">
                  <span>{projectDashboardTabs.find((tab) => tab.id === activeProjectTab)?.icon}</span>
                  <div>
                    <h3>{projectDashboardTabInfo[activeProjectTab].title}</h3>
                    <p>{projectDashboardTabInfo[activeProjectTab].text}</p>
                  </div>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}

      <DailyWorkPlanModal
        open={Boolean(planForm)}
        initialForm={planForm}
        users={planUsers}
        projects={projects.map((project) => ({ ...project, id: project.id || project._id }))}
        saving={planSaving}
        title="إضافة بلان عمل للمشروع"
        subtitle={planForm ? `${selectedProject?.name || ''} — ${planForm.planDate || ''}` : ''}
        onClose={() => !planSaving && setPlanForm(null)}
        onSubmit={saveDailyPlan}
      />

      <style jsx>{`
        .project-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px;margin-top:18px}
        .project-card{position:relative;display:flex;flex-direction:column;min-height:100%;padding:20px;border:1px solid color-mix(in srgb,var(--primary) 34%,var(--border));border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface-soft) 94%,var(--primary) 6%),var(--surface-soft));box-shadow:0 14px 34px rgba(0,0,0,.12);overflow:hidden;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
        .project-card::before{content:"";position:absolute;inset-block:0 auto;inset-inline:0;width:100%;height:3px;background:linear-gradient(90deg,var(--primary),color-mix(in srgb,var(--primary) 30%,transparent),transparent)}
        .project-card:hover{transform:translateY(-3px);border-color:var(--primary);box-shadow:0 18px 42px rgba(0,0,0,.18)}
        .project-card-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.project-card-identity{min-width:0}.project-card h3{margin:8px 0 5px;font-size:20px;line-height:1.4}.project-card p{margin:0;color:var(--text-soft)}
        .project-code{display:inline-flex;padding:4px 9px;border:1px solid color-mix(in srgb,var(--primary) 45%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--text-soft);font-size:12px;font-weight:700}
        .project-card-info,.project-detail-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0 12px}.project-card-info>div,.project-detail-summary>div{padding:12px;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--surface) 54%,transparent)}.project-card-info span,.project-detail-summary span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:6px}.project-card-info strong{display:block;overflow-wrap:anywhere}.project-budget{font-size:17px;color:var(--text)}
        .project-categories{padding:12px;border:1px dashed color-mix(in srgb,var(--primary) 40%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--primary) 5%,transparent)}.project-categories-label{display:block;margin-bottom:8px;color:var(--text-soft);font-size:12px}.project-category-list{display:flex;flex-wrap:wrap;gap:6px}.project-category-chip{padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary) 17%,var(--surface));color:var(--text);font-size:12px;font-weight:700}.project-category-empty{color:var(--text-soft);font-size:12px}
        .project-card footer{margin-top:auto;padding-top:16px;border-top:1px solid var(--border);margin-block-start:16px}.project-plan-card-actions{align-items:stretch;gap:10px}.project-card .project-plan-card-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.project-plan-card-actions :global(.btn){min-height:42px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 3px 8px rgba(0,0,0,.12)}.project-card .project-plan-card-actions :global(.btn){width:100%;padding-inline:8px}
        .project-plan-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}
        .project-dashboard-tabs{display:flex;gap:6px;align-items:stretch;margin:16px 0 12px;padding:8px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface-soft) 82%,var(--surface));box-shadow:0 10px 28px rgba(0,0,0,.12);overflow-x:auto;scrollbar-width:thin}
        .project-dashboard-tab{display:flex;align-items:center;justify-content:center;gap:7px;min-width:112px;padding:10px 12px;border:0;border-bottom:2px solid transparent;border-radius:10px;background:transparent;color:var(--text-soft);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .18s ease,color .18s ease,border-color .18s ease}
        .project-dashboard-tab span{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:8px;background:color-mix(in srgb,var(--surface) 70%,transparent);color:var(--text-soft);font-weight:900}
        .project-dashboard-tab strong{font-weight:800}
        .project-dashboard-tab:hover{background:color-mix(in srgb,var(--primary) 8%,transparent);color:var(--text)}
        .project-dashboard-tab-active{background:color-mix(in srgb,var(--primary) 12%,var(--surface));color:var(--primary);border-bottom-color:var(--primary)}
        .project-dashboard-tab-active span{background:color-mix(in srgb,var(--primary) 17%,transparent);color:var(--primary)}
        .project-dashboard-section{margin:16px 0 18px;padding:16px;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--surface-soft) 72%,transparent)}
        .project-dashboard-header{align-items:flex-start;margin-bottom:12px}.project-dashboard-header h3{margin:0 0 4px}.project-dashboard-header p{margin:0;color:var(--text-soft)}
        .project-stage-weight{min-width:130px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.project-stage-weight span{display:block;color:var(--text-soft);font-size:12px}.project-stage-weight strong{display:block;font-size:20px;margin-top:3px}
        .project-task-header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
        .project-plan-task-picker{margin:0 0 14px;padding:14px;border:1px dashed color-mix(in srgb,var(--primary) 36%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--surface) 74%,transparent)}
        .project-plan-task-list{display:grid;gap:8px}.project-plan-task-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);font:inherit;text-align:start;cursor:pointer}.project-plan-task-row:hover{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 8%,var(--surface))}.project-plan-task-row span{display:grid;gap:4px}.project-plan-task-row small,.project-plan-task-row em{color:var(--text-soft);font-style:normal}
        .project-team-actions-bar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:12px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface) 78%,transparent)}
        .project-team-form-wrap{margin-bottom:14px}.project-team-empty-form{margin:0 0 14px;padding:12px;border:1px dashed var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface) 70%,transparent);color:var(--text-soft)}.project-team-panel{min-width:0;padding:14px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface) 78%,transparent)}.project-team-panel h4{margin:0 0 12px}.project-daily-labor-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-content:start}.project-daily-labor-form label{min-width:0}.project-labor-title,.project-labor-full{grid-column:1/-1}.project-labor-actions{justify-content:flex-start;margin-top:2px}
        .project-team-lists{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.project-team-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:12px}.project-team-member-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface-soft) 72%,transparent)}.project-team-member-card strong,.project-team-member-card span,.project-team-member-card small{display:block;overflow-wrap:anywhere}.project-team-member-card span,.project-team-member-card small,.project-team-member-card em{color:var(--text-soft);font-style:normal}.project-team-avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:color-mix(in srgb,var(--primary) 16%,transparent);color:var(--primary);font-weight:900}.project-team-avatar-external{background:color-mix(in srgb,var(--success) 16%,transparent);color:var(--success)}.project-team-external-card{grid-template-columns:auto minmax(0,1fr) auto}
        .project-work-report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}.project-work-report-summary article{padding:14px;border:1px solid var(--border);border-radius:13px;background:var(--surface)}.project-work-report-summary span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:7px}.project-work-report-summary strong{display:block;font-size:22px}.project-work-report-list{display:grid;gap:12px}.project-work-report-list>p{margin:0;padding:14px;border:1px dashed var(--border);border-radius:13px;background:color-mix(in srgb,var(--surface) 70%,transparent);color:var(--text-soft)}.project-work-report-card{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-work-report-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.project-work-report-card h4{margin:2px 0 5px;font-size:17px}.project-work-report-card p{margin:0;color:var(--text-soft);line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.project-work-report-card small{color:var(--text-soft);font-weight:800}.project-work-report-actions{padding-top:12px;border-top:1px solid var(--border);margin-top:12px}
        .project-department-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}.project-department-form label{min-width:0}.project-department-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}.project-department-card{padding:14px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface) 78%,transparent)}.project-department-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.project-department-card h4{margin:0 0 5px}.project-department-card p{margin:0;color:var(--text-soft)}
        .project-supervisor-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}.project-supervisor-form label{min-width:0}.project-department-card small{display:block;margin-bottom:5px;color:var(--primary);font-weight:800}
        .project-finance-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 14px}.project-finance-summary article{padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-finance-summary span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:8px}.project-finance-summary strong{display:block;font-size:22px;overflow-wrap:anywhere}.project-finance-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.project-finance-form label{min-width:0}.project-finance-list{display:grid;gap:12px}.project-finance-card{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-finance-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.project-finance-card h4{margin:2px 0 4px}.project-finance-card p{margin:0;color:var(--text-soft)}
        .project-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-table-wrap p{margin:0;padding:16px;color:var(--text-soft)}.project-warehouse-table{min-width:980px;margin:0}.project-warehouse-table th,.project-warehouse-table td{vertical-align:middle}.project-warehouse-table td strong{display:block}.project-warehouse-table td small{display:block;margin-top:3px;color:var(--text-soft);font-size:11px}
        .project-invoice-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}.project-invoice-form label{min-width:0}
        .project-document-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}.project-document-form label{min-width:0}.project-document-selected{display:flex;flex-wrap:wrap;gap:6px}.project-document-selected span{padding:6px 9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-soft);font-size:12px}
        .project-document-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.project-document-grid>p{margin:0;color:var(--text-soft)}.project-document-card{display:grid;grid-template-rows:auto 1fr auto;gap:12px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-document-preview{display:grid;place-items:center;aspect-ratio:16/10;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--surface-soft) 80%,transparent);color:var(--text-soft);text-decoration:none;font-weight:800}.project-document-preview img{width:100%;height:100%;object-fit:cover}.project-document-card h4{margin:3px 0 5px}.project-document-card p{margin:0;color:var(--text-soft);line-height:1.7}.project-document-card small{color:var(--primary);font-weight:800}.project-document-meta{display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:10px;color:var(--text-soft);font-size:12px}
        .project-overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.project-overview-grid>div{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.project-overview-grid span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:6px}.project-overview-grid strong{display:block;font-size:20px}
        .project-tab-placeholder{display:flex;align-items:center;gap:14px;min-height:160px;padding:18px;border:1px dashed color-mix(in srgb,var(--primary) 34%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--surface) 76%,transparent)}.project-tab-placeholder>span{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;border-radius:12px;background:color-mix(in srgb,var(--primary) 14%,transparent);color:var(--primary);font-size:22px;font-weight:900}.project-tab-placeholder h3{margin:0 0 6px}.project-tab-placeholder p{margin:0;color:var(--text-soft);line-height:1.8}
        .project-stage-progress{height:10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid var(--border);overflow:hidden;margin:0 0 14px}.project-stage-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),#2ecc71)}.project-stage-progress.compact{height:8px;margin:12px 0}
        .project-stage-form{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:14px 0;padding:14px;border:1px dashed color-mix(in srgb,var(--primary) 36%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--surface) 74%,transparent)}.project-stage-form label{min-width:0}.project-stage-form select[multiple]{min-height:92px}.project-stage-wide{grid-column:span 5}
        .project-stage-assignee-picker{padding:2px 0}.project-stage-assignee-picker :global(.daily-plan-picker){margin:0;border-radius:14px}
        .project-stage-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}.project-stage-toolbar .select{width:min(260px,100%)}
        .project-stage-list{display:grid;gap:12px}.project-stage-item{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.project-stage-item header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.project-stage-item h4{margin:2px 0 4px;font-size:17px}.project-stage-item p{margin:0;color:var(--text-soft)}.project-stage-item small{color:var(--text-soft);font-weight:800}
        .project-stage-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:12px}.project-stage-metrics>div{padding:9px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb,var(--surface-soft) 68%,transparent)}.project-stage-metrics span{display:block;color:var(--text-soft);font-size:12px;margin-bottom:4px}.project-stage-metrics strong{display:block;overflow-wrap:anywhere}
        .project-stage-dates{display:flex;gap:10px;flex-wrap:wrap;color:var(--text-soft);font-size:12px;margin-bottom:12px}
        .project-detail-backdrop{position:fixed;inset:0;z-index:1200;padding:18px;background:rgba(2,6,14,.82);overflow:auto}.project-detail-panel{width:min(1400px,100%);margin:auto;padding:18px;border:1px solid var(--border);border-radius:20px;background:var(--surface)}
        @media(max-width:1000px){.project-stage-form{grid-template-columns:repeat(2,minmax(0,1fr))}.project-stage-wide{grid-column:span 2}.project-stage-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.project-overview-grid,.project-team-lists,.project-finance-summary,.project-work-report-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.project-daily-labor-form,.project-finance-form,.project-invoice-form,.project-document-form,.project-supervisor-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:700px){.project-card-grid{grid-template-columns:1fr;gap:12px}.project-card{padding:16px;border-radius:17px}.project-card-info,.project-detail-summary{grid-template-columns:1fr}.project-card .project-plan-card-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.project-detail-backdrop{padding:0}.project-detail-panel{min-height:100dvh;border-radius:0}.project-stage-form,.project-daily-labor-form,.project-department-form,.project-finance-form,.project-invoice-form,.project-document-form,.project-supervisor-form{grid-template-columns:1fr}.project-stage-wide{grid-column:auto}.project-stage-item header,.project-department-card header,.project-finance-card header,.project-work-report-card header{flex-direction:column}.project-stage-metrics,.project-overview-grid,.project-team-lists,.project-finance-summary,.project-work-report-summary{grid-template-columns:1fr}.project-dashboard-header{gap:10px}.project-stage-weight,.project-task-header-actions{width:100%}.project-team-actions-bar .btn{width:100%}.project-task-header-actions{justify-content:stretch}.project-task-header-actions .btn{width:100%}.project-plan-task-row,.project-team-external-card{align-items:flex-start;display:flex;flex-direction:column}.project-dashboard-tabs{border-radius:0;margin-inline:-18px;padding-inline:18px}.project-dashboard-tab{min-width:104px}.project-tab-placeholder{align-items:flex-start;flex-direction:column}}
        @media(max-width:420px){.project-card .project-plan-card-actions{grid-template-columns:1fr}}
      `}</style>

    </>
  );
}
