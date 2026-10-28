'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import { buildCustodyWhatsapp } from '../../../lib/custodyWhatsapp.mjs';
import InventoryRequestsPanel from '../../../components/inventory/InventoryRequestsPanel';
import InventorySettlementsPanel from '../../../components/inventory/InventorySettlementsPanel';
import UnlinkedProductsDeleteModal from '../../../components/inventory/UnlinkedProductsDeleteModal';

const defaultCategories = [
  'كاميرات مراقبة',
  'NVR / DVR',
  'هاردات',
  'سويتشات',
  'راوترات',
  'كابلات شبكة',
  'كابلات كهرباء',
  'أجهزة VOIP',
  'أجهزة Access Control',
  'مواد منظومة حريق',
  'حساسات',
  'أدوات عمل',
  'عدد يدوية',
  'مواد كهربائية',
  'مواد استهلاكية',
  'طاقة شمسية',
  'مواد إنشائية',
  'أخرى',
];

const unitOptions = [
  ['PIECE', 'قطعة'],
  ['METER', 'متر'],
  ['ROLL', 'رول'],
  ['BOX', 'صندوق'],
  ['CARTON', 'كارتون'],
  ['KG', 'كغم'],
  ['LITER', 'لتر'],
  ['OTHER', 'أخرى'],
];

const productStatusLabels = {
  AVAILABLE: 'متوفر',
  LOW_STOCK: 'كمية قليلة',
  OUT_OF_STOCK: 'نافد',
  DAMAGED: 'تالف',
  ARCHIVED: 'مؤرشف',
};

const productStatusTone = {
  AVAILABLE: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
  DAMAGED: 'danger',
  ARCHIVED: 'neutral',
};

const requestStatusLabels = {
  PENDING_MANAGER_APPROVAL: 'بانتظار إدارة المواد',
  REJECTED: 'مرفوض من إدارة المواد',
  UNDER_REVIEW: 'معدل من إدارة المواد',
  PENDING_SUPPLIER_APPROVAL: 'محول إلى المخزن',
  IN_PROGRESS: 'بانتظار صرف المخزن',
  PREPARED: 'مصروف بالكامل',
  PENDING_RECEIPT: 'بانتظار استلام الفني',
  RECEIVED: 'تم الاستلام',
  PENDING_RECONCILIATION: 'قيد التصفية',
  RECONCILED: 'مصفى',
  CLOSED: 'مصفى',
  ARCHIVED: 'ملغي',
};

const movementLabels = {
  IN: 'إدخال كمية',
  OUT: 'صرف كمية',
  RETURN_IN: 'إرجاع كمية',
  DAMAGE: 'تسجيل تلف',
  LOSS: 'تسجيل فقدان',
  ADJUSTMENT: 'تعديل كمية',
  RESERVE: 'حجز',
  RELEASE: 'فك حجز',
};

const canAccessPermissions = [
  Permission.MANAGE_MATERIAL_CATALOG,
  Permission.MANAGE_MATERIAL_INVENTORY,
  Permission.REVIEW_MATERIAL_REQUESTS,
  Permission.PREPARE_MATERIAL_REQUESTS,
  Permission.DISPATCH_MATERIAL_REQUESTS,
  Permission.RECONCILE_MATERIAL_CUSTODY,
  Permission.CLOSE_MATERIAL_CUSTODY,
  Permission.VIEW_MATERIAL_REPORTS,
];

const emptyProduct = {
  name: '',
  code: '',
  barcode: '',
  category: defaultCategories[0],
  brand: '',
  model: '',
  description: '',
  unit: 'PIECE',
  warehouseId: '',
  storageLocation: '',
  shelfSection: '',
  currentQty: 0,
  minStock: 0,
  productStatus: 'AVAILABLE',
  supplierName: '',
  purchasePrice: 0,
  purchaseCurrency: 'IQD',
  purchaseDate: '',
  invoiceNo: '',
  notes: '',
};

const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('ar-IQ') : '-');
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString('ar-IQ') : '-');
const qty = (value) => Number(value || 0).toLocaleString('ar-IQ');
const productId = (item) => String(item?._id || item?.id || item || '');

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

function Pill({ tone = 'neutral', children }) {
  return <span className={`warehouse-pill warehouse-pill-${tone}`}>{children}</span>;
}

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  const label = (product?.name || '?').slice(0, 1);
  if (product?.imageUrl && !failed) {
    return (
      <img
        className="warehouse-product-img"
        src={assetUrl(product.imageUrl)}
        alt={product.name || 'product'}
        onError={() => setFailed(true)}
      />
    );
  }
  return <div className="warehouse-product-img warehouse-product-placeholder">{label}</div>;
}

