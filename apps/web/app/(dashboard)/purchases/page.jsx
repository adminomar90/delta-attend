'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';

const statuses = {
  NEW: ['جديد', 'neutral'],
  WAITING_QUOTES: ['بانتظار التسعير', 'info'],
  QUOTED: ['تم التسعير', 'success'],
  WAITING_APPROVAL: ['بانتظار الاعتماد', 'warning'],
  APPROVED: ['معتمد', 'success'],
  WAITING_RECEIPT: ['بانتظار الاستلام', 'warning'],
  RECEIVED: ['مستلم', 'success'],
  REJECTED: ['مرفوض', 'danger'],
  CANCELLED: ['ملغي', 'neutral'],
};

const supplierStatuses = {
  NOT_SENT: 'لم يرسل',
  SENT: 'تم الإرسال',
  OPENED: 'فتح الرابط',
  QUOTED: 'تم التسعير',
  EXPIRED: 'انتهت الصلاحية',
  LOCKED: 'مقفل',
  REOPENED: 'معاد فتحه',
};

const priorityLabels = { NORMAL: 'عادي', IMPORTANT: 'مهم', URGENT: 'عاجل' };
const fmt = (value) => (value ? new Date(value).toLocaleString('ar-IQ') : '-');
const money = (value) => Number(value || 0).toLocaleString('en-US');
const idOf = (value) => String(value?._id || value || '');

function Pill({ status }) {
  const [label, tone] = statuses[status] || [status || '-', 'neutral'];
  return <span className={`purchase-pill purchase-pill-${tone}`}>{label}</span>;
}

const emptyForm = {
  reason: '',
  projectId: '',
  priority: 'NORMAL',
  warehouseId: '',
  internalNotes: '',
  autoReceiveToStock: false,
  items: [],
  supplierIds: [],
};