function ProductModal({ product, warehouses, categories, saving, onClose, onSubmit, initialBarcode = '', stockEntry = null }) {
  const initialSourceBalance = product?._id
    ? (stockEntry?.warehouses?.find((item) => Number(item.qtyOnHand || 0) > 0) || stockEntry?.warehouses?.[0])
    : null;
  const [form, setForm] = useState(() => ({
    ...emptyProduct,
    ...(product || {}),
    barcode: product?.barcode || initialBarcode || '',
    purchasePrice: product?.estimatedUnitCost || product?.purchasePrice || 0,
    purchaseDate: product?.purchaseDate ? String(product.purchaseDate).slice(0, 10) : '',
    sourceWarehouseId: product?._id ? productId(initialSourceBalance?.warehouse) : '',
    warehouseId: product?._id ? productId(initialSourceBalance?.warehouse) : '',
    currentQty: product?._id ? Number(initialSourceBalance?.qtyOnHand || 0) : 0,
    transferMode: 'FULL',
    transferQty: product?._id ? Number(initialSourceBalance?.qtyOnHand || 0) : 0,
  }));
  const [image, setImage] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [tab, setTab] = useState('basic');
  const imagePreview = useMemo(() => {
    if (image) return URL.createObjectURL(image);
    return product?.imageUrl ? assetUrl(product.imageUrl) : '';
  }, [image, product?.imageUrl]);

  useEffect(() => () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (image && key === 'imageUrl') return;
      if (Array.isArray(value) || (value && typeof value === 'object')) return;
      formData.append(key, value ?? '');
    });
    if (image) formData.append('image', image);
    attachments.forEach((file) => formData.append('attachments', file));
    if (product?._id && form.sourceWarehouseId && form.warehouseId && form.sourceWarehouseId !== form.warehouseId) {
      formData.set('transferStockOnWarehouseChange', 'true');
      formData.set('transferQty', form.transferMode === 'PARTIAL' ? form.transferQty : form.currentQty);
    }
    onSubmit(formData);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel warehouse-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{product?._id ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
            <p className="daily-plan-modal-subtitle">بيانات المنتج والمخزن والباركود في نموذج واحد منظم.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="tabs-bar warehouse-tabs">
          {[
            ['basic', 'بيانات المنتج'],
            ['stock', 'بيانات المخزن'],
            ['extra', 'بيانات إضافية'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={`btn ${tab === value ? 'btn-primary' : 'btn-soft'}`} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>

        {tab === 'basic' ? (
          <div className="daily-plan-form-grid">
            <label>صورة المنتج<input className="input" type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} /></label>
            {imagePreview ? (
              <div className="warehouse-image-preview">
                <img src={imagePreview} alt="معاينة صورة المنتج" />
              </div>
            ) : null}
            <label>اسم المنتج<input className="input" required value={form.name} onChange={(e) => setValue('name', e.target.value)} /></label>
            <label>كود المنتج<input className="input" required value={form.code} onChange={(e) => setValue('code', e.target.value)} /></label>
            <label>باركود المنتج<input className="input" dir="ltr" value={form.barcode} onChange={(e) => setValue('barcode', e.target.value)} /></label>
            <label>التصنيف<select className="select" value={form.category} onChange={(e) => setValue('category', e.target.value)}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label>الماركة<input className="input" value={form.brand} onChange={(e) => setValue('brand', e.target.value)} /></label>
            <label>الموديل<input className="input" value={form.model} onChange={(e) => setValue('model', e.target.value)} /></label>
            <label>وحدة القياس<select className="select" value={form.unit} onChange={(e) => setValue('unit', e.target.value)}>{unitOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="grid-span-full">وصف المنتج<textarea className="textarea" value={form.description} onChange={(e) => setValue('description', e.target.value)} /></label>
          </div>
        ) : null}

        {tab === 'stock' ? (
          <div className="daily-plan-form-grid">
            {product?._id ? (
              <label>المخزن الحالي
                <select className="select" value={form.sourceWarehouseId} onChange={(e) => {
                  const sourceWarehouseId = e.target.value;
                  const selectedBalance = stockEntry?.warehouses?.find((item) => productId(item.warehouse) === sourceWarehouseId);
                  setForm((prev) => ({
                    ...prev,
                    sourceWarehouseId,
                    warehouseId: prev.warehouseId || sourceWarehouseId,
                    currentQty: Number(selectedBalance?.qtyOnHand || 0),
                    transferQty: Number(selectedBalance?.qtyOnHand || 0),
                  }));
                }}>
                  <option value="">اختر المخزن الحالي</option>
                  {(stockEntry?.warehouses || []).map((balance) => <option key={productId(balance.warehouse)} value={productId(balance.warehouse)}>{balance.warehouse?.name || '-'} — الرصيد {qty(balance.qtyOnHand)}</option>)}
                </select>
              </label>
            ) : null}
            <label>اسم المخزن<select className="select" value={form.warehouseId} onChange={(e) => setValue('warehouseId', e.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
            {product?._id && form.sourceWarehouseId && form.warehouseId && form.sourceWarehouseId !== form.warehouseId ? (
              <>
                <label>طريقة التحويل
                  <select className="select" value={form.transferMode} onChange={(e) => setForm((prev) => ({
                    ...prev,
                    transferMode: e.target.value,
                    transferQty: e.target.value === 'FULL' ? prev.currentQty : prev.transferQty,
                  }))}>
                    <option value="FULL">تحويل كامل الكمية</option>
                    <option value="PARTIAL">تحويل كمية محددة</option>
                  </select>
                </label>
                <label>كمية التحويل
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max={form.currentQty}
                    step="any"
                    disabled={form.transferMode === 'FULL'}
                    value={form.transferMode === 'FULL' ? form.currentQty : form.transferQty}
                    onChange={(e) => setValue('transferQty', e.target.value)}
                  />
                </label>
                <div className="maintenance-info-box">
                  <span>سيتم تحويل</span>
                  <strong>{qty(form.transferMode === 'FULL' ? form.currentQty : form.transferQty)} ويبقى {qty(Math.max(0, Number(form.currentQty || 0) - Number(form.transferMode === 'FULL' ? form.currentQty : form.transferQty || 0)))}</strong>
                </div>
              </>
            ) : null}
            <label>مكان التخزين<input className="input" value={form.storageLocation} onChange={(e) => setValue('storageLocation', e.target.value)} /></label>
            <label>الرف / القسم<input className="input" value={form.shelfSection} onChange={(e) => setValue('shelfSection', e.target.value)} /></label>
            <label>الكمية الحالية<input className="input" type="number" min="0" step="any" value={form.currentQty} onChange={(e) => setValue('currentQty', e.target.value)} /></label>
            <label>الحد الأدنى للتنبيه<input className="input" type="number" min="0" step="any" value={form.minStock} onChange={(e) => setValue('minStock', e.target.value)} /></label>
            <label>حالة المنتج<select className="select" value={form.productStatus} onChange={(e) => setValue('productStatus', e.target.value)}>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
        ) : null}

        {tab === 'extra' ? (
          <div className="daily-plan-form-grid">
            <label>المورد إن وجد<input className="input" value={form.supplierName} onChange={(e) => setValue('supplierName', e.target.value)} /></label>
            <label>سعر الشراء<input className="input" type="number" min="0" step="any" value={form.purchasePrice} onChange={(e) => setValue('purchasePrice', e.target.value)} /></label>
            <label>العملة<select className="select" value={form.purchaseCurrency} onChange={(e) => setValue('purchaseCurrency', e.target.value)}><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
            <label>تاريخ الشراء<input className="input" type="date" value={form.purchaseDate} onChange={(e) => setValue('purchaseDate', e.target.value)} /></label>
            <label>رقم الفاتورة<input className="input" value={form.invoiceNo} onChange={(e) => setValue('invoiceNo', e.target.value)} /></label>
            <label>مرفقات<input className="input" type="file" multiple onChange={(e) => setAttachments(Array.from(e.target.files || []))} /></label>
            <label className="grid-span-full">ملاحظات<textarea className="textarea" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
          </div>
        ) : null}

        <div className="form-actions form-actions-end">
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ المنتج'}</button>
        </div>
      </form>
    </div>
  );
}

function StockAdjustModal({ product, warehouses, mode, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ barcode: product?.barcode || '', materialId: product?._id || '', warehouseId: '', quantity: 1, unitCost: product?.estimatedUnitCost || 0, notes: '' });
  const isIn = mode === 'IN';
  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel warehouse-small-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{isIn ? 'إدخال كمية للمخزن' : 'صرف كمية من المخزن'}</h3>
            <p className="daily-plan-modal-subtitle">يمكن استخدام قارئ الباركود أو إدخال الرقم يدوياً.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="daily-plan-form-grid">
          <label>الباركود<input className="input" dir="ltr" autoFocus value={form.barcode} onChange={(e) => setValue('barcode', e.target.value)} /></label>
          <label>المخزن<select className="select" required value={form.warehouseId} onChange={(e) => setValue('warehouseId', e.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
          <label>الكمية<input className="input" type="number" min="0.0001" step="any" required value={form.quantity} onChange={(e) => setValue('quantity', e.target.value)} /></label>
          {isIn ? <label>سعر الشراء<input className="input" type="number" min="0" step="any" value={form.unitCost} onChange={(e) => setValue('unitCost', e.target.value)} /></label> : null}
          <label className="grid-span-full">ملاحظات<textarea className="textarea" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
        </div>
        <div className="form-actions form-actions-end">
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'جار التنفيذ...' : isIn ? 'إدخال الكمية' : 'صرف الكمية'}</button>
        </div>
      </form>
    </div>
  );
}

export default function WarehousesPage() {
  const currentUser = authStorage.getUser();
  const canAccess = hasAnyPermission(currentUser, canAccessPermissions);
  const canManageProducts = hasPermission(currentUser, Permission.MANAGE_MATERIAL_CATALOG);
  const canManageStock = hasPermission(currentUser, Permission.MANAGE_MATERIAL_INVENTORY);
  const canDeleteWarehouse = currentUser?.role === 'GENERAL_MANAGER';
  const canResetTechnicianCustodies = currentUser?.role === 'GENERAL_MANAGER';
  const [custodyResetOpen, setCustodyResetOpen] = useState(false);
  const [productsDeleteOpen, setProductsDeleteOpen] = useState(false);
  const canReviewRequests = canManageStock;
  const canPrepare = canManageStock;
  const canDispatch = hasPermission(currentUser, Permission.DISPATCH_MATERIAL_REQUESTS) || canManageStock;
  const canReconcile = hasAnyPermission(currentUser, [Permission.RECONCILE_MATERIAL_CUSTODY, Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY]);
  const canReports = hasPermission(currentUser, Permission.VIEW_MATERIAL_REPORTS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('cards');
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stock, setStock] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const [openCustodiesData, setOpenCustodiesData] = useState({ holders: [], totalHolders: 0 });
  const [reconciliations, setReconciliations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ search: '', barcode: '', category: '', brand: '', model: '', status: '', warehouseId: '', lowOnly: false, outOnly: false, includeArchived: false });
  const [editingProduct, setEditingProduct] = useState(null);
  const [detailsProduct, setDetailsProduct] = useState(null);
  const [initialBarcode, setInitialBarcode] = useState('');
  const [stockModal, setStockModal] = useState(null);
  const [warehouseDeleteModal, setWarehouseDeleteModal] = useState(null);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', code: '', location: '', notes: '', type: 'REGULAR' });
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [warehouseInventoryModal, setWarehouseInventoryModal] = useState(null);
  const [issueCart, setIssueCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartProduct, setCartProduct] = useState(null);
  const [issueForm, setIssueForm] = useState({ targetType: 'project', projectId: '', employeeId: '', notes: '' });
  const barcodeRef = useRef(null);

  const categories = useMemo(() => {
    const fromProducts = materials.map((item) => item.category).filter(Boolean);
    return [...new Set([...defaultCategories, ...fromProducts, ...customCategories])]
      .filter((category) => !hiddenCategories.includes(category))
      .sort();
  }, [materials, customCategories, hiddenCategories]);
  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.active !== false), [warehouses]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const filter = params.get('filter');
    const allowedTabs = new Set(['dashboard', 'products', 'categories', 'requests', 'stock-in', 'returns', 'custodies', 'settlements', 'damaged', 'movement', 'reports', 'settings']);
    if (tab && allowedTabs.has(tab)) setActiveTab(tab);
    if (tab === 'products') {
      setFilters((prev) => ({
        ...prev,
        status: filter === 'available' ? 'AVAILABLE' : '',
        lowOnly: filter === 'low',
        outOnly: filter === 'out',
      }));
    }
  }, []);

  const load = async (silent = false) => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const catalogQuery = filters.includeArchived ? '' : '?active=true';
      const [materialsRes, warehousesRes, stockRes, requestsRes, custodiesRes, openCustodiesRes, reconciliationsRes, projectsRes, employeesRes, summaryRes] = await Promise.all([
        api.get(`/materials/catalog${catalogQuery}`),
        api.get('/materials/warehouses'),
        api.get('/materials/stock'),
        api.get('/materials/requests'),
        api.get('/materials/custodies'),
        api.get('/materials/open-custodies-summary').catch(() => ({ holders: [], totalHolders: 0 })),
        api.get('/materials/reconciliations'),
        api.get('/projects').catch(() => ({ projects: [] })),
        api.get('/materials/employees').catch(() => ({ users: [] })),
        canReports ? api.get('/materials/reports/summary').catch(() => null) : Promise.resolve(null),
      ]);
      setMaterials(materialsRes.materials || []);
      setWarehouses(warehousesRes.warehouses || []);
      setStock(stockRes.balances || []);
      setRequests(requestsRes.requests || []);
      setCustodies(custodiesRes.custodies || []);
      setOpenCustodiesData(openCustodiesRes || { holders: [], totalHolders: 0 });
      setReconciliations(reconciliationsRes.reconciliations || []);
      setProjects(projectsRes.projects || []);
      setEmployees(employeesRes.users || []);
      setSummary(summaryRes);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات المخازن');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [canAccess, filters.includeArchived]);

  const stockByMaterial = useMemo(() => {
    const map = new Map();
    stock.forEach((balance) => {
      const id = productId(balance.material);
      const entry = map.get(id) || { qtyOnHand: 0, qtyReserved: 0, qtyAvailable: 0, warehouses: [] };
      entry.qtyOnHand += Number(balance.qtyOnHand || 0);
      entry.qtyReserved += Number(balance.qtyReserved || 0);
      if (balance.warehouse?.type !== 'DAMAGED') entry.qtyAvailable += Number(balance.qtyAvailable ?? (Number(balance.qtyOnHand || 0) - Number(balance.qtyReserved || 0)));
      entry.warehouses.push(balance);
      map.set(id, entry);
    });
    return map;
  }, [stock]);

  const products = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const barcode = filters.barcode.trim();
    return materials.filter((product) => {
      const stockEntry = stockByMaterial.get(productId(product)) || { qtyOnHand: 0, warehouses: [] };
      const warehouseMatch = !filters.warehouseId || stockEntry.warehouses.some((item) => productId(item.warehouse) === filters.warehouseId);
      const low = Number(stockEntry.qtyOnHand || 0) <= Number(product.minStock || 0) && Number(stockEntry.qtyOnHand || 0) > 0;
      const out = Number(stockEntry.qtyOnHand || 0) <= 0;
      const matchesSearch = !q
        || (product.name || '').toLowerCase().includes(q)
        || (product.code || '').toLowerCase().includes(q)
        || (product.barcode || '').toLowerCase().includes(q)
        || (product.category || '').toLowerCase().includes(q)
        || (product.brand || '').toLowerCase().includes(q)
        || (product.model || '').toLowerCase().includes(q);
      return matchesSearch
        && (!barcode || product.barcode === barcode)
        && (!filters.category || product.category === filters.category)
        && (!filters.brand || (product.brand || '').toLowerCase().includes(filters.brand.toLowerCase()))
        && (!filters.model || (product.model || '').toLowerCase().includes(filters.model.toLowerCase()))
        && (!filters.status || product.productStatus === filters.status)
        && warehouseMatch
        && (!filters.lowOnly || low)
        && (!filters.outOnly || out);
    });
  }, [materials, stockByMaterial, filters]);

  const workflowRequests = requests.filter((request) => !['RECONCILED', 'CLOSED', 'ARCHIVED'].includes(request.status));
  const transferredRequests = requests.filter((request) => ['PENDING_SUPPLIER_APPROVAL', 'IN_PROGRESS', 'PREPARED', 'PENDING_RECEIPT', 'PENDING_SETTLEMENT', 'RECEIVED'].includes(request.status));
  const openCustodies = openCustodiesData.holders?.length
    ? openCustodiesData.holders.flatMap((holder) => holder.custodies || [])
    : custodies.filter((item) => !['CLOSED', 'FULLY_RECONCILED'].includes(item.status));
  const pendingSettlements = reconciliations.filter((item) => ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status));
  const damagedQty = custodies.reduce((sum, custody) => sum + (custody.items || []).reduce((s, item) => s + Number(item.damagedQty || 0), 0), 0);
  const todayDispatches = requests.filter((request) => request.status === 'RECEIVED' && new Date(request.updatedAt || request.createdAt).toDateString() === new Date().toDateString()).length;
  const stockValue = stock.reduce((sum, balance) => sum + Number(balance.qtyOnHand || 0) * Number(balance.avgCost || balance.material?.estimatedUnitCost || 0), 0);
  const lowProducts = products.filter((product) => {
    const entry = stockByMaterial.get(productId(product)) || { qtyOnHand: 0 };
    return Number(entry.qtyOnHand || 0) <= Number(product.minStock || 0) && Number(entry.qtyOnHand || 0) > 0;
  });
  const outProducts = products.filter((product) => Number(stockByMaterial.get(productId(product))?.qtyOnHand || 0) <= 0);

  const searchBarcode = async (barcodeValue = filters.barcode) => {
    const barcode = String(barcodeValue || '').trim();
    if (!barcode) return;
    setError('');
    setBarcodeResult(null);
    try {
      const response = await api.get(`/materials/catalog/barcode/${encodeURIComponent(barcode)}`);
      setBarcodeResult(response.material);
      setDetailsProduct(response.material);
    } catch {
      setBarcodeResult(null);
      setError('لا يوجد منتج بهذا الباركود');
      setInitialBarcode(barcode);
    }
  };

  const saveProduct = async (formData) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (editingProduct?._id) {
        await api.patch(`/materials/catalog/${editingProduct._id}`, formData);
        setInfo('تم تعديل المنتج بنجاح.');
      } else {
        await api.post('/materials/catalog', formData);
        setInfo('تم إضافة المنتج بنجاح.');
      }
      setEditingProduct(null);
      setInitialBarcode('');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المنتج');
    } finally {
      setSaving(false);
    }
  };

  const archiveProduct = async (product) => {
    if (!window.confirm(`هل تريد أرشفة المنتج "${product.name}"؟`)) return;
    setSaving(true);
    setError('');
    try {
      await api.patch(`/materials/catalog/${product._id}`, { active: false, productStatus: 'ARCHIVED' });
      setInfo('تمت أرشفة المنتج.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر أرشفة المنتج');
    } finally {
      setSaving(false);
    }
  };

  const createCategory = (category) => {
    setCustomCategories((prev) => [...new Set([...prev, category])]);
    setHiddenCategories((prev) => prev.filter((item) => item !== category));
    setInfo('تمت إضافة التصنيف.');
  };

  const renameCategory = async (oldCategory, newCategory) => {
    const nextCategory = String(newCategory || '').trim();
    if (!nextCategory || nextCategory === oldCategory) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/materials/catalog/categories/${encodeURIComponent(oldCategory)}`, { category: nextCategory });
      setCustomCategories((prev) => [...new Set([...prev.filter((item) => item !== oldCategory), nextCategory])]);
      setHiddenCategories((prev) => [...new Set([...prev, oldCategory])].filter((item) => item !== nextCategory));
      setFilters((prev) => ({ ...prev, category: prev.category === oldCategory ? nextCategory : prev.category }));
      setInfo('تم تعديل التصنيف ونقل المنتجات إليه.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر تعديل التصنيف');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category) => {
    const productsCount = materials.filter((item) => item.category === category).length;
    const fallbackCategory = 'أخرى';
    const message = productsCount
      ? `سيتم حذف التصنيف "${category}" ونقل ${productsCount} منتج إلى "${fallbackCategory}". هل تريد المتابعة؟`
      : `هل تريد حذف التصنيف "${category}"؟`;
    if (!window.confirm(message)) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.delete(`/materials/catalog/categories/${encodeURIComponent(category)}`, { replacementCategory: fallbackCategory });
      setCustomCategories((prev) => prev.filter((item) => item !== category));
      setHiddenCategories((prev) => [...new Set([...prev, category])].filter((item) => item !== fallbackCategory));
      setFilters((prev) => ({ ...prev, category: prev.category === category ? '' : prev.category }));
      setInfo(productsCount ? 'تم حذف التصنيف ونقل منتجاته إلى التصنيف البديل.' : 'تم حذف التصنيف.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حذف التصنيف');
    } finally {
      setSaving(false);
    }
  };

  const saveWarehouse = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (editingWarehouse?._id) {
        await api.patch(`/materials/warehouses/${editingWarehouse._id}`, warehouseForm);
      } else {
        await api.post('/materials/warehouses', warehouseForm);
      }
      setWarehouseForm({ name: '', code: '', location: '', notes: '' });
      setEditingWarehouse(null);
      setInfo(editingWarehouse?._id ? 'تم تعديل بيانات المخزن بنجاح.' : 'تم إضافة المخزن بنجاح.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المخزن');
    } finally {
      setSaving(false);
    }
  };

  const startEditWarehouse = (warehouse) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({
      name: warehouse.name || '',
      code: warehouse.code || '',
      type: warehouse.type || 'REGULAR',
      location: warehouse.location || '',
      notes: warehouse.notes || '',
    });
  };

  const cancelEditWarehouse = () => {
    setEditingWarehouse(null);
    setWarehouseForm({ name: '', code: '', location: '', notes: '' });
  };

  const openWarehouseInventory = (warehouse) => {
    const rows = stock
      .filter((balance) => productId(balance.warehouse) === productId(warehouse))
      .map((balance) => ({
        materialName: balance.material?.name || '-',
        materialCode: balance.material?.code || '-',
        barcode: balance.material?.barcode || '-',
        brand: balance.material?.brand || '-',
        model: balance.material?.model || '-',
        category: balance.material?.category || '-',
        unit: balance.material?.unit || '-',
        qtyOnHand: Number(balance.qtyOnHand || 0),
        qtyReserved: Number(balance.qtyReserved || 0),
        qtyAvailable: Number(balance.qtyAvailable ?? (Number(balance.qtyOnHand || 0) - Number(balance.qtyReserved || 0))),
        avgCost: Number(balance.avgCost || balance.material?.estimatedUnitCost || 0),
        updatedAt: balance.updatedAt || balance.createdAt,
      }))
      .sort((a, b) => a.materialName.localeCompare(b.materialName, 'ar'));
    setWarehouseInventoryModal({ warehouse, rows });
  };

  const openPermanentDeleteWarehouse = (warehouse) => {
    if (!canDeleteWarehouse) return;
    const balances = stock
      .filter((balance) => productId(balance.warehouse) === productId(warehouse))
      .map((balance) => ({
        materialId: productId(balance.material),
        materialName: balance.material?.name || '-',
        materialCode: balance.material?.code || '',
        qtyOnHand: Number(balance.qtyOnHand || 0),
        qtyReserved: Number(balance.qtyReserved || 0),
        unit: balance.material?.unit || '',
      }));
    setWarehouseDeleteModal({ warehouse, confirmText: '', balances });
  };

  const deleteWarehousePermanently = async () => {
    if (!canDeleteWarehouse || !warehouseDeleteModal?.warehouse?._id) return;
    if (warehouseDeleteModal.confirmText.trim() !== warehouseDeleteModal.warehouse.name.trim()) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const result = await api.delete(`/materials/warehouses/${warehouseDeleteModal.warehouse._id}/permanent`, {
        confirmationName: warehouseDeleteModal.confirmText,
      });
      setInfo(`تم حذف المخزن وأرصدته وحركاته نهائياً، وحذف ${result.deletedMaterialsCount || 0} مادة خاصة به.${result.retainedSharedMaterialsCount ? ' تم الإبقاء على المواد المشتركة مع المخازن الأخرى.' : ''}`);
      setWarehouseDeleteModal(null);
      if (productId(editingWarehouse) === productId(warehouseDeleteModal.warehouse)) cancelEditWarehouse();
      setIssueCart([]);
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restoreWarehouse = async (warehouse) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/materials/warehouses/${warehouse._id}`, { active: true });
      setInfo('تم تفعيل المخزن.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر تفعيل المخزن');
    } finally {
      setSaving(false);
    }
  };

  const addProductToCart = (product) => {
    setCartProduct(product);
  };

  const confirmAddProductToCart = ({ product, warehouseId, quantity, issueType, notes }) => {
    const qtyValue = Math.max(0, Number(quantity || 0));
    if (!product || !warehouseId || qtyValue <= 0) {
      setError('اختر المخزن والكمية قبل إضافة المادة للسلة.');
      return;
    }
    if (issueCart.length && issueCart[0].warehouseId !== warehouseId) { setError('كل طلب مرتبط بمخزن واحد. أرسل السلة الحالية قبل طلب مواد من مخزن آخر.'); return; }
    setError('');
    setIssueCart((prev) => {
      const existing = prev.find((item) => productId(item.product) === productId(product) && item.warehouseId === warehouseId);
      if (existing) {
        return prev.map((item) => item === existing ? { ...item, quantity: Number(item.quantity || 0) + qtyValue, issueType, notes } : item);
      }
      return [...prev, { product, warehouseId, quantity: qtyValue, issueType, notes }];
    });
    setCartProduct(null);
    setInfo('تمت إضافة المادة إلى سلة طلب المواد.');
  };

  const updateCartItem = (index, patch) => {
    setIssueCart((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const removeCartItem = (index) => {
    setIssueCart((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const clearIssueCart = () => {
    setIssueCart([]);
    setCartOpen(false);
    setIssueForm({ targetType: 'project', projectId: '', employeeId: '', notes: '' });
  };

  const submitIssueCart = async () => {
    if (!issueCart.length) {
      setError('سلة طلب المواد فارغة.');
      return;
    }
    if (['project', 'both'].includes(issueForm.targetType) && !issueForm.projectId) {
      setError('اختر المشروع قبل الصرف.');
      return;
    }
    if (!issueForm.employeeId) {
      setError('اختر الفني قبل الصرف.');
      return;
    }
    const invalid = issueCart.find((item) => !item.warehouseId || Number(item.quantity || 0) <= 0);
    if (invalid) {
      setError('تأكد من اختيار المخزن والكمية لكل مادة في السلة.');
      return;
    }

    setCartOpen(false);
    setSaving(true);
    setError('');
    setInfo('');
    const referenceId = `CART-${Date.now()}`;

    try {
      await api.post('/materials/stock/cart-issue', {
        targetType: issueForm.targetType,
        projectId: ['project', 'both'].includes(issueForm.targetType) ? issueForm.projectId : '',
        employeeId: issueForm.employeeId,
        notes: issueForm.notes,
        referenceId,
        items: issueCart.map((item) => ({
          materialId: productId(item.product),
          warehouseId: item.warehouseId,
          quantity: Math.abs(Number(item.quantity || 0)),
          issueType: item.issueType,
          notes: item.notes,
        })),
      });
      clearIssueCart();
      setInfo('أرسل طلب المواد إلى أمين المخزن؛ لا يتم الصرف إلا بعد تجهيز الدفعة وقبول الفني.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر صرف مواد السلة');
    } finally {
      setSaving(false);
    }
  };

  const submitStockAdjust = async (form) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const transactionType = form.transactionType || (stockModal?.mode === 'OUT' ? 'OUT' : 'IN');
      const quantity = transactionType === 'OUT' ? -Math.abs(Number(form.quantity || 0)) : Math.abs(Number(form.quantity || 0));
      await api.post('/materials/stock/adjust', {
        ...form,
        quantity,
        transactionType,
        referenceType: form.referenceType || (transactionType === 'OUT' ? 'BARCODE_STOCK_OUT' : 'BARCODE_STOCK_IN'),
        referenceId: form.barcode || `STOCK-${Date.now()}`,
      });
      setStockModal(null);
      setInfo(stockModal?.mode === 'OUT' ? 'تم صرف الكمية من المخزن.' : 'تم إدخال الكمية إلى المخزن.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر تنفيذ حركة المخزون');
    } finally {
      setSaving(false);
    }
  };

  const submitStockAdjustBatch = async (items, mode = 'IN') => {
    if (!Array.isArray(items) || !items.length) {
      setError('قائمة الإدخال فارغة.');
      return false;
    }
    const invalid = items.find((item) => !item.materialId || !item.warehouseId || Number(item.quantity || 0) <= 0);
    if (invalid) {
      setError('تأكد من اختيار المنتج والمخزن والكمية لكل مادة في القائمة.');
      return false;
    }
    setSaving(true);
    setError('');
    setInfo('');
    const transactionType = mode === 'RETURN_IN' ? 'RETURN_IN' : 'IN';
    const referenceId = `${transactionType}-BATCH-${Date.now()}`;
    try {
      for (const item of items) {
        await api.post('/materials/stock/adjust', {
          materialId: item.materialId,
          barcode: item.barcode,
          warehouseId: item.warehouseId,
          quantity: Math.abs(Number(item.quantity || 0)),
          unitCost: item.unitCost,
          transactionType,
          referenceType: transactionType === 'RETURN_IN' ? 'BARCODE_RETURN_BATCH' : 'BARCODE_STOCK_IN_BATCH',
          referenceId,
          notes: item.notes,
        });
      }
      setInfo(transactionType === 'RETURN_IN' ? 'تم حفظ قائمة الإرجاع بنجاح.' : 'تم حفظ قائمة إدخال المواد بنجاح.');
      await load(true);
      return true;
    } catch (err) {
      setError(err.message || 'تعذر حفظ قائمة الإدخال');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const exportReport = async (type) => {
    setError('');
    try {
      const blob = await api.downloadBlob(`/materials/reports/${type}`);
      downloadBlob(blob, type === 'excel' ? 'warehouse-report.xlsx' : 'warehouse-report.pdf');
    } catch (err) {
      setError(err.message || 'فشل تصدير التقرير');
    }
  };

  const runInventoryAction = async (path, payload, message, method = 'patch') => {
    setSaving(true); setError(''); setInfo('');
    try { const result = await api[method](path, payload); setInfo(message); await load(true); return result; }
    catch (err) { setError(err.message); throw err; }
    finally { setSaving(false); }
  };
  const reviewWarehouseRequest = (request, action, payload = {}) => {
    const notes = action === 'REJECT' ? window.prompt('سبب رفض طلب المواد') : payload.notes || 'اعتماد كميات أمين المخزن';
    if (action === 'REJECT' && !notes?.trim()) return Promise.reject(new Error('سبب الرفض مطلوب'));
    return runInventoryAction(`/materials/requests/${request._id}/review`, { ...payload, action, notes }, action === 'REJECT' ? 'تم رفض الطلب.' : 'تم اعتماد الكميات للتجهيز والحجز.');
  };
  const prepareWarehouseRequest = (request, payload) => runInventoryAction(`/materials/requests/${request._id}/prepare`, payload, 'تم تجهيز وحجز الدفعة؛ بانتظار قبول الفني. لم يخصم الرصيد الفعلي بعد.');
  const confirmWarehouseReceipt = (request, action, notes) => runInventoryAction(`/materials/requests/${request._id}/confirm-receipt`, { action, notes, receiptToken: request.pendingReceipt?.id }, action === 'REJECT' ? 'رفضت الدفعة وفك حجزها.' : 'تم تأكيد الاستلام وخصم الرصيد وتسجيل الذمة.');
  const cancelWarehouseRemainder = (request, notes) => runInventoryAction(`/materials/requests/${request._id}/cancel-remaining`, { notes }, 'ألغي غير المستلم وفك حجزه. المواد المستلمة تبقى على ذمة الفني.');
  const deleteWarehouseRequest = (request, payload) => runInventoryAction(`/materials/requests/${request._id}`, payload, 'تم حذف الطلب من القوائم وفك حجز غير المستلم. الذمم والحركات المصروفة محفوظة.', 'delete');
  const reviewSettlement = (record, action) => {
    const reviewNotes = action === 'REJECT' ? window.prompt('ملاحظات رفض التصفية') : 'اعتماد أمين المخزن للكميات';
    if (action === 'REJECT' && !reviewNotes?.trim()) return Promise.reject(new Error('ملاحظات الرفض مطلوبة'));
    return runInventoryAction(`/materials/reconciliations/${record._id}/review`, { action, reviewNotes }, action === 'REJECT' ? 'تم رفض التصفية وإعادتها للفني.' : 'اعتمدت التصفية؛ استلم الفائض والتالف الفعلي إن وجد.');
  };
  const receiveSettlementReturns = (record, payload) => runInventoryAction(`/materials/reconciliations/${record._id}/returns`, payload, 'سجل الفائض في المخزن الصالح والتالف في مخزن التالف، وحدثت الذمة.', 'post');

  const openWarehouseKpi = (target) => {
    const go = (url) => { window.location.href = url; };
    if (target === 'allProducts') {
      go('/warehouses?tab=products');
    } else if (target === 'availableProducts') {
      go('/warehouses?tab=products&filter=available');
    } else if (target === 'lowProducts') {
      go('/warehouses?tab=products&filter=low');
    } else if (target === 'outProducts') {
      go('/warehouses?tab=products&filter=out');
    } else if (target === 'requests') {
      go('/warehouses?tab=requests');
    } else if (target === 'todayDispatches') {
      go('/warehouses?tab=movement');
    } else if (target === 'openCustodies') {
      go('/warehouses?tab=custodies');
    } else if (target === 'stockValue') {
      go('/warehouses?tab=reports');
    }
  };

  const openWarehouseTab = (tab) => {
    window.location.href = `/warehouses?tab=${encodeURIComponent(tab)}`;
  };

  if (!canAccess) return <section className="card section">لا تملك صلاحية الوصول إلى قسم المخازن.</section>;

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section daily-plan-hero warehouse-hero">
        <div>
          <h2>المخازن</h2>
          <p>إدارة منتجات المخزن، الباركود، الكميات، طلبات المواد، الذمم، التصفية، والتقارير.</p>
        </div>
        <div className="action-row">
          {canManageProducts ? <button className="btn btn-primary" onClick={() => setEditingProduct({})}>إضافة منتج جديد</button> : null}
          {canManageStock ? <button className="btn btn-primary" onClick={() => setCartOpen(true)}>سلة طلب المواد ({issueCart.length})</button> : null}
          <button className="btn btn-soft" onClick={() => window.location.href = '/materials'}>صفحة طلب المواد</button>
          {canReports ? <button className="btn btn-soft" onClick={() => exportReport('excel')}>Excel</button> : null}
          {canReports ? <button className="btn btn-soft" onClick={() => exportReport('pdf')}>PDF</button> : null}
          <button className="btn btn-soft" onClick={() => load()} disabled={loading}>{loading ? 'جار التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('allProducts')}><p className="maintenance-kpi-label">عدد المنتجات الكلي</p><h2>{materials.length}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('availableProducts')}><p className="maintenance-kpi-label">منتجات متوفرة</p><h2>{products.length - lowProducts.length - outProducts.length}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('lowProducts')}><p className="maintenance-kpi-label">كمية قليلة</p><h2>{lowProducts.length}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('outProducts')}><p className="maintenance-kpi-label">نافدة</p><h2>{outProducts.length}</h2></button>
      </section>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('requests')}><p className="maintenance-kpi-label">طلبات محولة</p><h2>{transferredRequests.length}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('todayDispatches')}><p className="maintenance-kpi-label">مصروف اليوم</p><h2>{todayDispatches}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('openCustodies')}><p className="maintenance-kpi-label">ذمم مفتوحة</p><h2>{openCustodies.length}</h2></button>
        <button type="button" className="card section warehouse-kpi-card" onClick={() => openWarehouseKpi('stockValue')}><p className="maintenance-kpi-label">قيمة المخزون</p><h2>{qty(stockValue)}</h2></button>
      </section>

      <section className="card section warehouse-toolbar" style={{ marginTop: 16 }}>
        <div className="tabs-bar warehouse-tabs">
          {[
            ['dashboard', 'لوحة تحكم المخازن'],
            ['products', 'منتجات المخزن'],
            ['categories', 'تصنيفات المنتجات'],
            ['requests', 'طلبات المواد المحولة'],
            ['stock-in', 'إدخال كميات'],
            ['returns', 'إرجاع المواد'],
            ['custodies', 'ذمم الفنيين'],
            ['settlements', 'طلبات التصفية'],
            ['damaged', 'التالفة والمفقودة'],
            ['movement', 'حركة المخزون'],
            ['reports', 'تقارير المخازن'],
            ['settings', 'إعدادات المخزن'],
          ].map(([value, label]) => <button key={value} className={`btn ${activeTab === value ? 'btn-primary' : 'btn-soft'}`} onClick={() => openWarehouseTab(value)}>{label}</button>)}
          {canResetTechnicianCustodies ? <button type="button" className="btn btn-danger" onClick={() => setCustodyResetOpen(true)}>تهيئة ذمم الفنيين</button> : null}
          {canDeleteWarehouse ? <button type="button" className="btn btn-danger" onClick={() => setProductsDeleteOpen(true)}>حذف المنتجات</button> : null}
        </div>
        <div className="warehouse-barcode-row">
          <label>بحث بالباركود<input ref={barcodeRef} className="input" dir="ltr" value={filters.barcode} onChange={(e) => setFilters((prev) => ({ ...prev, barcode: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') searchBarcode(e.currentTarget.value); }} placeholder="امسح الباركود أو اكتب الرقم ثم Enter" /></label>
          <button className="btn btn-primary" onClick={() => searchBarcode()}>بحث</button>
          {initialBarcode ? <button className="btn btn-soft" onClick={() => setEditingProduct({ barcode: initialBarcode })}>إضافة منتج جديد بهذا الباركود</button> : null}
        </div>
      </section>

      {activeTab === 'products' ? (
        <>
          <section className="card section" style={{ marginTop: 16 }}>
            <div className="daily-plan-filter-grid">
              <label>بحث<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} /></label>
              <label>التصنيف<select className="select" value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}><option value="">الكل</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>الماركة<input className="input" value={filters.brand} onChange={(e) => setFilters((prev) => ({ ...prev, brand: e.target.value }))} /></label>
              <label>الموديل<input className="input" value={filters.model} onChange={(e) => setFilters((prev) => ({ ...prev, model: e.target.value }))} /></label>
              <label>الحالة<select className="select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">الكل</option>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>المخزن<select className="select" value={filters.warehouseId} onChange={(e) => setFilters((prev) => ({ ...prev, warehouseId: e.target.value }))}><option value="">كل المخازن</option>{activeWarehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
              <label className="warehouse-check"><input type="checkbox" checked={filters.lowOnly} onChange={(e) => setFilters((prev) => ({ ...prev, lowOnly: e.target.checked }))} /> المنتجات الناقصة</label>
              <label className="warehouse-check"><input type="checkbox" checked={filters.outOnly} onChange={(e) => setFilters((prev) => ({ ...prev, outOnly: e.target.checked }))} /> المنتجات النافدة</label>
              <label className="warehouse-check"><input type="checkbox" checked={filters.includeArchived} onChange={(e) => setFilters((prev) => ({ ...prev, includeArchived: e.target.checked }))} /> إظهار المؤرشفة</label>
            </div>
            <div className="action-row" style={{ marginTop: 12 }}>
              <button className={`btn ${viewMode === 'cards' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setViewMode('cards')}>كروت</button>
              <button className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setViewMode('table')}>جدول</button>
              <button className="btn btn-soft" onClick={() => setFilters({ search: '', barcode: '', category: '', brand: '', model: '', status: '', warehouseId: '', lowOnly: false, outOnly: false, includeArchived: false })}>إعادة ضبط</button>
            </div>
          </section>
          <ProductsView
            products={products}
            stockByMaterial={stockByMaterial}
            viewMode={viewMode}
            canManageProducts={canManageProducts}
            canManageStock={canManageStock}
            onDetails={setDetailsProduct}
            onEdit={setEditingProduct}
            onArchive={archiveProduct}
            onAddToCart={addProductToCart}
            onStockIn={(product) => setStockModal({ mode: 'IN', product })}
            onStockOut={(product) => setStockModal({ mode: 'OUT', product })}
          />
        </>
      ) : null}

      {activeTab === 'dashboard' ? <DashboardPanels stock={stock} products={products} requests={transferredRequests} custodies={openCustodies} reconciliations={pendingSettlements} /> : null}
      {activeTab === 'categories' ? <CategoryCardsPanel categories={categories} products={materials} saving={saving} canManage={canManageProducts} onCreateCategory={createCategory} onRenameCategory={renameCategory} onDeleteCategory={deleteCategory} onAdd={(category) => { setEditingProduct({ category }); setActiveTab('products'); }} /> : null}
      {activeTab === 'requests' ? (
        <InventoryRequestsPanel requests={requests} warehouses={activeWarehouses} stockByMaterial={stockByMaterial} actor={currentUser} saving={saving} canManage={canManageStock} onReview={reviewWarehouseRequest} onPrepare={prepareWarehouseRequest} onConfirm={confirmWarehouseReceipt} onCancel={cancelWarehouseRemainder} onDelete={deleteWarehouseRequest} />
      ) : null}
      {activeTab === 'stock-in' ? <StockQuickPanel mode="IN" products={materials} warehouses={activeWarehouses} onSubmit={submitStockAdjust} onSubmitBatch={submitStockAdjustBatch} saving={saving} /> : null}
      {activeTab === 'returns' ? <InventorySettlementsPanel reconciliations={reconciliations} warehouses={activeWarehouses} actor={currentUser} canManage={canManageStock} saving={saving} onReview={reviewSettlement} onReceive={receiveSettlementReturns} /> : null}
      {activeTab === 'custodies' ? <CustodiesPanel custodies={custodies} employees={employees} openCustodiesData={openCustodiesData} onRefresh={() => load(true)} /> : null}
      {activeTab === 'settlements' ? <InventorySettlementsPanel reconciliations={reconciliations} warehouses={activeWarehouses} actor={currentUser} canManage={canManageStock} saving={saving} onReview={reviewSettlement} onReceive={receiveSettlementReturns} /> : null}
      {activeTab === 'damaged' ? <DamagedPanel custodies={custodies} stock={stock} /> : null}
      {activeTab === 'movement' ? <MovementPanel summary={summary} /> : null}
      {activeTab === 'reports' ? <ReportsPanel summary={summary} canReports={canReports} onExport={exportReport} /> : null}
      {activeTab === 'settings' ? <WarehouseSettingsPanel warehouses={warehouses} form={warehouseForm} saving={saving} canManageStock={canManageStock} canDeleteWarehouse={canDeleteWarehouse} editingWarehouse={editingWarehouse} onChange={setWarehouseForm} onCreate={saveWarehouse} onCancelEdit={cancelEditWarehouse} onEdit={startEditWarehouse} onShowInventory={openWarehouseInventory} onRestore={restoreWarehouse} onPermanentDelete={openPermanentDeleteWarehouse} /> : null}

      {editingProduct ? <ProductModal product={editingProduct} initialBarcode={editingProduct?.barcode || initialBarcode} warehouses={activeWarehouses} categories={categories} stockEntry={stockByMaterial.get(productId(editingProduct))} saving={saving} onClose={() => { setEditingProduct(null); setInitialBarcode(''); }} onSubmit={saveProduct} /> : null}
      {stockModal ? <StockAdjustModal product={stockModal.product} warehouses={activeWarehouses} mode={stockModal.mode} saving={saving} onClose={() => setStockModal(null)} onSubmit={submitStockAdjust} /> : null}
      {detailsProduct ? <ProductDetailsModal product={detailsProduct} stockEntry={stockByMaterial.get(productId(detailsProduct))} onClose={() => setDetailsProduct(null)} /> : null}
      {cartProduct ? <AddToCartModal product={cartProduct} warehouses={activeWarehouses.filter((warehouse) => warehouse.type !== 'DAMAGED')} stockEntry={stockByMaterial.get(productId(cartProduct))} onClose={() => setCartProduct(null)} onSubmit={confirmAddProductToCart} /> : null}
      {cartOpen ? <IssueCartModal cart={issueCart} warehouses={activeWarehouses.filter((warehouse) => warehouse.type !== 'DAMAGED')} projects={projects} employees={employees} form={issueForm} saving={saving} onChangeForm={setIssueForm} onUpdateItem={updateCartItem} onRemoveItem={removeCartItem} onClose={() => setCartOpen(false)} onClear={clearIssueCart} onSubmit={submitIssueCart} /> : null}
      {warehouseDeleteModal && canDeleteWarehouse ? <PermanentWarehouseDeleteModal state={warehouseDeleteModal} saving={saving} onClose={() => setWarehouseDeleteModal(null)} onChange={setWarehouseDeleteModal} onSubmit={deleteWarehousePermanently} /> : null}
      {productsDeleteOpen && canDeleteWarehouse ? <UnlinkedProductsDeleteModal onClose={() => setProductsDeleteOpen(false)} onComplete={async (result) => {
        const deletedIds = new Set(result.deletedMaterialIds || []);
        setProductsDeleteOpen(false);
        if (deletedIds.has(productId(detailsProduct))) setDetailsProduct(null);
        if (deletedIds.has(productId(barcodeResult))) setBarcodeResult(null);
        setIssueCart((prev) => prev.filter((item) => !deletedIds.has(productId(item.product))));
        setInfo(`تم حذف ${result.deletedMaterialsCount} منتجاً محدداً نهائياً.`);
        await load(true);
      }} /> : null}
      {custodyResetOpen && canResetTechnicianCustodies ? <TechnicianCustodyResetModal employees={employees} holders={openCustodiesData.holders || []} onClose={() => setCustodyResetOpen(false)} onComplete={async (result) => {
        setInfo(`تمت تهيئة ذمم ${result.technician.fullName} وحذف ${result.deletedCustodiesCount} ذمة مفتوحة.`);
        setCustodyResetOpen(false);
        await load(true);
      }} /> : null}
      {warehouseInventoryModal ? <WarehouseInventoryModal state={warehouseInventoryModal} onClose={() => setWarehouseInventoryModal(null)} /> : null}

      <style jsx global>{`
        .warehouse-hero h2 { margin-bottom: 6px; }
        .warehouse-hero p { margin: 0; color: var(--text-soft); }
        .warehouse-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; }
        .warehouse-kpi-card { border: 1px solid var(--border); width: 100%; text-align: start; cursor: pointer; color: inherit; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
        .warehouse-kpi-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: 0 14px 28px rgba(0, 92, 153, .16); }
        .warehouse-kpi-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .warehouse-kpi-card p,
        .warehouse-kpi-card h2 { pointer-events: none; }
        .warehouse-hero .action-row { display: grid; grid-template-columns: repeat(3, minmax(112px, 1fr)); gap: 8px; align-items: stretch; min-width: min(430px, 100%); }
        .warehouse-hero .action-row .btn,
        .warehouse-toolbar .btn,
        .warehouse-actions .btn,
        .warehouse-settings-form .btn,
        .warehouse-settings-grid .btn { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; text-align: center; white-space: nowrap; }
        .warehouse-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; width: 100%; }
        .warehouse-tabs .btn { width: 100%; padding-inline: 10px; }
        .warehouse-barcode-row { display: grid; grid-template-columns: minmax(240px, 1fr) auto auto; gap: 10px; align-items: end; }
        .warehouse-check { display: flex; align-items: center; gap: 8px; min-height: 42px; }
        .warehouse-pill { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .warehouse-pill-success { background: rgba(34, 197, 94, 0.14); color: #15803d; }
        .warehouse-pill-warning { background: rgba(245, 158, 11, 0.16); color: #b45309; }
        .warehouse-pill-danger { background: rgba(220, 38, 38, 0.14); color: #b91c1c; }
        .warehouse-pill-info { background: rgba(59, 130, 246, 0.14); color: #1d4ed8; }
        .warehouse-pill-neutral { background: rgba(100, 116, 139, 0.14); color: var(--text-soft); }
        .warehouse-modal { width: min(1040px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; }
        .warehouse-small-modal { width: min(720px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; }
        .warehouse-cart-modal { width: min(1180px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; }
        .warehouse-product-img { width: 74px; height: 74px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-soft); }
        .warehouse-product-placeholder { display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--text-soft); }
        .warehouse-image-preview { width: 112px; height: 112px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface-soft); }
        .warehouse-image-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .warehouse-actions { display: grid; grid-template-columns: repeat(2, minmax(112px, 1fr)); gap: 8px; margin-top: 14px; }
        .warehouse-actions .btn { width: 100%; }
        .warehouse-toolbar .action-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .warehouse-toolbar .action-row .btn { min-width: 96px; }
        .warehouse-settings-form .form-actions { display: flex; justify-content: flex-end; }
        .warehouse-settings-form .btn { min-width: 150px; }
        .warehouse-settings-grid .daily-plan-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
        .warehouse-settings-grid .btn { min-width: 118px; }
        .section-header > .action-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, max-content)); gap: 8px; justify-content: end; align-items: center; }
        .section-header > .action-row .btn { min-height: 40px; min-width: 128px; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
        .section-header > .action-row .input { min-width: 220px; }
        .warehouse-cart-target { margin-bottom: 16px; }
        .warehouse-cart-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
        .warehouse-cart-table { min-width: 980px; margin: 0; }
        .warehouse-cart-table th,
        .warehouse-cart-table td { vertical-align: middle; }
        .warehouse-cart-product { display: flex; align-items: center; gap: 10px; min-width: 210px; }
        .warehouse-cart-product .warehouse-product-img { width: 54px; height: 54px; flex: 0 0 auto; }
        .warehouse-cart-footer { display: grid; grid-template-columns: auto auto minmax(260px, 1fr); gap: 12px; align-items: center; margin-top: 14px; }
        .warehouse-cart-footer .form-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .warehouse-cart-footer .btn { min-width: 112px; min-height: 40px; }
        @media (max-width: 760px) {
          .warehouse-hero { grid-template-columns: 1fr; }
          .warehouse-hero .action-row { grid-template-columns: 1fr 1fr; min-width: 0; }
          .warehouse-barcode-row { grid-template-columns: 1fr; }
          .warehouse-actions { grid-template-columns: 1fr 1fr; }
          .section-header > .action-row { grid-template-columns: 1fr; justify-content: stretch; width: 100%; }
          .section-header > .action-row .btn,
          .section-header > .action-row .input { width: 100%; min-width: 0; }
          .warehouse-cart-footer { grid-template-columns: 1fr; }
          .warehouse-cart-footer .form-actions { justify-content: stretch; }
          .warehouse-cart-footer .btn { width: 100%; }
        }
        @media (max-width: 480px) {
          .warehouse-hero .action-row,
          .warehouse-actions { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}

function ProductsView({ products, stockByMaterial, viewMode, canManageProducts, canManageStock, onDetails, onEdit, onArchive, onAddToCart, onStockIn, onStockOut }) {
  if (viewMode === 'table') {
    return (
      <section className="card section" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table className="table warehouse-table">
          <thead><tr><th>الصورة</th><th>المنتج</th><th>الكود</th><th>الباركود</th><th>التصنيف</th><th>الماركة</th><th>الموديل</th><th>الكمية</th><th>الوحدة</th><th>مكان التخزين</th><th>الحالة</th><th>آخر تحديث</th><th>خيارات</th></tr></thead>
          <tbody>
            {products.map((product) => {
              const stockEntry = stockByMaterial.get(productId(product)) || { qtyOnHand: 0 };
              return (
                <tr key={product._id}>
                  <td><ProductImage product={product} /></td>
                  <td>{product.name}</td>
                  <td>{product.code}</td>
                  <td dir="ltr">{product.barcode || '-'}</td>
                  <td>{product.category || '-'}</td>
                  <td>{product.brand || '-'}</td>
                  <td>{product.model || '-'}</td>
                  <td>{qty(stockEntry.qtyOnHand)}</td>
                  <td>{unitOptions.find(([value]) => value === product.unit)?.[1] || product.unit}</td>
                  <td>{product.storageLocation || product.shelfSection || '-'}</td>
                  <td><Pill tone={productStatusTone[product.productStatus]}>{productStatusLabels[product.productStatus] || product.productStatus}</Pill></td>
                  <td>{fmtDate(product.updatedAt)}</td>
                  <td><ProductActions product={product} canManageProducts={canManageProducts} canManageStock={canManageStock} onDetails={onDetails} onEdit={onEdit} onArchive={onArchive} onAddToCart={onAddToCart} onStockIn={onStockIn} onStockOut={onStockOut} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="daily-plan-card-grid warehouse-product-grid">
        {products.map((product) => {
          const stockEntry = stockByMaterial.get(productId(product)) || { qtyOnHand: 0, qtyAvailable: 0 };
          return (
            <article className="daily-plan-card warehouse-product-card" key={product._id}>
              <div className="warehouse-product-head">
                <ProductImage product={product} />
                <div>
                  <strong>{product.name}</strong>
                  <div className="daily-plan-card-subtitle">{product.code} / {product.barcode || 'بدون باركود'}</div>
                  <Pill tone={productStatusTone[product.productStatus]}>{productStatusLabels[product.productStatus] || product.productStatus}</Pill>
                </div>
              </div>
              <div className="daily-plan-mini-grid">
                <div><span>التصنيف</span><strong>{product.category || '-'}</strong></div>
                <div><span>الماركة</span><strong>{product.brand || '-'}</strong></div>
                <div><span>الموديل</span><strong>{product.model || '-'}</strong></div>
                <div><span>الكمية</span><strong>{qty(stockEntry.qtyOnHand)}</strong></div>
                <div><span>الوحدة</span><strong>{unitOptions.find(([value]) => value === product.unit)?.[1] || product.unit}</strong></div>
                <div><span>مكان التخزين</span><strong>{product.storageLocation || product.shelfSection || '-'}</strong></div>
              </div>
              <ProductActions product={product} canManageProducts={canManageProducts} canManageStock={canManageStock} onDetails={onDetails} onEdit={onEdit} onArchive={onArchive} onAddToCart={onAddToCart} onStockIn={onStockIn} onStockOut={onStockOut} />
            </article>
          );
        })}
        {!products.length ? <p className="maintenance-empty">لا توجد منتجات مطابقة.</p> : null}
      </div>
      <style jsx>{`
        .warehouse-product-grid { grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
        .warehouse-product-card { min-height: 300px; }
        .warehouse-product-head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
        @media (max-width: 760px) { .warehouse-product-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}

function AddToCartModal({ product, warehouses, stockEntry, onClose, onSubmit }) {
  const defaultWarehouse = stockEntry?.warehouses?.find((item) => item.warehouse?.type !== 'DAMAGED' && Number(item.qtyAvailable ?? item.qtyOnHand ?? 0) > 0)?.warehouse;
  const [form, setForm] = useState({
    warehouseId: productId(defaultWarehouse) || warehouses[0]?._id || '',
    quantity: 1,
    issueType: 'custody',
    notes: '',
  });
  const selectedWarehouseStock = stockEntry?.warehouses?.find((item) => productId(item.warehouse) === form.warehouseId);
  const availableQty = Number(selectedWarehouseStock?.qtyAvailable ?? selectedWarehouseStock?.qtyOnHand ?? 0);
  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const canAdd = Boolean(form.warehouseId && Number(form.quantity || 0) > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-panel warehouse-small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAdd) onSubmit({ product, ...form });
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>إضافة للسلة</h3>
            <p className="daily-plan-modal-subtitle">حدد الكمية والمخزن قبل إضافة المادة إلى سلة طلب المواد.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="warehouse-cart-product warehouse-add-cart-product">
          <ProductImage product={product} />
          <div>
            <strong>{product.name}</strong>
            <div className="daily-plan-card-subtitle">{[product.code, product.barcode, product.category].filter(Boolean).join(' - ') || '-'}</div>
          </div>
        </div>

        <div className="daily-plan-form-grid">
          <label>المخزن
            <select className="select" value={form.warehouseId} onChange={(e) => setValue('warehouseId', e.target.value)}>
              <option value="">اختر المخزن</option>
              {warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}
            </select>
          </label>
          <label>الكمية
            <input className="input" type="number" min="0.0001" step="any" autoFocus value={form.quantity} onChange={(e) => setValue('quantity', e.target.value)} />
          </label>
          <p>تسجل الكمية على ذمة الفني عند قبوله الاستلام، ويحدد الاستهلاك عند التصفية.</p>
          <div className="daily-plan-card-subtitle warehouse-available-note">المتوفر في المخزن المختار: {qty(availableQty)}</div>
          <label className="grid-span-full">ملاحظة<input className="input" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
        </div>

        <div className="form-actions form-actions-end">
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!canAdd}>إضافة للسلة</button>
        </div>
        <style jsx>{`
          .warehouse-add-cart-product { margin-bottom: 16px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); }
          .warehouse-available-note { align-self: end; min-height: 40px; display: flex; align-items: center; }
        `}</style>
      </form>
    </div>
  );
}

function IssueCartModal({ cart, warehouses, projects, employees, form, saving, onChangeForm, onUpdateItem, onRemoveItem, onClose, onClear, onSubmit }) {
  const setForm = (key, value) => onChangeForm((prev) => ({ ...prev, [key]: value }));
  const totalQty = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel warehouse-cart-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>سلة صرف المواد</h3>
            <p className="daily-plan-modal-subtitle">أرسل طلباً بالمواد لأمين المخزن، ثم يقبل الفني الدفعة المجهزة لتسجيل الذمة.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="daily-plan-form-grid warehouse-cart-target">
          <label>نوع الصرف
            <select className="select" value={form.targetType} onChange={(e) => setForm('targetType', e.target.value)}>
              <option value="project">ذمة مشروع</option>
              <option value="technician">ذمة فني</option>
              <option value="both">ذمة فني ومشروع معاً</option>
            </select>
          </label>
          {['project', 'both'].includes(form.targetType) ? (
            <label>المشروع
              <select className="select" value={form.projectId} onChange={(e) => setForm('projectId', e.target.value)}>
                <option value="">اختر المشروع</option>
                {projects.map((project) => <option key={project._id} value={project._id}>{project.name || project.code}</option>)}
              </select>
            </label>
          ) : null}
          {true ? (
            <label>الفني
              <select className="select" value={form.employeeId} onChange={(e) => setForm('employeeId', e.target.value)}>
                <option value="">اختر الفني</option>
                {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.fullName || employee.employeeCode}</option>)}
              </select>
            </label>
          ) : null}
          <label className="grid-span-full">ملاحظات الصرف<textarea className="textarea" value={form.notes} onChange={(e) => setForm('notes', e.target.value)} /></label>
        </div>

        <div className="table-responsive warehouse-cart-table-wrap">
          <table className="table warehouse-cart-table">
            <thead>
              <tr>
                <th>المادة</th>
                <th>المخزن</th>
                <th>الكمية</th>
                <th>نوع القيد</th>
                <th>ملاحظة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, index) => (
                <tr key={`${productId(item.product)}-${index}`}>
                  <td>
                    <div className="warehouse-cart-product">
                      <ProductImage product={item.product} />
                      <div>
                        <strong>{item.product.name}</strong>
                        <div className="daily-plan-card-subtitle">{item.product.code || item.product.barcode || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select className="select" value={item.warehouseId} onChange={(e) => onUpdateItem(index, { warehouseId: e.target.value })}>
                      <option value="">اختر المخزن</option>
                      {warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" min="0.0001" step="any" value={item.quantity} onChange={(e) => onUpdateItem(index, { quantity: e.target.value })} /></td>
                  <td>ذمة عند قبول الاستلام</td>
                  <td><input className="input" value={item.notes || ''} onChange={(e) => onUpdateItem(index, { notes: e.target.value })} /></td>
                  <td><button type="button" className="btn btn-soft btn-sm" onClick={() => onRemoveItem(index)}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cart.length ? <p className="maintenance-empty">السلة فارغة.</p> : null}
        </div>

        <div className="warehouse-cart-footer">
          <strong>عدد المواد: {cart.length}</strong>
          <strong>إجمالي الكميات: {qty(totalQty)}</strong>
          <div className="form-actions">
            <button type="button" className="btn btn-soft" onClick={onClear} disabled={!cart.length || saving}>تفريغ السلة</button>
            <button type="button" className="btn btn-soft" onClick={onClose}>إغلاق</button>
            <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={!cart.length || saving}>{saving ? 'جار إرسال الطلب...' : 'إرسال طلب المواد'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductActions({ product, canManageProducts, canManageStock, onDetails, onEdit, onArchive, onAddToCart, onStockIn, onStockOut }) {
  return (
    <div className="form-actions daily-plan-actions warehouse-actions">
      <button className="btn btn-soft btn-sm" onClick={() => onDetails(product)}>عرض التفاصيل</button>
      {canManageStock ? <button className="btn btn-primary btn-sm" onClick={() => onAddToCart(product)}>إضافة للسلة</button> : null}
      {canManageProducts ? <button className="btn btn-soft btn-sm" onClick={() => onEdit(product)}>تعديل</button> : null}
      {canManageProducts ? <button className="btn btn-soft btn-sm" onClick={() => onArchive(product)}>أرشفة</button> : null}
      {canManageStock ? <button className="btn btn-primary btn-sm" onClick={() => onStockIn(product)}>إدخال</button> : null}
      <style jsx>{`.warehouse-actions { flex-wrap: wrap; margin-top: 12px; }`}</style>
    </div>
  );
}

function DashboardPanels({ stock, products, requests, custodies, reconciliations }) {
  const recent = [
    ...requests.slice(0, 4).map((item) => ({ label: `طلب مواد ${item.requestNo}`, kind: 'طلب محول للمخزن', date: item.updatedAt || item.createdAt })),
    ...custodies.slice(0, 4).map((item) => ({ label: `ذمة ${item.custodyNo}`, kind: 'إنشاء ذمة', date: item.openedAt || item.createdAt })),
    ...reconciliations.slice(0, 4).map((item) => ({ label: `تصفية ${item.reconcileNo}`, kind: 'طلب تصفية', date: item.submittedAt || item.createdAt })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 8);
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="warehouse-dashboard-grid">
        <article className="warehouse-panel">
          <h3>آخر حركات المخزن</h3>
          {recent.map((item) => <div className="warehouse-line" key={`${item.kind}-${item.label}`}><span>{item.kind}</span><strong>{item.label}</strong><small>{fmtDateTime(item.date)}</small></div>)}
          {!recent.length ? <p className="daily-plan-modal-subtitle">لا توجد حركات حديثة.</p> : null}
        </article>
        <article className="warehouse-panel">
          <h3>تنبيهات الكمية</h3>
          {products.slice(0, 8).map((product) => <div className="warehouse-line" key={product._id}><span>{product.name}</span><strong>{product.productStatus ? productStatusLabels[product.productStatus] : '-'}</strong></div>)}
        </article>
      </div>
      <style jsx>{`
        .warehouse-dashboard-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
        .warehouse-panel { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface); }
        .warehouse-panel h3 { margin-top: 0; }
        .warehouse-line { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); align-items: center; }
        .warehouse-line small { color: var(--text-soft); }
        @media (max-width: 760px) { .warehouse-dashboard-grid { grid-template-columns: 1fr; } .warehouse-line { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}

function TechnicianCustodyResetModal({ employees, holders, onClose, onComplete }) {
  const [technicianId, setTechnicianId] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const options = useMemo(() => {
    const map = new Map(employees.map((employee) => [productId(employee), { id: productId(employee), name: employee.fullName, code: employee.employeeCode }]));
    holders.forEach((holder) => { if (!map.has(String(holder.holderId))) map.set(String(holder.holderId), { id: String(holder.holderId), name: holder.holderName, code: holder.employeeCode }); });
    return [...map.values()].filter((employee) => employee.id && employee.id !== 'unknown').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [employees, holders]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null); setConfirmationName(''); setError('');
    if (!technicianId) { setLoading(false); return () => { cancelled = true; }; }
    setLoading(true);
    api.get(`/materials/custodies/reset-preview?technicianId=${encodeURIComponent(technicianId)}`)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setError(err.message || 'تعذر تحميل ذمم الفني'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [technicianId, revision]);

  const currentPreview = preview?.technician.id === technicianId ? preview : null;
  const canSubmit = !loading && !busy && currentPreview?.custodies.length > 0
    && confirmationName.trim() === currentPreview.technician.fullName.trim();
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError('');
    try {
      const result = await api.delete('/materials/custodies/reset', { technicianId, confirmationName, previewToken: currentPreview.previewToken });
      await onComplete(result);
    } catch (err) { setError(err.message || 'تعذرت تهيئة ذمم الفني'); }
    finally { setBusy(false); }
  };
  const labels = { OPEN: 'مفتوحة', PARTIALLY_RECONCILED: 'مصفاة جزئياً', PENDING_RECONCILIATION: 'بانتظار التصفية', OVERDUE: 'متأخرة' };
  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal-panel warehouse-cart-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3>تهيئة ذمم الفنيين</h3><button type="button" className="modal-close" onClick={onClose} disabled={busy}>&times;</button></div>
        <p>اختر الفني لمعاينة جميع ذممه المفتوحة وغير المصفاة قبل حذفها نهائياً. تبقى الذمم المغلقة والمصفاة بالكامل محفوظة.</p>
        <label>الفني *<select className="select" value={technicianId} disabled={busy} onChange={(event) => { setTechnicianId(event.target.value); setPreview(null); setConfirmationName(''); }} style={{ width: '100%' }}>
          <option value="">اختر الفني</option><option value="unassigned">ذمم بدون فني</option>{options.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.code ? ` — ${employee.code}` : ''}</option>)}
        </select></label>
        {loading ? <p role="status">جار تحميل الذمم...</p> : null}
        {error ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
        {currentPreview ? <>
          <p>عدد الذمم التي ستُحذف: <strong>{currentPreview.custodies.length}</strong></p>
          <div className="warehouse-cart-table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="table"><thead><tr><th>رقم الذمة</th><th>الحالة</th><th>البنود</th><th>الكمية المتبقية</th></tr></thead>
            <tbody>{currentPreview.custodies.length ? currentPreview.custodies.map((custody) => <tr key={custody.id}><td>{custody.custodyNo}</td><td>{labels[custody.status] || custody.status}</td><td>{custody.itemsCount}</td><td>{qty(custody.remainingQty)}</td></tr>) : <tr><td colSpan={4}>لا توجد ذمم مفتوحة أو غير مصفاة لهذا الفني.</td></tr>}</tbody>
          </table></div>
          {currentPreview.custodies.length ? <>
            <p style={{ color: '#fca5a5' }}>ستُحذف الذمم المعروضة وسجلات تصفيتها وإرجاعها المرتبطة. لا يتم إرجاع مواد إلى المخزن أو تعديل أرصدته، ولا تتأثر ذمم بقية الفنيين.</p>
            <label>اكتب اسم الفني «{currentPreview.technician.fullName}» لتأكيد الحذف<input className="input" autoComplete="off" value={confirmationName} disabled={busy} onChange={(event) => setConfirmationName(event.target.value)} style={{ width: '100%' }} /></label>
          </> : null}
        </> : null}
        <div className="form-actions form-actions-end" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="button" className="btn btn-soft" onClick={() => setRevision((value) => value + 1)} disabled={busy || loading || !technicianId}>تحديث المعاينة</button>
          <button type="button" className="btn btn-danger" onClick={submit} disabled={!canSubmit}>{busy ? 'جار التهيئة...' : 'حذف الذمم المفتوحة'}</button>
        </div>
      </div>
    </div>
  );
}

function PermanentWarehouseDeleteModal({ state, saving, onClose, onChange, onSubmit }) {
  const canSubmit = !saving && state.confirmText.trim() === state.warehouse.name.trim();
  return (
    <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div className="modal-panel warehouse-cart-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h3>حذف المخزن ومواده نهائياً</h3><p className="daily-plan-modal-subtitle">{state.warehouse.name} — {state.warehouse.code}</p></div>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>&times;</button>
        </div>
        <p style={{ color: '#fca5a5' }}>سيتم حذف المخزن وجميع أرصدته وحركاته والمواد الخاصة به نهائياً، بما فيها الكميات المحجوزة. تبقى المواد المشتركة وأرصدة المخازن الأخرى محفوظة.</p>
        <div className="warehouse-cart-table-wrap">
          <table className="table warehouse-cart-table">
            <thead><tr><th>المادة</th><th>الكود</th><th>الرصيد</th><th>محجوز</th></tr></thead>
            <tbody>{state.balances.length ? state.balances.map((item, index) => <tr key={item.materialId || index}>
              <td>{item.materialName}</td><td dir="ltr">{item.materialCode || '-'}</td><td>{qty(item.qtyOnHand)}</td><td>{qty(item.qtyReserved)}</td>
            </tr>) : <tr><td colSpan={4}>لا توجد أرصدة داخل هذا المخزن.</td></tr>}</tbody>
          </table>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>اكتب اسم المخزن «{state.warehouse.name}» لتأكيد الحذف
          <input className="input" autoComplete="off" value={state.confirmText} disabled={saving} onChange={(event) => onChange((prev) => ({ ...prev, confirmText: event.target.value }))} placeholder={state.warehouse.name} style={{ width: '100%' }} />
        </label>
        <div className="form-actions form-actions-end" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>إلغاء</button>
          <button type="button" className="btn btn-danger" onClick={onSubmit} disabled={!canSubmit}>{saving ? 'جار الحذف...' : 'حذف المخزن ومواده نهائياً'}</button>
        </div>
      </div>
    </div>
  );
}

function WarehouseInventoryModal({ state, onClose }) {
  const exportRows = state.rows || [];
  const headers = ['المادة', 'الكود', 'الباركود', 'الماركة', 'الموديل', 'التصنيف', 'الوحدة', 'الرصيد', 'محجوز', 'المتاح', 'متوسط الكلفة', 'آخر تحديث'];
  const rows = exportRows.map((row) => [
    row.materialName,
    row.materialCode,
    row.barcode,
    row.brand,
    row.model,
    row.category,
    row.unit,
    row.qtyOnHand,
    row.qtyReserved,
    row.qtyAvailable,
    row.avgCost,
    fmtDateTime(row.updatedAt),
  ]);
  const totalQty = exportRows.reduce((sum, row) => sum + Number(row.qtyOnHand || 0), 0);
  const totalAvailable = exportRows.reduce((sum, row) => sum + Number(row.qtyAvailable || 0), 0);

  const exportExcel = () => {
    const tableRows = [headers, ...rows]
      .map((cells) => `<tr>${cells.map((cell) => `<td>${String(cell ?? '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8" /></head><body><h2>جرد مواد ${state.warehouse.name}</h2><table border="1">${tableRows}</table></body></html>`;
    downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `جرد-${state.warehouse.code || state.warehouse.name}.xls`);
  };

  const exportPdf = () => {
    const tableRows = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${String(cell ?? '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))}</td>`).join('')}</tr>`).join('');
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8" /><title>جرد ${state.warehouse.name}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#08233f}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #9db7d0;padding:6px;text-align:right}th{background:#0b4f82;color:white}.summary{display:flex;gap:12px;margin:14px 0}.box{border:1px solid #9db7d0;border-radius:8px;padding:10px 14px}</style></head><body><h1>جرد مواد المخزن</h1><p>${state.warehouse.name} - ${state.warehouse.code || ''}</p><div class="summary"><div class="box">عدد المواد: ${exportRows.length}</div><div class="box">إجمالي الرصيد: ${qty(totalQty)}</div><div class="box">المتاح: ${qty(totalAvailable)}</div></div><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${tableRows || `<tr><td colspan="${headers.length}">لا توجد مواد</td></tr>`}</tbody></table><script>window.onload=()=>{window.print();}</script></body></html>`;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel warehouse-cart-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>مواد المخزن - {state.warehouse.name}</h3>
            <p className="daily-plan-modal-subtitle">جرد تفصيلي بالكميات والرصيد المحجوز والمتاح وكافة بيانات المادة.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="daily-plan-mini-grid" style={{ marginBottom: 12 }}>
          <div><span>عدد المواد</span><strong>{exportRows.length}</strong></div>
          <div><span>إجمالي الرصيد</span><strong>{qty(totalQty)}</strong></div>
          <div><span>المتاح للصرف</span><strong>{qty(totalAvailable)}</strong></div>
        </div>
        <div className="form-actions form-actions-end" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={exportExcel}>Excel</button>
          <button type="button" className="btn btn-soft" onClick={exportPdf}>PDF</button>
        </div>
        <div className="warehouse-cart-table-wrap">
          <table className="table warehouse-cart-table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {exportRows.length ? exportRows.map((row) => (
                <tr key={`${row.materialCode}-${row.materialName}`}>
                  <td><strong>{row.materialName}</strong></td>
                  <td dir="ltr">{row.materialCode}</td>
                  <td dir="ltr">{row.barcode}</td>
                  <td>{row.brand}</td>
                  <td>{row.model}</td>
                  <td>{row.category}</td>
                  <td>{row.unit}</td>
                  <td>{qty(row.qtyOnHand)}</td>
                  <td>{qty(row.qtyReserved)}</td>
                  <td>{qty(row.qtyAvailable)}</td>
                  <td>{qty(row.avgCost)}</td>
                  <td>{fmtDateTime(row.updatedAt)}</td>
                </tr>
              )) : <tr><td colSpan={headers.length} style={{ textAlign: 'center', color: 'var(--text-soft)' }}>لا توجد مواد داخل هذا المخزن.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WarehouseSettingsPanel({ warehouses, form, saving, canManageStock, canDeleteWarehouse, editingWarehouse, onChange, onCreate, onCancelEdit, onEdit, onShowInventory, onRestore, onPermanentDelete }) {
  const setValue = (key, value) => onChange((prev) => ({ ...prev, [key]: value }));
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header">
        <div>
          <h2>إعدادات المخزن</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>إدارة المخازن. حذف المخزن ومواده نهائياً متاح للمدير العام فقط.</p>
        </div>
      </div>

      {canManageStock ? (
        <form className="daily-plan-form-grid warehouse-settings-form" onSubmit={onCreate}>
          <div className="grid-span-full">
            <h3 style={{ margin: '0 0 8px' }}>{editingWarehouse?._id ? `تعديل المخزن: ${editingWarehouse.name}` : 'إضافة مخزن جديد'}</h3>
          </div>
          <label>اسم المخزن<input className="input" required value={form.name} onChange={(e) => setValue('name', e.target.value)} /></label>
          <label>كود المخزن<input className="input" required dir="ltr" value={form.code} onChange={(e) => setValue('code', e.target.value)} /></label>
          <label>نوع المخزن<select className="select" value={form.type || 'REGULAR'} disabled={!!editingWarehouse} onChange={(event) => setValue('type', event.target.value)}><option value="REGULAR">مخزن مواد صالحة</option><option value="DAMAGED">مخزن تالف - غير صالح للصرف</option></select></label>
          <label>الموقع<input className="input" value={form.location} onChange={(e) => setValue('location', e.target.value)} /></label>
          <label className="grid-span-full">ملاحظات<textarea className="textarea" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
          <div className="form-actions form-actions-end grid-span-full">
            {editingWarehouse?._id ? <button type="button" className="btn btn-soft" onClick={onCancelEdit} disabled={saving}>إلغاء التعديل</button> : null}
            <button className="btn btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : editingWarehouse?._id ? 'حفظ التعديل' : 'إضافة مخزن'}</button>
          </div>
        </form>
      ) : null}

      <div className="daily-plan-card-grid warehouse-settings-grid">
        {warehouses.map((warehouse) => (
          <article className="daily-plan-card" key={warehouse._id}>
            <div className="maintenance-card-header">
              <div>
                <strong>{warehouse.name}</strong>
                <div className="daily-plan-card-subtitle">{warehouse.code}</div>
                <small>{warehouse.type === 'DAMAGED' ? 'مخزن التالف - مستبعد من المواد المتاحة للصرف' : 'مخزن مواد صالحة'}</small>
              </div>
              <Pill tone={warehouse.active === false ? 'neutral' : 'success'}>{warehouse.active === false ? 'غير فعال' : 'فعال'}</Pill>
            </div>
            <div className="daily-plan-mini-grid">
              <div><span>الموقع</span><strong>{warehouse.location || '-'}</strong></div>
              <div><span>ملاحظات</span><strong>{warehouse.notes || '-'}</strong></div>
            </div>
            {canManageStock ? (
              <div className="form-actions daily-plan-actions">
                {warehouse.active === false ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onRestore(warehouse)} disabled={saving}>تفعيل</button>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onShowInventory?.(warehouse)} disabled={saving}>عرض المواد</button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => onEdit?.(warehouse)} disabled={saving}>تعديل</button>
                  </>
                )}
                {canDeleteWarehouse ? <button type="button" className="btn btn-danger btn-sm" onClick={() => onPermanentDelete?.(warehouse)} disabled={saving}>حذف المخزن ومواده</button> : null}
              </div>
            ) : null}
          </article>
        ))}
        {!warehouses.length ? <p className="maintenance-empty">لا توجد مخازن مضافة.</p> : null}
      </div>
      <style jsx>{`
        .warehouse-settings-form { margin-bottom: 18px; }
        .warehouse-settings-grid { margin-top: 12px; }
      `}</style>
    </section>
  );
}

function CategoryCardsPanel({ categories, products, saving = false, canManage = false, onCreateCategory, onRenameCategory, onDeleteCategory, onAdd }) {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingValue, setEditingValue] = useState('');

  const createCategory = () => {
    const category = newCategory.trim();
    if (!category) return;
    onCreateCategory(category);
    setNewCategory('');
  };
  const startEdit = (category) => {
    setEditingCategory(category);
    setEditingValue(category);
  };
  const cancelEdit = () => {
    setEditingCategory('');
    setEditingValue('');
  };
  const submitEdit = async () => {
    await onRenameCategory?.(editingCategory, editingValue);
    cancelEdit();
  };

  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header">
        <div>
          <h2>تصنيفات المنتجات</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>إدارة التصنيفات من داخل بطاقات التصنيف مباشرة.</p>
        </div>
        {canManage ? (
          <div className="action-row">
            <input className="input" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="تصنيف جديد" />
            <button className="btn btn-primary" onClick={createCategory} disabled={saving}>إضافة تصنيف</button>
          </div>
        ) : null}
      </div>
      <div className="daily-plan-card-grid">
        {categories.map((category) => {
          const productCount = products.filter((item) => item.category === category).length;
          const isEditing = editingCategory === category;
          return (
            <article className="daily-plan-card" key={category}>
              {isEditing ? (
                <input className="input" value={editingValue} onChange={(event) => setEditingValue(event.target.value)} autoFocus />
              ) : (
                <strong>{category}</strong>
              )}
              <div className="daily-plan-card-subtitle">{productCount} منتج</div>
              <div className="form-actions daily-plan-actions warehouse-category-card-actions">
                {isEditing ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={submitEdit} disabled={saving}>حفظ</button>
                    <button className="btn btn-soft btn-sm" onClick={cancelEdit} disabled={saving}>إلغاء</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-soft btn-sm" onClick={() => onAdd(category)}>إضافة منتج بهذا التصنيف</button>
                    {canManage ? <button className="btn btn-soft btn-sm" onClick={() => startEdit(category)} disabled={saving}>تعديل</button> : null}
                    {canManage ? <button className="btn btn-danger btn-sm" onClick={() => onDeleteCategory?.(category)} disabled={saving}>حذف</button> : null}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <style jsx>{`
        .warehouse-category-card-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .warehouse-category-card-actions .btn { min-width: 84px; }
        @media (max-width: 760px) {
          .warehouse-category-card-actions { justify-content: stretch; }
          .warehouse-category-card-actions .btn { flex: 1 1 120px; }
        }
      `}</style>
    </section>
  );
}

function CategoriesPanel({ categories, products, saving = false, canManage = false, onCreateCategory, onRenameCategory, onDeleteCategory, onAdd }) {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const createCategory = () => {
    const category = newCategory.trim();
    if (!category) return;
    onCreateCategory(category);
    setNewCategory('');
  };
  const startEdit = (category) => {
    setEditingCategory(category);
    setEditingValue(category);
  };
  const cancelEdit = () => {
    setEditingCategory('');
    setEditingValue('');
  };
  const submitEdit = async () => {
    await onRenameCategory?.(editingCategory, editingValue);
    cancelEdit();
  };
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header">
        <div><h2>تصنيفات المنتجات</h2><p style={{ margin: 0, color: 'var(--text-soft)' }}>إدارة التصنيفات تتم من خلال ربط المنتجات بالتصنيف المطلوب.</p></div>
        <div className="action-row">
          <input className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="تصنيف جديد" />
          <button className="btn btn-primary" onClick={createCategory}>إضافة تصنيف</button>
        </div>
      </div>
      <div className="daily-plan-card-grid">
        {categories.map((category) => <article className="daily-plan-card" key={category}><strong>{category}</strong><div className="daily-plan-card-subtitle">{products.filter((item) => item.category === category).length} منتج</div><div className="form-actions daily-plan-actions"><button className="btn btn-soft btn-sm" onClick={() => onAdd(category)}>إضافة منتج بهذا التصنيف</button></div></article>)}
      </div>
      {canManage ? (
        <div className="warehouse-category-manager">
          {categories.map((category) => {
            const productCount = products.filter((item) => item.category === category).length;
            const isEditing = editingCategory === category;
            return (
              <div className="warehouse-category-row" key={`manage-${category}`}>
                <div>
                  <strong>{category}</strong>
                  <div className="daily-plan-card-subtitle">{productCount} منتج</div>
                </div>
                {isEditing ? (
                  <>
                    <input className="input" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={submitEdit} disabled={saving}>حفظ</button>
                    <button className="btn btn-soft btn-sm" onClick={cancelEdit} disabled={saving}>إلغاء</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-soft btn-sm" onClick={() => startEdit(category)} disabled={saving}>تعديل</button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDeleteCategory?.(category)} disabled={saving}>حذف</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <style jsx>{`
        .warehouse-category-manager { display: grid; gap: 8px; margin-top: 16px; }
        .warehouse-category-row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(180px, 1fr) auto auto; gap: 8px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); }
        .warehouse-category-row .btn { min-width: 84px; }
        @media (max-width: 760px) {
          .warehouse-category-row { grid-template-columns: 1fr; }
          .warehouse-category-row .btn { width: 100%; }
        }
      `}</style>
    </section>
  );
}

const custodyStateLabel = { OPEN: 'مفتوحة', PARTIAL: 'جزئية', PARTIALLY_RECONCILED: 'مصفاة جزئياً', PENDING_RECONCILIATION: 'بانتظار التصفية', OVERDUE: 'متأخرة', CLOSED: 'مغلقة', RECONCILED: 'مصفاة', FULLY_RECONCILED: 'مصفاة بالكامل', CANCELLED: 'ملغاة' };
const custodyUnitLabel = { ...Object.fromEntries(unitOptions), TON: 'طن', SQM: 'م²', SET: 'طقم', BAG: 'كيس', PAIR: 'زوج' };
const custodyRoleLabel = { WAREHOUSE_KEEPER: 'أمين المخزن', GENERAL_MANAGER: 'المدير العام', PROJECT_MANAGER: 'مدير المشاريع', FINANCIAL_MANAGER: 'المدير المالي', HR_MANAGER: 'مدير الموارد البشرية', ASSISTANT_PROJECT_MANAGER: 'مساعد مدير المشاريع', TEAM_LEAD: 'قائد فريق', TECHNICAL_STAFF: 'فني', SERVICE_STAFF: 'موظف خدمات' };

function CustodyDocumentActions({ holder, custody = null, includeClosed = false, compact = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [document, setDocument] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const urlRef = useRef(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const filename = `كشف-ذمم-${holder.holderName || 'فني'}${custody ? `-${custody.custodyNo}` : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
  const download = (file) => {
    const anchor = window.document.createElement('a'); anchor.href = file.url; anchor.download = filename;
    window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
  };
  const print = (file) => {
    const frame = window.document.createElement('iframe');
    const printUrl = URL.createObjectURL(file.blob);
    frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;left:0;border:0;opacity:0;';
    frame.title = 'طباعة كشف الذمة';
    frame.onload = () => window.setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch { setPreviewOpen(true); setError('استخدم زر الطباعة داخل عارض PDF.'); }
    }, 400);
    frame.src = printUrl; window.document.body.appendChild(frame);
    window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(printUrl); }, 120000);
  };
  const action = async (kind) => {
    if (kind === 'whatsapp') { whatsapp(); return; }
    setBusy(kind); setError('');
    try {
      const holderId = holder.holderId === 'unknown' ? 'unassigned' : holder.holderId;
      const path = custody ? `/materials/custodies/${custody.custodyId}/pdf` : `/materials/custodies/statement/pdf?holderId=${encodeURIComponent(holderId)}&includeClosed=${includeClosed}`;
      const blob = await api.get(path);
      if (!(blob instanceof Blob) || !blob.type.includes('pdf')) throw new Error('تعذر إنشاء ملف PDF');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const file = { blob, url: URL.createObjectURL(blob) }; urlRef.current = file.url; setDocument(file);
      if (kind === 'preview') setPreviewOpen(true);
      if (kind === 'download') download(file);
      if (kind === 'print') print(file);
    } catch (err) { setError(err.message || 'تعذر تجهيز كشف الذمة'); }
    finally { setBusy(''); }
  };
  const whatsapp = () => {
    const { url } = buildCustodyWhatsapp({ origin: window.location.origin, holder, custody, includeClosed });
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return <>
    <div className="custody-doc-actions">
      <button type="button" className={`btn btn-primary ${compact ? 'btn-sm' : ''}`} disabled={!!busy} onClick={() => action('preview')}>{busy === 'preview' ? 'جار التجهيز...' : compact ? 'عرض PDF' : 'معاينة كشف PDF'}</button>
      <button type="button" className={`btn btn-soft ${compact ? 'btn-sm' : ''}`} disabled={!!busy} onClick={() => action('download')}>تنزيل PDF</button>
      <button type="button" className={`btn btn-soft ${compact ? 'btn-sm' : ''}`} disabled={!!busy} onClick={() => action('print')}>طباعة مباشرة</button>
      <button type="button" className={`btn btn-soft ${compact ? 'btn-sm' : ''}`} disabled={!!busy} onClick={() => action('whatsapp')}>واتساب</button>
    </div>
    {error ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
    {previewOpen && document ? <div className="modal-backdrop" style={{ zIndex: 150 }} onClick={() => setPreviewOpen(false)}>
      <div className="modal-panel" style={{ width: 'min(1100px,96vw)', maxWidth: '96vw', height: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><h3>كشف ذمم {holder.holderName}</h3><small>{custody?.custodyNo || 'جميع الذمم ضمن النطاق المعروض'}</small></div><button type="button" className="modal-close" aria-label="إغلاق معاينة PDF" onClick={() => setPreviewOpen(false)}>&times;</button></div>
        <div className="custody-doc-actions" style={{ marginBottom: 12 }}><button className="btn btn-soft" onClick={() => download(document)}>تنزيل PDF</button><button className="btn btn-primary" onClick={() => print(document)}>طباعة مباشرة</button><button className="btn btn-soft" onClick={whatsapp}>مشاركة عبر واتساب</button><a className="btn btn-soft" href={document.url} target="_blank" rel="noreferrer">فتح في نافذة مستقلة</a></div>
        <iframe title={`معاينة كشف ذمم ${holder.holderName}`} src={`${document.url}#view=FitH`} style={{ flex: 1, minHeight: 300, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', width: '100%' }} />
      </div>
    </div> : null}
    <style jsx>{`.custody-doc-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }`}</style>
  </>;
}

function CustodiesPanel({ custodies, employees, openCustodiesData, onRefresh }) {
  const actorId = String(authStorage.getUser()?.id || authStorage.getUser()?._id || '');
  const [showClosed, setShowClosed] = useState(false);
  const linkedCustodyHandled = useRef('');
  const [selectedHolderId, setSelectedHolderId] = useState('');
  const [reconcileCustody, setReconcileCustody] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const holderId = params.get('holderId');
    if (holderId) setSelectedHolderId(holderId === 'unassigned' ? 'unknown' : holderId);
    if (params.get('includeClosed') === 'true') setShowClosed(true);
  }, []);

  const employeeMap = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => map.set(productId(employee), employee));
    return map;
  }, [employees]);

  const holders = useMemo(() => {
    const map = new Map();
    const addHolder = ({ holderId, holderName, employeeCode, phone, role }) => {
      const safeId = String(holderId || 'unknown');
      if (!map.has(safeId)) {
        map.set(safeId, {
          holderId: safeId,
          holderName: holderName || '-',
          employeeCode: employeeCode || '',
          phone: phone || '',
          role: role || '',
          custodies: [],
          totalItems: 0,
          totalRemaining: 0,
          totalReceived: 0,
          projects: new Set(),
          lastReceivedAt: null,
        });
      }
      return map.get(safeId);
    };

    (custodies || []).forEach((custody) => {
      if (!showClosed && ['CLOSED', 'FULLY_RECONCILED'].includes(custody.status)) return;
      const holderId = productId(custody.holder);
      const employee = employeeMap.get(holderId);
      const holder = addHolder({
        holderId,
        holderName: custody.holder?.fullName || employee?.fullName || 'ذمم بدون فني',
        employeeCode: custody.holder?.employeeCode || employee?.employeeCode || '',
        phone: custody.holder?.phone || employee?.phone || '',
        role: custody.holder?.role || employee?.role || '',
      });
      const items = (custody.items || []).map((item) => ({
        materialId: productId(item.material),
        materialName: item.materialName || item.material?.name || '-',
        materialCode: item.material?.code || '',
        project: custody.project?.name || custody.manualProjectName || '-',
        custodyNo: custody.custodyNo,
        custodyId: custody._id,
        requestNo: custody.request?.requestNo || '-',
        unit: item.unit || '-',
        receivedQty: Number(item.receivedQty || 0),
        consumedQty: Number(item.consumedQty || 0),
        remainingQty: Number(item.remainingQty || 0),
        returnedQty: Number(item.returnedQty || 0),
        damagedQty: Number(item.damagedQty || 0),
        lostQty: Number(item.lostQty || 0),
        lineStatus: item.lineStatus || '-',
        notes: item.notes || '',
      }));
      const remaining = items.reduce((sum, item) => sum + Number(item.remainingQty || 0), 0);
      holder.custodies.push({
        raw: custody,
        custodyId: custody._id,
        custodyNo: custody.custodyNo,
        requestNo: custody.request?.requestNo || '-',
        project: custody.project?.name || custody.manualProjectName || '-',
        status: custody.status,
        openedAt: custody.openedAt || custody.createdAt,
        items,
        itemsCount: items.length,
        remainingQty: remaining,
      });
      holder.totalItems += items.length;
      holder.totalRemaining += remaining;
      holder.totalReceived += items.reduce((sum, item) => sum + Number(item.receivedQty || 0), 0);
      if (custody.project?.name) holder.projects.add(custody.project.name);
      if (custody.manualProjectName) holder.projects.add(custody.manualProjectName);
      const opened = custody.openedAt || custody.createdAt;
      if (opened && (!holder.lastReceivedAt || new Date(opened) > new Date(holder.lastReceivedAt))) holder.lastReceivedAt = opened;
    });

    (openCustodiesData?.holders || []).forEach((summaryHolder) => {
      const employee = employeeMap.get(String(summaryHolder.holderId));
      const holder = addHolder({
        holderId: summaryHolder.holderId,
        holderName: summaryHolder.holderName && summaryHolder.holderName !== '-' ? summaryHolder.holderName : (employee?.fullName || 'ذمم بدون فني'),
        employeeCode: summaryHolder.employeeCode || employee?.employeeCode,
        phone: employee?.phone,
        role: employee?.role,
      });
      if (!holder.custodies.length && summaryHolder.custodies?.length) {
        summaryHolder.custodies.forEach((custody) => {
          holder.custodies.push({
            raw: null,
            custodyId: custody.custodyId,
            custodyNo: custody.custodyNo,
            requestNo: custody.requestNo || '-',
            project: custody.project || '-',
            status: custody.status,
            openedAt: custody.openedAt,
            items: custody.items || [],
            itemsCount: custody.itemsCount || custody.items?.length || 0,
            remainingQty: Number(custody.remainingQty || 0),
          });
        });
        holder.totalItems = summaryHolder.totalItems || holder.totalItems;
        holder.totalRemaining = summaryHolder.totalRemaining || holder.totalRemaining;
        holder.projects = new Set(summaryHolder.projects || []);
        holder.lastReceivedAt = summaryHolder.lastReceivedAt || holder.lastReceivedAt;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRemaining - a.totalRemaining || a.holderName.localeCompare(b.holderName, 'ar'));
  }, [custodies, employeeMap, openCustodiesData, showClosed]);

  useEffect(() => {
    if (!selectedHolderId && holders[0]?.holderId) setSelectedHolderId(holders[0].holderId);
  }, [holders, selectedHolderId]);

  const selectedHolder = holders.find((holder) => holder.holderId === selectedHolderId) || holders[0];
  const selectedRows = (selectedHolder?.custodies || []).flatMap((custody) => (custody.items || []).map((item, index) => ({
    ...item,
    rowKey: `${custody.custodyId}-${item.materialId || item.materialName}-${index}`,
    custody,
  })));

  const openReconcileModal = (custody) => {
    if (productId(custody.raw?.holder) !== actorId) { setError('إرسال التصفية للفني صاحب الذمة حصراً.'); return; }
    if (!custody.raw || !['OPEN', 'PARTIALLY_RECONCILED', 'OVERDUE'].includes(custody.raw.status)) {
      setError('هذه الذمة غير مفتوحة للتصفية.');
      return;
    }
    setReconcileCustody({
      custody,
      notes: '',
      items: (custody.raw.items || []).map((item) => {
        const remaining = Number(item.remainingQty || 0);
        return {
          materialId: productId(item.material),
          materialName: item.materialName || item.material?.name || '-',
          receivedQty: Number(item.receivedQty || 0),
          returnedQty: Number(item.returnedQty || 0),
          consumedQty: Number(item.consumedQty || 0),
          remainingQty: remaining,
          damagedQty: Number(item.damagedQty || 0),
          lostQty: Number(item.lostQty || 0),
          toReturnQty: remaining,
          notes: 'تصفية كمادة مستهلكة/مصروفة على المشروع',
        };
      }),
    });
    setError('');
    setMessage('');
  };

  const updateReconcileItem = (index, patch) => {
    setReconcileCustody((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        next.remainingQty = Math.max(0, Number(next.receivedQty) - Number(next.returnedQty || 0) - Number(next.consumedQty) - Number(next.damagedQty) - Number(next.lostQty));
        if ('consumedQty' in patch || 'damagedQty' in patch || 'lostQty' in patch) next.toReturnQty = Number(item.toReturnQty) === Number(item.remainingQty) ? next.remainingQty : Math.min(Number(item.toReturnQty), next.remainingQty);
        return next;
      }),
    }));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const custodyId = params.get('custodyId');
    if (!custodyId || linkedCustodyHandled.current === custodyId) return;
    const holder = holders.find((item) => item.custodies.some((record) => record.custodyId === custodyId));
    if (!holder) return;
    const custody = holder.custodies.find((record) => record.custodyId === custodyId);
    setSelectedHolderId(holder.holderId);
    linkedCustodyHandled.current = custodyId;
    if (params.get('action') === 'reconcile' && custody.raw && productId(custody.raw.holder) === actorId && ['OPEN', 'PARTIALLY_RECONCILED', 'OVERDUE'].includes(custody.status)) openReconcileModal(custody);
    window.requestAnimationFrame(() => window.document.getElementById(`custody-${custodyId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [holders]);

  const submitReconcile = async () => {
    if (!reconcileCustody) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post(`/materials/custodies/${reconcileCustody.custody.custodyId}/reconcile`, {
        notes: reconcileCustody.notes || 'تصفية ذمة من قسم المخازن',
        items: reconcileCustody.items.map((item) => ({
          materialId: item.materialId,
          consumedQty: Number(item.consumedQty || 0),
          remainingQty: Number(item.remainingQty || 0),
          damagedQty: Number(item.damagedQty || 0),
          lostQty: Number(item.lostQty || 0),
          toReturnQty: Number(item.toReturnQty || 0),
          notes: item.notes || '',
        })),
      });
      setMessage('تم إرسال تصفية الذمة بنجاح.');
      setReconcileCustody(null);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'تعذر تصفية الذمة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header">
        <div>
          <h2>ذمم الفنيين</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>{showClosed ? 'ملفات الذمم المفتوحة والمغلقة والمصفاة.' : 'الذمم المفتوحة وغير المصفاة لكل فني.'}</p>
        </div>
        <Pill tone="info">{holders.length} موظف</Pill>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />عرض الذمم المغلقة والمصفاة بالكامل</label>
      {message ? <div className="card section" style={{ color: 'var(--accent)', marginBottom: 12 }}>{message}</div> : null}
      {error ? <div className="card section" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div> : null}
      {!holders.length ? <p className="maintenance-empty">لا توجد ذمم صرف مواد.</p> : null}
      {holders.length ? (
        <div className="warehouse-employee-custody-layout">
          <aside className="warehouse-employee-files">
            {holders.map((holder) => (
              <button key={holder.holderId} className={`warehouse-employee-file ${selectedHolder?.holderId === holder.holderId ? 'active' : ''}`} onClick={() => setSelectedHolderId(holder.holderId)}>
                <span>{holder.holderName}</span>
                <small>{holder.employeeCode || custodyRoleLabel[holder.role] || '-'}</small>
                <strong>{holder.custodies.length} ذمة · {holder.totalItems} بند</strong>
              </button>
            ))}
          </aside>
          <div className="warehouse-employee-custody-detail">
            <div className="warehouse-employee-summary">
              <div>
                <h3>{selectedHolder?.holderName || '-'}</h3>
                <p>{selectedHolder?.employeeCode || '-'} {selectedHolder?.phone ? `- ${selectedHolder.phone}` : ''}</p>
              </div>
              <div className="daily-plan-mini-grid">
                <div><span>عدد الذمم</span><strong>{selectedHolder?.custodies?.length || 0}</strong></div>
                <div><span>بنود المواد</span><strong>{selectedRows.length}</strong></div>
                <div><span>بنود بكمية متبقية</span><strong>{selectedRows.filter((row) => Number(row.remainingQty) > 0).length}</strong></div>
                <div><span>آخر صرف</span><strong>{fmtDate(selectedHolder?.lastReceivedAt)}</strong></div>
              </div>
              {selectedHolder ? <div style={{ marginTop: 14 }}><CustodyDocumentActions key={`${selectedHolder.holderId}-${showClosed}`} holder={selectedHolder} includeClosed={showClosed} /></div> : null}
            </div>
            <div className="custody-records">
              {(selectedHolder?.custodies || []).map((custody) => <article className="custody-record" key={custody.custodyId} id={`custody-${custody.custodyId}`}>
                <div className="custody-record-header">
                  <div><div className="custody-record-title"><strong dir="ltr">{custody.custodyNo}</strong><Pill tone={['CLOSED', 'FULLY_RECONCILED'].includes(custody.status) ? 'success' : 'warning'}>{custodyStateLabel[custody.status] || custody.status}</Pill></div>
                    <p>{custody.project || 'بدون مشروع'} <span>•</span> {fmtDate(custody.openedAt)} <span>•</span> طلب <bdi>{custody.requestNo}</bdi></p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openReconcileModal(custody)} disabled={!custody.raw || productId(custody.raw.holder) !== actorId || !['OPEN', 'PARTIALLY_RECONCILED', 'OVERDUE'].includes(custody.status)}>تصفية الذمة</button>
                </div>
                <div style={{ padding: '0 14px 12px' }}><CustodyDocumentActions holder={selectedHolder} custody={custody} compact /></div>
                <div className="warehouse-custody-table-wrap">
                  <table className="table warehouse-custody-table statement-table"><thead><tr><th>المادة</th><th>الوحدة</th><th>المسحوب</th><th>المستهلك</th><th>الراجع</th><th>تالف / مفقود</th><th>المتبقي</th></tr></thead>
                    <tbody>{selectedRows.filter((row) => row.custody.custodyId === custody.custodyId).map((row) => <tr key={row.rowKey}>
                      <td><strong>{row.materialName}</strong>{row.materialCode ? <div className="daily-plan-card-subtitle" dir="ltr">{row.materialCode}</div> : null}</td>
                      <td>{custodyUnitLabel[row.unit] || row.unit}</td><td>{qty(row.receivedQty)}</td><td>{qty(row.consumedQty)}</td><td>{qty(row.returnedQty)}</td><td>{qty(Number(row.damagedQty || 0) + Number(row.lostQty || 0))}</td><td><strong style={{ color: Number(row.remainingQty) > 0 ? 'var(--accent)' : 'var(--text-soft)' }}>{qty(row.remainingQty)}</strong></td>
                    </tr>)}</tbody>
                  </table>
                </div>
              </article>)}
            </div>

          </div>
        </div>
      ) : null}

      {reconcileCustody ? (
        <div className="modal-backdrop" onClick={() => setReconcileCustody(null)}>
          <div className="modal-panel warehouse-cart-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
              <h3>تصفية الذمة {reconcileCustody.custody.custodyNo}</h3>
                <p className="daily-plan-modal-subtitle">سجل إجمالي الكميات المستهلكة والتالفة والمفقودة، وحدد الفائض الذي ستسلمه للمخزن. المتبقي يحتسب تلقائياً.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setReconcileCustody(null)}>&times;</button>
            </div>
            <label>ملاحظات التصفية<textarea className="textarea" value={reconcileCustody.notes} onChange={(event) => setReconcileCustody((prev) => ({ ...prev, notes: event.target.value }))} /></label>
            <div className="warehouse-custody-table-wrap" style={{ marginTop: 12 }}>
              <table className="table warehouse-custody-table">
                <thead><tr><th>المادة</th><th>المسحوب</th><th>مستهلك/على المشروع</th><th>متبقي</th><th>تالف</th><th>مفقود</th><th>للإرجاع</th><th>ملاحظة</th></tr></thead>
                <tbody>
                  {reconcileCustody.items.map((item, index) => (
                    <tr key={item.materialId || item.materialName}>
                      <td>{item.materialName}</td>
                      <td>{qty(item.receivedQty)}</td>
                      <td><input className="input" type="number" min="0" step="any" value={item.consumedQty} onChange={(event) => updateReconcileItem(index, { consumedQty: event.target.value })} /></td>
                      <td><input className="input" type="number" readOnly value={item.remainingQty} /></td>
                      <td><input className="input" type="number" min="0" step="any" value={item.damagedQty} onChange={(event) => updateReconcileItem(index, { damagedQty: event.target.value })} /></td>
                      <td><input className="input" type="number" min="0" step="any" value={item.lostQty} onChange={(event) => updateReconcileItem(index, { lostQty: event.target.value })} /></td>
                      <td><input className="input" type="number" min="0" step="any" value={item.toReturnQty} onChange={(event) => updateReconcileItem(index, { toReturnQty: event.target.value })} /></td>
                      <td><input className="input" value={item.notes} onChange={(event) => updateReconcileItem(index, { notes: event.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions form-actions-end" style={{ marginTop: 14 }}>
              <button className="btn btn-soft" onClick={() => setReconcileCustody(null)} disabled={busy}>إلغاء</button>
              <button className="btn btn-primary" onClick={submitReconcile} disabled={busy}>{busy ? 'جاري التصفية...' : 'حفظ التصفية'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .warehouse-employee-custody-layout { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 16px; align-items: start; direction: rtl; }
        .warehouse-employee-files { display: flex; flex-direction: column; gap: 8px; max-height: 680px; overflow: auto; }
        .warehouse-employee-file { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); padding: 12px; text-align: right; display: grid; gap: 4px; cursor: pointer; }
        .warehouse-employee-file.active { border-color: var(--primary); background: var(--surface-soft); }
        .warehouse-employee-file span { font-weight: 800; }
        .warehouse-employee-file small { color: var(--text-soft); }
        .warehouse-employee-file strong { color: var(--accent); }
        .warehouse-employee-custody-detail { min-width: 0; }
        .warehouse-employee-summary { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface-soft); margin-bottom: 12px; }
        .warehouse-employee-summary h3 { margin: 0 0 4px; }
        .warehouse-employee-summary p { margin: 0 0 12px; color: var(--text-soft); }
        .warehouse-custody-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
        .warehouse-custody-table { min-width: 980px; margin: 0; }
        .warehouse-custody-table th,
        .warehouse-custody-table td { vertical-align: middle; }
        .warehouse-custody-table .input { min-width: 92px; }
        .custody-records { display: grid; gap: 16px; }
        .custody-record { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
        .custody-record:target { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .custody-record-header { display: flex; flex-wrap: wrap; gap: 12px; align-items: start; justify-content: space-between; padding: 14px; }
        .custody-record-title { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
        .custody-record-header p { margin: 8px 0 0; color: var(--text-soft); font-size: 13px; }
        .custody-record-header p span { margin-inline: 6px; }
        .statement-table { min-width: 650px; font-size: 13px; font-variant-numeric: tabular-nums; }
        .statement-table td, .statement-table th { padding: 12px 8px; white-space: normal; }
        .statement-table td:first-child { min-width: 160px; max-width: 250px; overflow-wrap: anywhere; }
        .custody-record .warehouse-custody-table-wrap { border-radius: 0; border: 0; border-top: 1px solid var(--border); }
        @media (max-width: 1100px) {
          .warehouse-employee-custody-layout { grid-template-columns: 1fr; }
          .warehouse-employee-files { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); max-height: 280px; }
        }
      `}</style>
    </section>
  );
}

function DamagedPanel({ custodies, stock }) {
  const damagedStock = stock.filter((balance) => balance.warehouse?.type === 'DAMAGED' && Number(balance.qtyOnHand) > 0);
  const rows = custodies.flatMap((custody) => (custody.items || []).flatMap((item) => [
    Number(item.damagedQty || 0) > 0 ? { type: 'تالف', qty: item.damagedQty, item, custody } : null,
    Number(item.lostQty || 0) > 0 ? { type: 'مفقود', qty: item.lostQty, item, custody } : null,
  ].filter(Boolean)));
  return <><section className="card section" style={{ marginTop: 16 }}><h2>رصيد مخزن التالف</h2><p>الكميات المستلمة فعلياً بعد اعتماد التصفية. هذا الرصيد غير متاح لطلبات الصرف.</p><div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>المادة</th><th>المخزن</th><th>الكمية</th></tr></thead><tbody>{damagedStock.map((balance) => <tr key={balance._id}><td>{balance.material?.name || '-'}</td><td>{balance.warehouse?.name}</td><td>{qty(balance.qtyOnHand)}</td></tr>)}</tbody></table></div>{!damagedStock.length ? <p>لا يوجد رصيد تالف مستلم حالياً.</p> : null}</section><h3>التالف والمفقود في سجل الذمم</h3><CardsList items={rows} empty="لا توجد مواد تالفة أو مفقودة." render={(row) => ({ title: row.item.materialName, subtitle: row.type, pill: row.type, lines: [['الكمية', row.qty], ...(row.type === 'تالف' ? [['التالف المستلم بالمخزن', qty(row.item.damagedReturnedQty)], ['بانتظار الاستلام', qty(Math.max(0, Number(row.qty) - Number(row.item.damagedReturnedQty || 0)))]] : []), ['الفني', row.custody.holder?.fullName || '-'], ['المشروع', row.custody.project?.name || row.custody.manualProjectName || '-'], ['التاريخ', fmtDate(row.custody.updatedAt)]], href: `/materials?custodyId=${row.custody._id}` })} /></>;
}

function MovementPanel({ summary }) {
  const rows = summary?.reports?.movement || [];
  return (
    <section className="card section" style={{ marginTop: 16, overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>التاريخ</th><th>المنتج</th><th>المخزن</th><th>الحركة</th><th>الكمية</th><th>المستخدم</th><th>المشروع</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{row.date}</td><td>{row.materialName}</td><td>{row.warehouse}</td><td>{movementLabels[row.transactionType] || row.transactionType}</td><td>{qty(row.quantity)}</td><td>{row.performedBy}</td><td>{row.projectName}</td></tr>)}</tbody></table>
      {!rows.length ? <p className="maintenance-empty">لا توجد حركات ضمن الفترة الحالية.</p> : null}
    </section>
  );
}

function ReportsPanel({ summary, canReports, onExport }) {
  const reports = [
    ['جميع المنتجات', summary?.totals?.requests || 0],
    ['المنتجات الناقصة', summary?.reports?.movement?.length || 0],
    ['المواد المصروفة حسب المشروع', summary?.totals?.projects || 0],
    ['الذمم المفتوحة لكل فني', summary?.totals?.openCustodies || 0],
    ['طلبات التصفية', summary?.totals?.reconciliations || 0],
  ];
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header"><div><h2>تقارير المخازن</h2><p style={{ margin: 0, color: 'var(--text-soft)' }}>بحث وفلترة وتصدير وطباعة لتقارير المخزون والذمم والحركة.</p></div><div className="action-row">{canReports ? <button className="btn btn-primary" onClick={() => onExport('excel')}>تصدير Excel</button> : null}{canReports ? <button className="btn btn-soft" onClick={() => onExport('pdf')}>تصدير PDF</button> : null}<button className="btn btn-soft" onClick={() => window.print()}>طباعة</button></div></div>
      <div className="daily-plan-card-grid">{reports.map(([label, value]) => <article className="daily-plan-card" key={label}><span className="daily-plan-card-subtitle">{label}</span><h2>{qty(value)}</h2></article>)}</div>
    </section>
  );
}

function CardsList({ items, render, empty }) {
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="daily-plan-card-grid">
        {items.map((item, index) => {
          const data = render(item);
          return <article className="daily-plan-card" key={data.title + index}><div className="maintenance-card-header"><div><strong>{data.title}</strong><div className="daily-plan-card-subtitle">{data.subtitle}</div></div><Pill tone="warning">{data.pill}</Pill></div><div className="daily-plan-mini-grid">{data.lines.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="form-actions daily-plan-actions"><button className="btn btn-primary btn-sm" onClick={() => window.location.href = data.href}>عرض التفاصيل</button></div></article>;
        })}
        {!items.length ? <p className="maintenance-empty">{empty}</p> : null}
      </div>
    </section>
  );
}

function ProductDetailsModal({ product, stockEntry, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel warehouse-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><h3>{product.name}</h3><p className="daily-plan-modal-subtitle">{product.code} / {product.barcode || 'بدون باركود'}</p></div><button type="button" className="modal-close" onClick={onClose}>&times;</button></div>
        <div className="warehouse-detail-head"><ProductImage product={product} /><div><Pill tone={productStatusTone[product.productStatus]}>{productStatusLabels[product.productStatus] || product.productStatus}</Pill><p>{product.description || 'لا يوجد وصف.'}</p></div></div>
        <div className="daily-plan-mini-grid">
          <div><span>التصنيف</span><strong>{product.category || '-'}</strong></div>
          <div><span>الماركة</span><strong>{product.brand || '-'}</strong></div>
          <div><span>الموديل</span><strong>{product.model || '-'}</strong></div>
          <div><span>الكمية</span><strong>{qty(stockEntry?.qtyOnHand || 0)}</strong></div>
          <div><span>مكان التخزين</span><strong>{product.storageLocation || '-'}</strong></div>
          <div><span>الرف / القسم</span><strong>{product.shelfSection || '-'}</strong></div>
          <div><span>المورد</span><strong>{product.supplierName || '-'}</strong></div>
          <div><span>رقم الفاتورة</span><strong>{product.invoiceNo || '-'}</strong></div>
        </div>
        <style jsx>{`.warehouse-detail-head { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }`}</style>
      </div>
    </div>
  );
}