export default function PurchasesPage() {
  const user = authStorage.getUser();
  const canAccess = hasAnyPermission(user, [
    Permission.VIEW_PURCHASES,
    Permission.CREATE_PURCHASE_REQUESTS,
    Permission.MANAGE_PURCHASE_QUOTES,
    Permission.APPROVE_PURCHASES,
    Permission.RECEIVE_PURCHASES,
    Permission.VIEW_PURCHASE_REPORTS,
  ]);
  const canCreate = hasAnyPermission(user, [Permission.CREATE_PURCHASE_REQUESTS, Permission.MANAGE_PURCHASE_QUOTES]);
  const canApprove = hasPermission(user, Permission.APPROVE_PURCHASES);
  const canReceive = hasAnyPermission(user, [Permission.RECEIVE_PURCHASES, Permission.MANAGE_MATERIAL_INVENTORY]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState({ counts: {}, recent: [] });
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);
  const [lastWhatsapp, setLastWhatsapp] = useState(null);

  const selectedPurchase = selected || purchases.find((item) => item._id === selectedId) || purchases[0] || null;

  const load = async () => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [purchasesRes, summaryRes, materialsRes, suppliersRes, warehousesRes, projectsRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/purchases/summary'),
        api.get('/materials/catalog?active=true'),
        api.get('/suppliers?approvedOnly=true').catch(() => ({ suppliers: [] })),
        api.get('/materials/warehouses?active=true'),
        api.get('/projects').catch(() => ({ projects: [] })),
      ]);
      setPurchases(purchasesRes.purchases || []);
      setSummary(summaryRes || { counts: {}, recent: [] });
      setMaterials(materialsRes.materials || []);
      setSuppliers(suppliersRes.suppliers || []);
      setWarehouses(warehousesRes.warehouses || []);
      setProjects(projectsRes.projects || []);
      if (!selectedId && purchasesRes.purchases?.[0]?._id) setSelectedId(purchasesRes.purchases[0]._id);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات المشتريات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openPurchase = async (purchaseId) => {
    setSelectedId(purchaseId);
    setSelected(null);
    setComparison(null);
    try {
      const response = await api.get(`/purchases/${purchaseId}`);
      setSelected(response.purchase);
      setComparison(response.comparison);
      setReceiveLines((response.purchase?.purchaseOrder?.selectedLines || []).map((line) => ({
        materialId: idOf(line.material),
        materialName: line.materialName,
        orderedQty: Number(line.quantity || 0),
        receivedQty: Number(line.quantity || 0),
        unitCost: Number(line.unitPrice || 0),
        notes: '',
      })));
    } catch (err) {
      setError(err.message || 'تعذر فتح الطلب');
    }
  };

  useEffect(() => {
    if (selectedId) openPurchase(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (activeTab === 'receiving' && selectedPurchase?.status === 'RECEIVED') {
      setActiveTab('reports');
    }
  }, [activeTab, selectedPurchase?.status]);

  const addMaterialLine = (materialId) => {
    const material = materials.find((item) => item._id === materialId);
    if (!material) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.some((item) => item.materialId === materialId)
        ? prev.items
        : [...prev.items, { materialId, materialName: material.name, code: material.code, unit: material.unit, quantity: 1, notes: '' }],
    }));
  };

  const updateLine = (index, patch) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  }));

  const createPurchase = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        ...form,
        supplierIds: form.supplierIds,
        items: form.items.map((item) => ({ materialId: item.materialId, quantity: Number(item.quantity || 0), notes: item.notes })),
      };
      const response = await api.post('/purchases', payload);
      setInfo(`تم إنشاء طلب الشراء ${response.purchase.requestNo}.`);
      setForm(emptyForm);
      setActiveTab('quotes');
      await load();
      setSelectedId(response.purchase._id);
    } catch (err) {
      setError(err.message || 'تعذر إنشاء طلب الشراء');
    } finally {
      setSaving(false);
    }
  };

  const sendQuote = async (purchase, quote) => {
    const whatsappWindow = window.open('', '_blank');
    setSaving(true);
    setError('');
    try {
      const response = await api.post(`/purchases/${purchase._id}/suppliers/${quote._id}/send`, {});
      setLastWhatsapp(response);
      setInfo('تم تجهيز رسالة واتساب ورابط التسعير.');
      if (response.whatsappUrl && whatsappWindow) {
        whatsappWindow.location.href = response.whatsappUrl;
      } else if (response.whatsappUrl) {
        window.location.href = response.whatsappUrl;
      } else {
        whatsappWindow?.close();
        setInfo('تم تجهيز رابط التسعير، لكن لا يوجد رقم واتساب صالح لهذا المورد.');
      }
      await openPurchase(purchase._id);
      await load();
    } catch (err) {
      whatsappWindow?.close();
      setError(err.message || 'تعذر تجهيز رابط التسعير');
    } finally {
      setSaving(false);
    }
  };

  const approvePurchase = async (supplierQuoteId, purchase = selectedPurchase) => {
    if (!purchase || !window.confirm('هل تريد تجهيز واعتماد هذا العرض وإنشاء أمر شراء؟')) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/purchases/${purchase._id}/approve`, {
        mode: 'SINGLE_SUPPLIER',
        supplierQuoteId,
        warehouseId: form.warehouseId || purchase.defaultWarehouse?._id || purchase.defaultWarehouse,
      });
      setInfo('تم اعتماد الشراء وإنشاء أمر الشراء.');
      setSelectedId(purchase._id);
      await openPurchase(purchase._id);
      await load();
      setActiveTab('orders');
    } catch (err) {
      setError(err.message || 'تعذر اعتماد الشراء');
    } finally {
      setSaving(false);
    }
  };

  const exportPurchaseQuotes = async (purchase, type) => {
    setSaving(true);
    setError('');
    try {
      const blob = await api.downloadBlob(`/purchases/${purchase._id}/quotes/export/${type}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchase-quotes-${purchase.requestNo}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'تعذر تصدير طلب التسعير');
    } finally {
      setSaving(false);
    }
  };

  const viewPurchaseQuotes = async (purchase) => {
    const previewWindow = window.open('', '_blank');
    setSaving(true);
    setError('');
    try {
      const blob = await api.downloadBlob(`/purchases/${purchase._id}/quotes/export/pdf`);
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      previewWindow?.close();
      setError(err.message || 'تعذر عرض تقرير طلب التسعير');
    } finally {
      setSaving(false);
    }
  };

  const receivePurchase = async () => {
    if (!selectedPurchase || !window.confirm('تأكيد استلام المواد وإدخالها إلى المخزن؟')) return;
    setSaving(true);
    setError('');
    try {
      const response = await api.post(`/purchases/${selectedPurchase._id}/receive`, {
        warehouseId: form.warehouseId || selectedPurchase.defaultWarehouse?._id || selectedPurchase.defaultWarehouse,
        items: receiveLines,
      });
      setInfo('تم استلام المواد وتحديث المخزن.');
      if (response.purchase) {
        setSelected(response.purchase);
        setPurchases((current) => current.map((purchase) => (
          purchase._id === response.purchase._id ? response.purchase : purchase
        )));
      }
      setActiveTab('reports');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تأكيد الاستلام');
    } finally {
      setSaving(false);
    }
  };

  const filteredOrders = purchases.filter((item) => item.purchaseOrder?.poNo);

  if (!canAccess) return <section className="card section">لا تملك صلاحية الوصول إلى قسم المشتريات.</section>;

  return (
    <>
      <section className="card section purchases-hero">
        <div>
          <h2>قسم المشتريات</h2>
          <p>طلبات التسعير، عروض الموردين، أوامر الشراء، والاستلام المرتبط بالمخزن.</p>
        </div>
        <div className="action-row">
          {canCreate ? <button className="btn btn-primary" onClick={() => setActiveTab('create')}>طلب شراء جديد</button> : null}
          <button className="btn btn-soft" onClick={load} disabled={loading}>{loading ? 'جار التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      {error ? <section className="card section purchase-alert purchase-alert-error">{error}</section> : null}
      {info ? <section className="card section purchase-alert purchase-alert-info">{info}</section> : null}
      {lastWhatsapp ? (
        <section className="card section purchase-whatsapp-box">
          <strong>رسالة واتساب جاهزة</strong>
          <textarea className="textarea" readOnly value={lastWhatsapp.message || ''} />
          <div className="action-row">
            {lastWhatsapp.whatsappUrl ? <button className="btn btn-primary" onClick={() => window.open(lastWhatsapp.whatsappUrl, '_blank', 'noopener,noreferrer')}>فتح واتساب</button> : null}
            {lastWhatsapp.link ? <button className="btn btn-soft" onClick={() => navigator.clipboard?.writeText(lastWhatsapp.link)}>نسخ رابط الاستمارة</button> : null}
          </div>
        </section>
      ) : null}

      <section className="card section purchase-tabs">
        {[
          ['dashboard', 'لوحة التحكم'],
          ['create', 'إنشاء طلب'],
          ['quotes', 'طلبات التسعير'],
          ['compare', 'مقارنة العروض'],
          ['orders', 'أوامر الشراء'],
          ['receiving', 'استلام المواد'],
          ['reports', 'التقارير'],
        ].map(([value, label]) => (
          <button key={value} className={`btn ${activeTab === value ? 'btn-primary' : 'btn-soft'}`} onClick={() => setActiveTab(value)}>{label}</button>
        ))}
      </section>

      {activeTab === 'dashboard' ? <DashboardPanel counts={summary.counts || {}} purchases={purchases} recent={summary.recent || []} onOpen={(purchase) => { setSelected(null); setSelectedId(purchase._id); setActiveTab(['QUOTED', 'WAITING_APPROVAL'].includes(purchase.status) ? 'compare' : purchase.status === 'WAITING_RECEIPT' ? 'receiving' : purchase.status === 'RECEIVED' ? 'reports' : 'quotes'); }} /> : null}
      {activeTab === 'create' ? (
        <CreatePanel
          form={form}
          setForm={setForm}
          materials={materials}
          suppliers={suppliers}
          warehouses={warehouses}
          projects={projects}
          canCreate={canCreate}
          saving={saving}
          addMaterialLine={addMaterialLine}
          updateLine={updateLine}
          createPurchase={createPurchase}
        />
      ) : null}
      {activeTab === 'quotes' ? <QuotesPanel purchases={purchases} sendQuote={sendQuote} onView={viewPurchaseQuotes} onExport={exportPurchaseQuotes} onApprove={approvePurchase} canApprove={canApprove} saving={saving} /> : null}
      {activeTab === 'compare' ? <ComparePanel purchase={selectedPurchase} comparison={comparison} onOpen={openPurchase} onApprove={approvePurchase} canApprove={canApprove} saving={saving} /> : null}
      {activeTab === 'orders' ? <OrdersPanel purchases={filteredOrders} setSelectedId={setSelectedId} setActiveTab={setActiveTab} /> : null}
      {activeTab === 'receiving' ? (
        <ReceivingPanel
          purchase={selectedPurchase}
          warehouses={warehouses}
          warehouseId={form.warehouseId || idOf(selectedPurchase?.defaultWarehouse)}
          setWarehouseId={(warehouseId) => setForm((prev) => ({ ...prev, warehouseId }))}
          lines={receiveLines}
          setLines={setReceiveLines}
          canReceive={canReceive}
          saving={saving}
          onReceive={receivePurchase}
        />
      ) : null}
      {activeTab === 'reports' ? <ReportsPanel purchases={purchases} /> : null}

      <style jsx global>{`
        .purchases-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; }
        .purchases-hero p { margin: 4px 0 0; color: var(--text-soft); }
        .purchase-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 16px; }
        .purchase-tabs .btn { width: 100%; }
        .purchase-alert { margin-top: 16px; }
        .purchase-whatsapp-box { display: grid; gap: 10px; margin-top: 16px; }
        .purchase-whatsapp-box textarea { min-height: 118px; }
        .purchase-alert-error { color: #b91c1c; }
        .purchase-alert-info { color: var(--accent); }
        .purchase-dashboard-kpi { display: grid; gap: 5px; color: var(--text); text-align: start; font: inherit; cursor: pointer; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .purchase-dashboard-kpi h2, .purchase-dashboard-kpi p { margin: 0; }
        .purchase-dashboard-kpi small { color: var(--text-soft); opacity: 0; transform: translateY(3px); transition: .18s ease; }
        .purchase-dashboard-kpi:hover, .purchase-dashboard-kpi.is-active { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 12px 26px rgba(0,0,0,.2); }
        .purchase-dashboard-kpi:hover small, .purchase-dashboard-kpi.is-active small { opacity: 1; transform: none; }
        .purchase-dashboard-kpi.is-active { background: color-mix(in srgb, var(--accent) 9%, var(--surface)); }
        .purchase-dashboard-status-results { margin-top: 18px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-soft); }
        .purchase-dashboard-status-results .section-header { margin-bottom: 12px; }
        .purchase-dashboard-status-results h3, .purchase-dashboard-status-results p { margin: 0; }
        .purchase-dashboard-status-results p { color: var(--text-soft); }
        .purchase-dashboard-request-card { display: flex; flex-direction: column; gap: 12px; }
        .purchase-dashboard-request-card > .btn { margin-top: auto; }
        .purchase-pill { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .purchase-pill-success { background: rgba(34, 197, 94, 0.14); color: #15803d; }
        .purchase-pill-warning { background: rgba(245, 158, 11, 0.16); color: #b45309; }
        .purchase-pill-danger { background: rgba(220, 38, 38, 0.14); color: #b91c1c; }
        .purchase-pill-info { background: rgba(59, 130, 246, 0.14); color: #1d4ed8; }
        .purchase-pill-neutral { background: rgba(100, 116, 139, 0.14); color: var(--text-soft); }
        .purchase-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
        .purchase-mobile-cards { display: none; }
        .purchase-material-search { position: relative; }
        .purchase-material-results { position: absolute; z-index: 20; top: calc(100% + 6px); inset-inline: 0; display: grid; gap: 4px; max-height: 360px; overflow: auto; padding: 7px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 18px 45px rgba(15, 23, 42, .18); }
        .purchase-material-results-title { position: sticky; top: -7px; z-index: 1; padding: 8px 10px; color: var(--text-soft); background: var(--surface); border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 800; }
        .purchase-material-results button { display: grid; gap: 7px; width: 100%; border: 1px solid transparent; border-radius: 9px; padding: 10px 12px; background: transparent; color: var(--text); text-align: start; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
        .purchase-material-results button:hover, .purchase-material-results button.is-active { border-color: color-mix(in srgb, var(--accent) 30%, transparent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
        .purchase-material-result-main { display: flex; justify-content: space-between; gap: 12px; align-items: center; color: var(--text); font-size: 14px; }
        .purchase-material-result-main b { flex: none; padding: 2px 7px; border-radius: 999px; color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-size: 11px; }
        .purchase-material-result-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; color: var(--text-soft); font-size: 12px; }
        .purchase-material-result-meta em { font-style: normal; }
        .purchase-material-empty { color: var(--text-soft); font-size: 12px; }
        .purchase-material-empty { padding: 10px; }
        .purchase-quotes-panel { background: linear-gradient(145deg, color-mix(in srgb, var(--surface) 96%, var(--accent)), var(--surface)); }
        .purchase-quote-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .purchase-quote-stat { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); background: var(--surface-soft); text-align: start; cursor: pointer; transition: .18s ease; }
        .purchase-quote-stat:hover, .purchase-quote-stat.is-active { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 10px 24px rgba(0,0,0,.18); }
        .purchase-quote-stat.is-active { background: color-mix(in srgb, var(--accent) 10%, var(--surface-soft)); }
        .purchase-quote-stat span { font-weight: 850; }
        .purchase-quote-stat strong { grid-row: span 2; color: var(--accent); font-size: 30px; line-height: 1; }
        .purchase-quote-stat small { color: var(--text-soft); }
        .purchase-quotes-heading { margin-top: 22px; }
        .purchase-quote-request-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr)); gap: 14px; }
        .purchase-daily-quote-card { position: relative; display: flex; flex-direction: column; gap: 12px; min-height: 100%; overflow: hidden; transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
        .purchase-daily-quote-card::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 4px; background: var(--text-soft); }
        .purchase-daily-quote-quoted::before { background: #65eca2; }
        .purchase-daily-quote-sent::before, .purchase-daily-quote-opened::before, .purchase-daily-quote-reopened::before { background: var(--accent); }
        .purchase-daily-quote-card:hover { transform: translateY(-2px); border-color: rgba(196, 215, 67, .42); box-shadow: 0 18px 36px rgba(0, 0, 0, .32); }
        .purchase-daily-quote-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .purchase-daily-quote-head h3 { margin: 0; color: var(--text); font-size: 17px; }
        .purchase-daily-quote-head .daily-plan-chip-row { justify-content: flex-end; }
        .purchase-quote-total-accent { color: var(--accent); }
        .purchase-quote-contact { padding-block: 2px 10px; border-bottom: 1px solid rgba(78, 111, 167, .2); }
        .purchase-quote-waiting-card { display: grid; gap: 4px; padding: 12px; border: 1px dashed rgba(196, 215, 67, .3); border-radius: 12px; background: rgba(196, 215, 67, .06); }
        .purchase-quote-waiting-card span { color: #d4df86; font-weight: 800; }
        .purchase-quote-waiting-card small { color: var(--text-soft); }
        .purchase-daily-quote-actions { margin-top: auto; padding-top: 2px; }
        .purchase-quote-request-card { overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft); }
        .purchase-quote-request-card > header { display: flex; justify-content: space-between; gap: 12px; padding: 15px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--primary) 55%, var(--surface-soft)); }
        .purchase-quote-request-card > header span { color: var(--accent); font-size: 12px; font-weight: 900; }
        .purchase-quote-request-card > header h3 { margin: 3px 0; font-size: 16px; }
        .purchase-quote-request-card > header small { color: var(--text-soft); }
        .purchase-quote-card-actions { display: flex; gap: 7px; padding: 10px 15px; border-bottom: 1px solid var(--border); }
        .purchase-quote-suppliers { display: grid; gap: 10px; padding: 12px; }
        .purchase-quote-supplier { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-inline-start: 4px solid var(--text-soft); border-radius: 9px; background: var(--surface); }
        .purchase-quote-supplier-quoted { border-inline-start-color: #22c55e; }
        .purchase-quote-supplier-sent, .purchase-quote-supplier-opened, .purchase-quote-supplier-reopened { border-inline-start-color: #f59e0b; }
        .purchase-quote-supplier-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
        .purchase-quote-supplier-head > div { display: grid; gap: 3px; }
        .purchase-quote-supplier-head small, .purchase-quote-waiting { color: var(--text-soft); font-size: 12px; }
        .purchase-quote-supplier-head > b { color: var(--accent); white-space: nowrap; }
        .purchase-quote-lines { display: grid; gap: 5px; padding: 8px; border-radius: 7px; background: var(--surface-soft); }
        .purchase-quote-lines > div { display: flex; justify-content: space-between; gap: 9px; font-size: 12px; }
        .purchase-quote-lines small { color: var(--text-soft); }
        .purchase-quote-attachments { display: grid; gap: 4px; }
        .purchase-quote-attachments a { color: var(--accent); font-size: 12px; text-decoration: none; }
        .purchase-quote-supplier-actions { display: flex; flex-wrap: wrap; gap: 7px; }
        .purchase-quote-empty { grid-column: 1 / -1; padding: 28px; border: 1px dashed var(--border); border-radius: 10px; color: var(--text-soft); text-align: center; }
        .purchase-compare-panel { overflow: hidden; }
        .purchase-compare-header { align-items: flex-start; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
        .purchase-compare-header h2 { margin: 4px 0 6px; }
        .purchase-compare-header p { margin: 0; color: var(--text-soft); }
        .purchase-compare-code { display: inline-flex; padding: 3px 9px; border-radius: 999px; color: var(--accent); background: rgba(196, 215, 67, .1); font-size: 12px; font-weight: 900; }
        .purchase-compare-table-wrap { margin-top: 16px; border-radius: 12px; }
        .purchase-compare-table th { padding: 12px; background: color-mix(in srgb, var(--primary) 75%, var(--surface)); }
        .purchase-compare-table td { padding: 12px; vertical-align: middle; }
        .purchase-compare-table td:first-child { min-width: 170px; }
        .purchase-compare-table td:first-child strong, .purchase-compare-table td:first-child small { display: block; }
        .purchase-compare-table td:first-child small { margin-top: 3px; color: var(--text-soft); }
        .purchase-compare-qty { display: inline-grid; min-width: 44px; min-height: 34px; place-items: center; border-radius: 8px; color: var(--text); background: var(--surface-soft); }
        .purchase-compare-price { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; min-width: 155px; }
        .purchase-compare-price span { color: var(--text-soft); font-size: 11px; }
        .purchase-compare-price strong, .purchase-compare-price b { color: var(--text); text-align: left; }
        .purchase-compare-price em { grid-column: 1 / -1; justify-self: start; padding: 2px 7px; border-radius: 999px; color: #a9f7c6; background: rgba(34,197,94,.16); font-size: 10px; font-style: normal; }
        .purchase-compare-best-cell { background: rgba(34,197,94,.08) !important; box-shadow: inset 0 0 0 1px rgba(34,197,94,.18); }
        .purchase-compare-no-price { color: var(--text-soft); font-size: 12px; }
        .purchase-compare-section-title { display: flex; justify-content: space-between; gap: 14px; align-items: center; margin: 24px 0 12px; }
        .purchase-compare-section-title > div { display: flex; gap: 9px; align-items: center; }
        .purchase-compare-section-title > div > span { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; color: var(--surface); background: var(--accent); font-weight: 900; }
        .purchase-compare-section-title h3, .purchase-compare-section-title p { margin: 0; }
        .purchase-compare-section-title p { color: var(--text-soft); font-size: 12px; }
        .purchase-compare-supplier-card { position: relative; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
        .purchase-compare-supplier-card.is-best { border-color: rgba(101,236,162,.55); box-shadow: 0 14px 30px rgba(34,197,94,.1); }
        .purchase-compare-supplier-card.is-best::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 4px; background: #65eca2; }
        .purchase-compare-supplier-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .purchase-compare-supplier-head span:first-child { color: var(--text-soft); font-size: 11px; }
        .purchase-compare-supplier-head h3 { margin: 3px 0 0; }
        .purchase-compare-total { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 13px; border: 1px solid rgba(196,215,67,.22); border-radius: 12px; background: rgba(196,215,67,.07); }
        .purchase-compare-total span { color: var(--text-soft); font-size: 12px; }
        .purchase-compare-total strong { color: var(--accent); font-size: 21px; }
        .purchase-compare-best-badge { align-self: flex-start; padding: 4px 10px; border-radius: 999px; color: #a9f7c6; background: rgba(34,197,94,.15); font-size: 11px; font-weight: 800; }
        .purchase-compare-notes { margin: 0; padding: 9px; border-radius: 8px; color: var(--text-soft); background: var(--surface-soft); font-size: 12px; }
        @media (max-width: 760px) {
          .purchases-hero { grid-template-columns: 1fr; }
          .purchases-hero .action-row { display: grid; grid-template-columns: 1fr; }
          .purchase-table-wrap { display: none; }
          .purchase-mobile-cards { display: grid; gap: 10px; }
          .purchase-quote-stats { grid-template-columns: 1fr; }
          .purchase-quote-request-grid { grid-template-columns: 1fr; }
          .purchase-quote-supplier-head, .purchase-quote-lines > div { align-items: flex-start; flex-direction: column; }
          .purchase-compare-section-title { align-items: flex-start; flex-direction: column; }
        }
      `}</style>
    </>
  );
}

function DashboardPanel({ counts, purchases, recent, onOpen }) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const cards = [
    ['NEW', 'طلبات جديدة'],
    ['WAITING_QUOTES', 'بانتظار التسعير'],
    ['QUOTED', 'تم تسعيرها'],
    ['WAITING_APPROVAL', 'بانتظار الاعتماد'],
    ['WAITING_RECEIPT', 'بانتظار الاستلام'],
    ['RECEIVED', 'مستلمة'],
    ['REJECTED', 'مرفوضة'],
    ['CANCELLED', 'ملغية'],
  ];
  const selectedLabel = cards.find(([key]) => key === selectedStatus)?.[1] || '';
  const statusPurchases = selectedStatus ? purchases.filter((purchase) => purchase.status === selectedStatus) : [];
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="grid-4">{cards.map(([key, label]) => <button type="button" className={`card section purchase-dashboard-kpi ${selectedStatus === key ? 'is-active' : ''}`} key={key} onClick={() => setSelectedStatus(key)}><p className="maintenance-kpi-label">{label}</p><h2>{counts[key] || 0}</h2><small>اضغط لعرض الطلبات</small></button>)}</div>
      {selectedStatus ? <div className="purchase-dashboard-status-results"><div className="section-header"><div><h3>{selectedLabel}</h3><p>{statusPurchases.length} طلب ضمن هذه الحالة</p></div><button type="button" className="btn btn-soft btn-sm" onClick={() => setSelectedStatus('')}>إغلاق</button></div><div className="daily-plan-card-grid">{statusPurchases.map((purchase) => <article className="daily-plan-card purchase-dashboard-request-card" key={purchase._id}><div className="purchase-daily-quote-head"><div><strong dir="ltr">{purchase.requestNo}</strong><div className="daily-plan-card-subtitle">{purchase.reason || purchase.projectName || '-'}</div></div><Pill status={purchase.status} /></div><div className="daily-plan-mini-grid"><div><span>تاريخ الطلب</span><strong>{fmt(purchase.requestDate || purchase.createdAt)}</strong></div><div><span>عدد المواد</span><strong>{(purchase.items || []).length}</strong></div></div><button className="btn btn-primary btn-sm" onClick={() => onOpen(purchase)}>فتح الطلب</button></article>)}{!statusPurchases.length ? <div className="purchase-quote-empty">لا توجد طلبات في هذه الحالة.</div> : null}</div></div> : null}
      <h3 style={{ marginTop: 18 }}>آخر النشاطات</h3>
      <div className="daily-plan-card-grid">{recent.map((item) => (
        <article className="daily-plan-card" key={item._id}>
          <strong>{item.requestNo}</strong>
          <div className="daily-plan-card-subtitle">{item.reason || item.projectName || '-'}</div>
          <Pill status={item.status} />
          <button className="btn btn-soft btn-sm" onClick={() => onOpen(item)}>عرض</button>
        </article>
      ))}</div>
    </section>
  );
}

function MaterialSearchPicker({ materials, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return [];
    return materials
      .map((material) => {
        const searchable = [material.name, material.code, material.model, material.barcode]
          .map((value) => String(value || '').toLowerCase());
        const score = searchable.reduce((best, value) => {
          if (!value) return best;
          if (value === normalized) return Math.max(best, 3);
          if (value.startsWith(normalized)) return Math.max(best, 2);
          if (value.includes(normalized)) return Math.max(best, 1);
          return best;
        }, 0);
        return { material, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.material.name.localeCompare(b.material.name, 'ar'))
      .slice(0, 15)
      .map((entry) => entry.material);
  }, [materials, normalized]);

  const choose = (material) => {
    onSelect(material._id);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event) => {
    if (!open || !normalized) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <label className="purchase-material-search">
      إضافة مادة
      <input
        className="input"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        placeholder="ابحث بالاسم أو رقم الموديل أو الباركود"
      />
      {open && normalized ? (
        <div className="purchase-material-results">
          <div className="purchase-material-results-title">نتائج البحث ({results.length})</div>
          {results.map((material, index) => (
            <button type="button" className={activeIndex === index ? 'is-active' : ''} key={material._id} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(material)}>
              <span className="purchase-material-result-main"><strong>{material.name}</strong><b>{material.code}</b></span>
              <span className="purchase-material-result-meta">
                {material.model ? <em>الموديل: {material.model}</em> : null}
                {material.barcode ? <em>الباركود: {material.barcode}</em> : null}
                {material.brand ? <em>العلامة: {material.brand}</em> : null}
              </span>
            </button>
          ))}
          {!results.length ? <div className="purchase-material-empty">لا توجد نتائج مطابقة</div> : null}
        </div>
      ) : null}
    </label>
  );
}

function CreatePanel({ form, setForm, materials, suppliers, warehouses, projects, canCreate, saving, addMaterialLine, updateLine, createPurchase }) {
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <form onSubmit={createPurchase}>
        <div className="daily-plan-form-grid">
          <label>سبب الطلب<input className="input" required value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} /></label>
          <label>المشروع<select className="select" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}><option value="">بدون مشروع</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
          <label>الأولوية<select className="select" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>مخزن الاستلام<select className="select" value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
          <MaterialSearchPicker materials={materials} onSelect={addMaterialLine} />
          <label className="warehouse-check"><input type="checkbox" checked={form.autoReceiveToStock} onChange={(e) => setForm((p) => ({ ...p, autoReceiveToStock: e.target.checked }))} /> إدخال مباشر للمخزن بعد الاعتماد</label>
          <label className="grid-span-full">ملاحظات داخلية<textarea className="textarea" value={form.internalNotes} onChange={(e) => setForm((p) => ({ ...p, internalNotes: e.target.value }))} /></label>
        </div>
        <h3>المواد المطلوبة</h3>
        <div className="purchase-table-wrap"><table className="table"><thead><tr><th>المادة</th><th>الكمية</th><th>ملاحظات</th><th></th></tr></thead><tbody>{form.items.map((line, index) => <tr key={line.materialId}><td>{line.code} - {line.materialName}</td><td><input className="input" type="number" min="0.0001" step="any" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} /></td><td><input className="input" value={line.notes} onChange={(e) => updateLine(index, { notes: e.target.value })} /></td><td><button type="button" className="btn btn-soft btn-sm" onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }))}>حذف</button></td></tr>)}</tbody></table></div>
        <h3>الموردون</h3>
        <div className="daily-plan-card-grid">{suppliers.map((supplier) => {
          const checked = form.supplierIds.includes(supplier._id);
          return <label className="daily-plan-card" key={supplier._id}><input type="checkbox" checked={checked} onChange={(e) => setForm((p) => ({ ...p, supplierIds: e.target.checked ? [...p.supplierIds, supplier._id] : p.supplierIds.filter((id) => id !== supplier._id) }))} /><strong>{supplier.companyName || supplier.supplierName}</strong><span className="daily-plan-card-subtitle">{supplier.mainPhone} - {supplier.contactPerson || '-'}</span></label>;
        })}</div>
        <div className="form-actions form-actions-end" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={!canCreate || saving}>{saving ? 'جار الحفظ...' : 'إنشاء طلب الشراء'}</button>
        </div>
      </form>
    </section>
  );
}

function QuotesPanel({ purchases, sendQuote, onView, onExport, onApprove, canApprove, saving }) {
  const [filter, setFilter] = useState('all');
  const quoteRequests = purchases.filter((purchase) => (purchase.suppliers || []).length);
  const quotedRequests = quoteRequests.filter((purchase) => (purchase.suppliers || []).some((quote) => quote.status === 'QUOTED'));
  const pendingRequests = quoteRequests.filter((purchase) => (purchase.suppliers || []).some((quote) => ['SENT', 'OPENED', 'REOPENED'].includes(quote.status)));
  const filtered = filter === 'quoted' ? quotedRequests : filter === 'pending' ? pendingRequests : quoteRequests;
  const visibleQuotes = filtered.flatMap((purchase) => (purchase.suppliers || [])
    .filter((quote) => filter === 'quoted' ? quote.status === 'QUOTED' : filter === 'pending' ? ['SENT', 'OPENED', 'REOPENED'].includes(quote.status) : true)
    .map((quote) => ({ purchase, quote })));
  const cards = [
    ['all', 'طلبات التسعير', quoteRequests.length, 'جميع طلبات وعروض الموردين'],
    ['quoted', 'تم التسعير', quotedRequests.length, 'العروض المستلمة والجاهزة للاعتماد'],
    ['pending', 'مرسلة ولم تُسعّر', pendingRequests.length, 'بانتظار رد الموردين'],
  ];

  return (
    <section className="card section purchase-quotes-panel" style={{ marginTop: 16 }}>
      <div className="purchase-quote-stats">{cards.map(([value, label, count, description]) => <button type="button" key={value} className={`purchase-quote-stat ${filter === value ? 'is-active' : ''}`} onClick={() => setFilter(value)}><span>{label}</span><strong>{count}</strong><small>{description}</small></button>)}</div>
      <div className="section-header purchase-quotes-heading"><div><h2>{cards.find(([value]) => value === filter)?.[1]}</h2><p>اضغط على إجراءات الكارت لتصدير الطلب أو إرساله أو اعتماده.</p></div></div>
      <div className="daily-plan-card-grid purchase-quote-request-grid">
        {visibleQuotes.map(({ purchase, quote }) => {
          const quoteTotal = (quote.lines || []).reduce((sum, line) => sum + Number(line.totalPrice || 0), 0) + Number(quote.deliveryFee || 0);
          const statusClass = quote.status === 'QUOTED' ? 'status-approved' : ['SENT', 'OPENED', 'REOPENED'].includes(quote.status) ? 'status-inprogress' : 'status-todo';
          return <article className={`daily-plan-card purchase-daily-quote-card purchase-daily-quote-${String(quote.status || '').toLowerCase()}`} key={`${purchase._id}-${quote._id}`}>
            <div className="purchase-daily-quote-head"><div><h3>{quote.companyName || quote.supplierName}</h3><div className="daily-plan-card-subtitle">{purchase.reason || purchase.projectName || 'طلب تسعير'}</div></div><div className="daily-plan-chip-row"><span className={`status-pill ${statusClass}`}>{supplierStatuses[quote.status] || quote.status}</span><span className={`status-pill ${priorityLabels[purchase.priority] === 'عاجل' ? 'status-rejected' : 'status-todo'}`}>{priorityLabels[purchase.priority] || 'عادي'}</span></div></div>
            <div className="daily-plan-mini-grid">
              <div><span>رقم الطلب</span><strong>{purchase.requestNo}</strong></div>
              <div><span>تاريخ الطلب</span><strong>{fmt(purchase.requestDate || purchase.createdAt)}</strong></div>
              <div><span>عدد المواد</span><strong>{(purchase.items || []).length}</strong></div>
              <div><span>{quote.status === 'QUOTED' ? 'إجمالي العرض' : 'حالة الإرسال'}</span><strong className={quote.status === 'QUOTED' ? 'purchase-quote-total-accent' : ''}>{quote.status === 'QUOTED' ? `${money(quoteTotal)} ${quote.currency || 'IQD'}` : supplierStatuses[quote.status] || quote.status}</strong></div>
            </div>
            <div className="daily-plan-card-subtitle purchase-quote-contact">المورد: {quote.phone || '-'} · أرسل: {fmt(quote.sentAt)} · فتح: {fmt(quote.openedAt)}</div>
            {quote.status === 'QUOTED' ? <div className="purchase-quote-lines">{(quote.lines || []).map((line) => <div key={line._id || idOf(line.material)}><span>{line.materialName}</span><small>{money(line.offeredQty)} × {money(line.unitPrice)} = <b>{money(line.totalPrice)} {quote.currency || 'IQD'}</b></small></div>)}</div> : <div className="purchase-quote-waiting-card"><span>بانتظار تسعير المورد</span><small>يمكن إعادة إرسال رابط التسعير عبر واتساب.</small></div>}
            {(quote.attachments || []).length ? <div className="purchase-quote-attachments">{quote.attachments.map((file) => <a key={file._id || file.publicUrl} href={assetUrl(file.publicUrl)} target="_blank" rel="noreferrer">عرض المرفق: {file.originalName || file.fileName}</a>)}</div> : null}
            <div className="form-actions daily-plan-actions purchase-daily-quote-actions"><button className="btn btn-soft btn-sm" disabled={saving} onClick={() => onView(purchase)}>عرض فقط</button><button className="btn btn-soft btn-sm" disabled={saving} onClick={() => sendQuote(purchase, quote)}>واتساب</button><button className="btn btn-soft btn-sm" disabled={saving} onClick={() => onExport(purchase, 'pdf')}>PDF</button><button className="btn btn-soft btn-sm" disabled={saving} onClick={() => onExport(purchase, 'excel')}>Excel</button>{quote.status === 'QUOTED' && canApprove && !purchase.purchaseOrder?.poNo ? <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => onApprove(quote._id, purchase)}>تجهيز واعتماد الطلب</button> : null}</div>
          </article>;
        })}
        {!visibleQuotes.length ? <div className="purchase-quote-empty">لا توجد طلبات ضمن هذه الحالة.</div> : null}
      </div>
    </section>
  );
}

function ComparePanel({ purchase, comparison, onApprove, canApprove, saving }) {
  if (!purchase) return <section className="card section" style={{ marginTop: 16 }}>اختر طلب شراء أولاً.</section>;
  const data = comparison || { itemRows: [], supplierTotals: [] };
  return (
    <section className="card section purchase-compare-panel" style={{ marginTop: 16 }}>
      <div className="section-header purchase-compare-header"><div><span className="purchase-compare-code" dir="ltr">{purchase.requestNo}</span><h2>مقارنة عروض الموردين</h2><p>مقارنة سعر الوحدة والإجمالي لكل مادة، مع إبراز أفضل سعر تلقائيًا.</p></div><Pill status={purchase.status} /></div>
      <div className="purchase-table-wrap purchase-compare-table-wrap"><table className="table purchase-compare-table"><thead><tr><th>المادة</th><th>الكمية المطلوبة</th>{(purchase.suppliers || []).map((supplier) => <th key={supplier._id}>{supplier.companyName || supplier.supplierName}</th>)}</tr></thead><tbody>{data.itemRows.map((row) => <tr key={row.materialId}><td><strong>{row.materialName}</strong><small>{row.unit || ''}</small></td><td><b className="purchase-compare-qty" dir="ltr">{money(row.requestedQty)}</b></td>{row.quotes.map((quote) => { const isBest = quote.unitPrice > 0 && quote.unitPrice === row.minUnitPrice; return <td key={quote.supplierId} className={isBest ? 'purchase-compare-best-cell' : ''}>{quote.unitPrice ? <div className="purchase-compare-price"><span>سعر الوحدة</span><strong dir="ltr">{money(quote.unitPrice)}</strong><span>الإجمالي</span><b dir="ltr">{money(quote.totalPrice)}</b>{isBest ? <em>أفضل سعر</em> : null}</div> : <span className="purchase-compare-no-price">لم يُسعّر</span>}{quote.alternativeName ? <div className="daily-plan-card-subtitle">البديل: {quote.alternativeName}</div> : null}</td>; })}</tr>)}</tbody></table></div>
      <div className="purchase-compare-section-title"><div><span>02</span><h3>إجمالي عروض الموردين</h3></div><p>راجع مدة التجهيز والإجمالي قبل اعتماد العرض.</p></div>
      <div className="daily-plan-card-grid purchase-compare-supplier-grid">{data.supplierTotals.map((supplier) => { const isBest = supplier.total === data.bestTotal && supplier.total > 0; return <article className={`daily-plan-card purchase-compare-supplier-card ${isBest ? 'is-best' : ''}`} key={supplier.supplierId}><div className="purchase-compare-supplier-head"><div><span>المورد</span><h3>{supplier.supplierName}</h3></div><span className={`status-pill ${supplier.status === 'QUOTED' ? 'status-approved' : 'status-inprogress'}`}>{supplierStatuses[supplier.status] || supplier.status}</span></div><div className="daily-plan-mini-grid"><div><span>مدة التجهيز</span><strong dir="ltr">{money(supplier.deliveryDays || 0)} يوم</strong></div><div><span>أجور النقل</span><strong dir="ltr">{money(supplier.deliveryFee || 0)} {supplier.currency}</strong></div></div><div className="purchase-compare-total"><span>الإجمالي الكلي</span><strong dir="ltr">{money(supplier.total)} {supplier.currency}</strong></div>{isBest ? <div className="purchase-compare-best-badge">أفضل عرض إجمالي</div> : null}{supplier.generalNotes ? <p className="purchase-compare-notes">{supplier.generalNotes}</p> : null}{canApprove ? <button className="btn btn-primary" disabled={saving || supplier.status !== 'QUOTED'} onClick={() => onApprove((purchase.suppliers || []).find((q) => idOf(q.supplier) === supplier.supplierId)?._id)}>تجهيز واعتماد العرض</button> : null}</article>; })}</div>
    </section>
  );
}

function OrdersPanel({ purchases, setSelectedId, setActiveTab }) {
  return <section className="card section" style={{ marginTop: 16 }}><div className="daily-plan-card-grid">{purchases.map((purchase) => <article className="daily-plan-card" key={purchase._id}><strong>{purchase.purchaseOrder.poNo}</strong><span>{purchase.requestNo}</span><span className="daily-plan-card-subtitle">{purchase.purchaseOrder.supplierName || 'شراء متعدد الموردين'}</span><h2>{money(purchase.purchaseOrder.totalAmount)}</h2><Pill status={purchase.status} /><button className="btn btn-soft btn-sm" onClick={() => { setSelectedId(purchase._id); setActiveTab('receiving'); }}>استلام</button></article>)}</div></section>;
}

function ReceivingPanel({ purchase, warehouses, warehouseId, setWarehouseId, lines, setLines, canReceive, saving, onReceive }) {
  if (!purchase?.purchaseOrder?.poNo) return <section className="card section" style={{ marginTop: 16 }}>لا يوجد أمر شراء محدد بانتظار الاستلام.</section>;
  if (purchase.status === 'RECEIVED') return null;
  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="section-header"><div><h2>استلام المواد - {purchase.purchaseOrder.poNo}</h2><p>{purchase.requestNo}</p></div><Pill status={purchase.status} /></div>
      <label>مخزن الاستلام<select className="select" value={warehouseId || ''} onChange={(e) => setWarehouseId(e.target.value)}><option value="">اختر المخزن</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
      <div className="purchase-table-wrap" style={{ marginTop: 12 }}><table className="table"><thead><tr><th>المادة</th><th>المطلوب</th><th>المستلم</th><th>الكلفة</th><th>ملاحظات</th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.materialId}><td>{line.materialName}</td><td>{money(line.orderedQty)}</td><td><input className="input" type="number" min="0" step="any" value={line.receivedQty} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, receivedQty: e.target.value } : item))} /></td><td><input className="input" type="number" min="0" step="any" value={line.unitCost} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, unitCost: e.target.value } : item))} /></td><td><input className="input" value={line.notes} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, notes: e.target.value } : item))} /></td></tr>)}</tbody></table></div>
      <div className="form-actions form-actions-end" style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={!canReceive || saving || !warehouseId} onClick={onReceive}>تأكيد إدخال المواد للمخزن</button></div>
    </section>
  );
}

function ReportsPanel({ purchases }) {
  const received = purchases.filter((item) => item.status === 'RECEIVED');
  const open = purchases.filter((item) => item.purchaseOrder?.poNo && item.status !== 'RECEIVED');
  const suppliers = new Map();
  purchases.forEach((purchase) => {
    const name = purchase.purchaseOrder?.supplierName;
    if (name) suppliers.set(name, (suppliers.get(name) || 0) + 1);
  });
  const topSupplier = [...suppliers.entries()].sort((a, b) => b[1] - a[1])[0];
  const receiptRows = received.flatMap((purchase) => (purchase.receipts || []).flatMap((receipt) => (
    (receipt.items || []).map((item) => {
      const materialId = idOf(item.material);
      const orderedLine = (purchase.purchaseOrder?.selectedLines || []).find((line) => idOf(line.material) === materialId);
      const quantity = Number(item.receivedQty || 0);
      const unitCost = Number(item.unitCost || 0);
      return {
        key: `${purchase._id}-${receipt._id}-${item._id || materialId}`,
        receiptNo: receipt.receiptNo,
        receivedAt: receipt.receivedAt,
        supplierName: orderedLine?.supplierName || purchase.purchaseOrder?.supplierName || '-',
        materialName: item.materialName || orderedLine?.materialName || '-',
        quantity,
        unitCost,
        total: quantity * unitCost,
        currency: purchase.purchaseOrder?.currency || 'IQD',
      };
    })
  )));
  const grandTotals = receiptRows.reduce((totals, row) => {
    totals[row.currency] = (totals[row.currency] || 0) + row.total;
    return totals;
  }, {});

  return (
    <section className="card section" style={{ marginTop: 16 }}>
      <div className="grid-4">
        <article className="card section"><p className="maintenance-kpi-label">طلبات مستلمة</p><h2>{received.length}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">أوامر مفتوحة</p><h2>{open.length}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">أكثر مورد</p><h2>{topSupplier?.[0] || '-'}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">إجمالي الأوامر</p><h2>{purchases.filter((item) => item.purchaseOrder?.poNo).length}</h2></article>
      </div>
      <div className="section-header" style={{ marginTop: 24 }}>
        <div><h2>تفاصيل المواد المستلمة</h2><p>المورد والكميات والأسعار المسجلة عند الاستلام.</p></div>
      </div>
      {receiptRows.length ? (
        <>
          <div className="purchase-table-wrap">
            <table className="table">
              <thead><tr><th>رقم الاستلام</th><th>التاريخ</th><th>المورد</th><th>المادة</th><th>العدد</th><th>سعر المفرد</th><th>المجموع</th></tr></thead>
              <tbody>{receiptRows.map((row) => <tr key={row.key}><td>{row.receiptNo || '-'}</td><td>{fmt(row.receivedAt)}</td><td>{row.supplierName}</td><td>{row.materialName}</td><td>{money(row.quantity)}</td><td>{money(row.unitCost)} {row.currency}</td><td><strong>{money(row.total)} {row.currency}</strong></td></tr>)}</tbody>
              <tfoot>{Object.entries(grandTotals).map(([currency, total]) => <tr key={currency}><th colSpan="6">المجموع الكلي ({currency})</th><th>{money(total)} {currency}</th></tr>)}</tfoot>
            </table>
          </div>
        </>
      ) : <p style={{ marginTop: 16 }}>لا توجد مواد مستلمة لعرضها حتى الآن.</p>}
    </section>
  );
}
