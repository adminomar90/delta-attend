'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { authStorage } from '../../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../../lib/permissions';

const tabs = [
  ['overview', 'الملخص'],
  ['inventory', 'Inventory'],
  ['attachments', 'المرفقات'],
  ['change-log', 'Change Log'],
];

const emptyBranchForm = { name: '', city: '', address: '', siteType: 'BRANCH', notes: '' };
const emptyDeviceForm = { name: '', deviceType: 'ROUTER', vendor: '', model: '', managementIp: '', serialNumber: '', macAddress: '', physicalLocation: '', notes: '' };
const emptySubnetForm = { cidr: '', gateway: '', dnsServers: '', purpose: '' };
const emptyIpForm = { ipAddress: '', ipType: 'STATIC', subnetId: '', deviceId: '', hostname: '' };
const emptyVlanForm = { vlanId: '', name: '', subnetId: '', purpose: '' };
const emptyWanForm = { ispName: '', connectionType: 'FIBER', downloadMbps: '', uploadMbps: '', publicIps: '', subscriptionSecret: '' };
const emptyVpnForm = { name: '', vpnType: 'SITE_TO_SITE_IPSEC', localSubnets: '', remoteSubnets: '', peerIp: '', secretValue: '' };
const emptyWifiForm = { ssid: '', securityType: 'WPA2_PSK', vlanId: '', preSharedKey: '', coverageNotes: '' };
const emptyAttachmentForm = { category: 'PHOTO', file: null };

const byBranch = (items, branchId) => (items || []).filter((item) => (item.branch?._id || item.branch?.id || item.branch) === branchId);

const downloadBlobToFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function NetworkCustomerWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId;
  const currentUser = authStorage.getUser();

  const canManageBranches = hasAnyPermission(currentUser, [Permission.MANAGE_NETWORK_BRANCHES, Permission.MANAGE_NETWORK_CUSTOMERS]);
  const canManageDevices = hasPermission(currentUser, Permission.MANAGE_NETWORK_DEVICES);
  const canManageIpPlan = hasPermission(currentUser, Permission.MANAGE_NETWORK_IP_PLAN);
  const canManageVlans = hasPermission(currentUser, Permission.MANAGE_NETWORK_VLANS);
  const canManageWan = hasPermission(currentUser, Permission.MANAGE_NETWORK_WAN);
  const canManageVpn = hasPermission(currentUser, Permission.MANAGE_NETWORK_VPN);
  const canManageWifi = hasPermission(currentUser, Permission.MANAGE_NETWORK_WIFI);
  const canManageAttachments = hasPermission(currentUser, Permission.MANAGE_NETWORK_ATTACHMENTS);
  const canApproveBaseline = hasPermission(currentUser, Permission.APPROVE_NETWORK_BASELINE);
  const canRevealSecrets = hasPermission(currentUser, Permission.VIEW_NETWORK_SECRETS);

  const [workspace, setWorkspace] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [subnetForm, setSubnetForm] = useState(emptySubnetForm);
  const [ipForm, setIpForm] = useState(emptyIpForm);
  const [vlanForm, setVlanForm] = useState(emptyVlanForm);
  const [wanForm, setWanForm] = useState(emptyWanForm);
  const [vpnForm, setVpnForm] = useState(emptyVpnForm);
  const [wifiForm, setWifiForm] = useState(emptyWifiForm);
  const [attachmentForm, setAttachmentForm] = useState(emptyAttachmentForm);
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/network-docs/customers/${customerId}/workspace`);
      setWorkspace(response.workspace || null);
      const firstBranchId = response.workspace?.branches?.[0]?.id || response.workspace?.branches?.[0]?._id || '';
      setSelectedBranchId((current) => current || firstBranchId);
    } catch (err) {
      setError(err.message || 'تعذر تحميل ملف الزبون');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) load();
  }, [customerId]);

  const selectedBranch = useMemo(
    () => (workspace?.branches || []).find((branch) => (branch.id || branch._id) === selectedBranchId) || null,
    [workspace?.branches, selectedBranchId],
  );

  const branchDevices = useMemo(() => byBranch(workspace?.devices, selectedBranchId), [workspace?.devices, selectedBranchId]);
  const branchSubnets = useMemo(() => byBranch(workspace?.subnets, selectedBranchId), [workspace?.subnets, selectedBranchId]);
  const branchIps = useMemo(() => byBranch(workspace?.ipAllocations, selectedBranchId), [workspace?.ipAllocations, selectedBranchId]);
  const branchVlans = useMemo(() => byBranch(workspace?.vlans, selectedBranchId), [workspace?.vlans, selectedBranchId]);
  const branchWan = useMemo(() => byBranch(workspace?.wanLinks, selectedBranchId), [workspace?.wanLinks, selectedBranchId]);
  const branchVpn = useMemo(() => byBranch(workspace?.vpnTunnels, selectedBranchId), [workspace?.vpnTunnels, selectedBranchId]);
  const branchWifi = useMemo(() => byBranch(workspace?.wifiProfiles, selectedBranchId), [workspace?.wifiProfiles, selectedBranchId]);
  const branchAttachments = useMemo(() => byBranch(workspace?.attachments, selectedBranchId), [workspace?.attachments, selectedBranchId]);
  const branchChanges = useMemo(() => (workspace?.changeLogs || []).filter((item) => !selectedBranchId || (item.branch?._id || item.branch?.id || item.branch) === selectedBranchId), [workspace?.changeLogs, selectedBranchId]);

  const branchRequired = () => {
    if (!selectedBranchId) {
      setError('يجب اختيار فرع أولاً.');
      return false;
    }
    return true;
  };

  const submitJson = async (successMessage, fn, onDone) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await fn();
      if (onDone) onDone();
      setInfo(successMessage);
      await load();
    } catch (err) {
      setError(err.message || 'تعذر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  const revealSecret = async (secretId) => {
    try {
      const response = await api.post(`/network-docs/secrets/${secretId}/reveal`, {});
      setRevealedSecrets((current) => ({ ...current, [secretId]: response.secret?.value || '' }));
    } catch (err) {
      setError(err.message || 'تعذر كشف السر');
    }
  };

  const downloadPdf = async (path, filename) => {
    try {
      const blob = await api.downloadBlob(path);
      downloadBlobToFile(blob, filename);
    } catch (err) {
      setError(err.message || 'تعذر تنزيل PDF');
    }
  };

  const downloadAttachment = async (attachment) => {
    try {
      const blob = await api.downloadBlob(`/network-docs/attachments/${attachment.id || attachment._id}/download`);
      downloadBlobToFile(blob, attachment.originalName || 'attachment');
    } catch (err) {
      setError(err.message || 'تعذر تنزيل المرفق');
    }
  };

  if (loading && !workspace) {
    return <section className="card section">جارٍ تحميل ملف الزبون...</section>;
  }

  if (!workspace?.customer) {
    return <section className="card section">تعذر العثور على بيانات الزبون.</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 style={{ marginBottom: 6 }}>{workspace.customer.name}</h2>
            <div style={{ color: 'var(--text-soft)' }}>{workspace.customer.companyAddress || 'بدون عنوان تفصيلي'}</div>
            <div style={{ color: 'var(--text-soft)', marginTop: 4 }}>المسؤول: {workspace.customer.responsiblePerson?.name || '-'} {workspace.customer.responsiblePerson?.phone ? `- ${workspace.customer.responsiblePerson.phone}` : ''}</div>
          </div>
          <div className="form-actions">
            <button className="btn btn-soft" type="button" onClick={() => router.push('/network-documentation')}>رجوع</button>
            <button className="btn btn-soft" type="button" onClick={() => downloadPdf(`/network-docs/reports/customer/${customerId}/pdf`, `network-docs-${workspace.customer.name}.pdf`)}>PDF الزبون</button>
          </div>
        </div>

        <div className="tabs-bar">
          {tabs.map(([value, label]) => (
            <button key={value} className={`btn ${activeTab === value ? 'btn-primary' : 'btn-soft'}`} type="button" onClick={() => setActiveTab(value)} style={{ marginInlineEnd: 8 }}>
              {label}
            </button>
          ))}
        </div>

        {workspace.branches?.length ? (
          <label>
            الفرع النشط
            <select className="select" value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
              {workspace.branches.map((branch) => (
                <option key={branch.id || branch._id} value={branch.id || branch._id}>{branch.name} - {branch.city || 'بدون مدينة'}</option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {activeTab === 'overview' ? (
        <>
          {canManageBranches ? (
            <section className="card section" style={{ marginBottom: 16 }}>
              <h2>إضافة فرع جديد</h2>
              <form className="grid-3" onSubmit={(e) => {
                e.preventDefault();
                submitJson('تم إنشاء الفرع.', () => api.post(`/network-docs/customers/${customerId}/branches`, branchForm), () => setBranchForm(emptyBranchForm));
              }}>
                <label>اسم الفرع<input className="input" value={branchForm.name} onChange={(e) => setBranchForm((c) => ({ ...c, name: e.target.value }))} required /></label>
                <label>المدينة<input className="input" value={branchForm.city} onChange={(e) => setBranchForm((c) => ({ ...c, city: e.target.value }))} /></label>
                <label>نوع الموقع<select className="select" value={branchForm.siteType} onChange={(e) => setBranchForm((c) => ({ ...c, siteType: e.target.value }))}><option value="BRANCH">فرع</option><option value="HQ">مقر رئيسي</option><option value="OFFICE">مكتب</option><option value="DATACENTER">مركز بيانات</option><option value="WAREHOUSE">مخزن</option><option value="STORE">متجر</option><option value="OTHER">أخرى</option></select></label>
                <label className="grid-span-full">العنوان<input className="input" value={branchForm.address} onChange={(e) => setBranchForm((c) => ({ ...c, address: e.target.value }))} /></label>
                <label className="grid-span-full">ملاحظات<textarea className="textarea" rows={3} value={branchForm.notes} onChange={(e) => setBranchForm((c) => ({ ...c, notes: e.target.value }))} /></label>
                <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>إضافة الفرع</button></div>
              </form>
            </section>
          ) : null}

          <section className="card section">
            <h2>الفروع</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {workspace.branches?.map((branch) => (
                <article key={branch.id || branch._id} className="card section" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{branch.name}</strong>
                      <div style={{ color: 'var(--text-soft)', marginTop: 4 }}>{branch.city || '-'} - {branch.address || 'بدون عنوان مفصل'}</div>
                      <div style={{ color: 'var(--text-soft)', marginTop: 4 }}>حالة التوثيق: {branch.documentationStatus || '-'}</div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-soft" type="button" onClick={() => setSelectedBranchId(branch.id || branch._id)}>اختيار</button>
                      <button className="btn btn-soft" type="button" onClick={() => downloadPdf(`/network-docs/reports/branch/${branch.id || branch._id}/pdf`, `network-docs-${branch.name}.pdf`)}>PDF</button>
                      {canApproveBaseline ? <button className="btn btn-primary" type="button" onClick={() => submitJson('تم اعتماد baseline للفرع.', () => api.patch(`/network-docs/branches/${branch.id || branch._id}/approve-baseline`, {}))}>اعتماد baseline</button> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'inventory' ? (
        <section className="card section">
          <h2>Inventory للفرع {selectedBranch?.name || ''}</h2>

          {canManageDevices ? (
            <form className="grid-3" onSubmit={(e) => {
              e.preventDefault();
              if (!branchRequired()) return;
              submitJson('تمت إضافة الجهاز.', () => api.post(`/network-docs/branches/${selectedBranchId}/devices`, deviceForm), () => setDeviceForm(emptyDeviceForm));
            }}>
              <label>اسم الجهاز<input className="input" value={deviceForm.name} onChange={(e) => setDeviceForm((c) => ({ ...c, name: e.target.value }))} required /></label>
              <label>النوع<select className="select" value={deviceForm.deviceType} onChange={(e) => setDeviceForm((c) => ({ ...c, deviceType: e.target.value }))}><option value="ROUTER">Router</option><option value="SWITCH">Switch</option><option value="FIREWALL">Firewall</option><option value="ACCESS_POINT">Access Point</option><option value="NVR">NVR</option><option value="IP_PBX">IP PBX</option><option value="SERVER">Server</option><option value="CAMERA">Camera</option><option value="PRINTER">Printer</option><option value="UPS">UPS</option><option value="OTHER">Other</option></select></label>
              <label>IP الإدارة<input className="input" value={deviceForm.managementIp} onChange={(e) => setDeviceForm((c) => ({ ...c, managementIp: e.target.value }))} /></label>
              <label>Vendor<input className="input" value={deviceForm.vendor} onChange={(e) => setDeviceForm((c) => ({ ...c, vendor: e.target.value }))} /></label>
              <label>Model<input className="input" value={deviceForm.model} onChange={(e) => setDeviceForm((c) => ({ ...c, model: e.target.value }))} /></label>
              <label>Serial<input className="input" value={deviceForm.serialNumber} onChange={(e) => setDeviceForm((c) => ({ ...c, serialNumber: e.target.value }))} /></label>
              <label>MAC<input className="input" value={deviceForm.macAddress} onChange={(e) => setDeviceForm((c) => ({ ...c, macAddress: e.target.value }))} /></label>
              <label className="grid-span-full">الموقع / ملاحظات<input className="input" value={deviceForm.physicalLocation} onChange={(e) => setDeviceForm((c) => ({ ...c, physicalLocation: e.target.value }))} /></label>
              <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>إضافة جهاز</button></div>
            </form>
          ) : null}

          {canManageIpPlan ? (
            <>
              <form className="grid-3" style={{ marginTop: 18 }} onSubmit={(e) => {
                e.preventDefault();
                if (!branchRequired()) return;
                submitJson('تمت إضافة subnet.', () => api.post(`/network-docs/branches/${selectedBranchId}/subnets`, { ...subnetForm, dnsServers: subnetForm.dnsServers.split(',') }), () => setSubnetForm(emptySubnetForm));
              }}>
                <label>CIDR<input className="input" value={subnetForm.cidr} onChange={(e) => setSubnetForm((c) => ({ ...c, cidr: e.target.value }))} required /></label>
                <label>Gateway<input className="input" value={subnetForm.gateway} onChange={(e) => setSubnetForm((c) => ({ ...c, gateway: e.target.value }))} /></label>
                <label>DNS<input className="input" value={subnetForm.dnsServers} onChange={(e) => setSubnetForm((c) => ({ ...c, dnsServers: e.target.value }))} placeholder="8.8.8.8,1.1.1.1" /></label>
                <label className="grid-span-full">Purpose<input className="input" value={subnetForm.purpose} onChange={(e) => setSubnetForm((c) => ({ ...c, purpose: e.target.value }))} /></label>
                <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>إضافة Subnet</button></div>
              </form>

              <form className="grid-3" style={{ marginTop: 18 }} onSubmit={(e) => {
                e.preventDefault();
                if (!branchRequired()) return;
                submitJson('تمت إضافة IP.', () => api.post(`/network-docs/branches/${selectedBranchId}/ip-allocations`, ipForm), () => setIpForm(emptyIpForm));
              }}>
                <label>IP<input className="input" value={ipForm.ipAddress} onChange={(e) => setIpForm((c) => ({ ...c, ipAddress: e.target.value }))} required /></label>
                <label>النوع<select className="select" value={ipForm.ipType} onChange={(e) => setIpForm((c) => ({ ...c, ipType: e.target.value }))}><option value="STATIC">Static</option><option value="GATEWAY">Gateway</option><option value="DNS">DNS</option><option value="DHCP_RESERVED">DHCP Reserved</option><option value="PUBLIC">Public</option><option value="MANAGEMENT">Management</option><option value="VPN_PEER">VPN Peer</option></select></label>
                <label>Subnet<select className="select" value={ipForm.subnetId} onChange={(e) => setIpForm((c) => ({ ...c, subnetId: e.target.value }))}><option value="">بدون</option>{branchSubnets.map((subnet) => <option key={subnet.id || subnet._id} value={subnet.id || subnet._id}>{subnet.cidr}</option>)}</select></label>
                <label>Device<select className="select" value={ipForm.deviceId} onChange={(e) => setIpForm((c) => ({ ...c, deviceId: e.target.value }))}><option value="">بدون</option>{branchDevices.map((device) => <option key={device.id || device._id} value={device.id || device._id}>{device.name}</option>)}</select></label>
                <label>Hostname<input className="input" value={ipForm.hostname} onChange={(e) => setIpForm((c) => ({ ...c, hostname: e.target.value }))} /></label>
                <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>إضافة IP</button></div>
              </form>
            </>
          ) : null}

          <div className="grid-2" style={{ marginTop: 18 }}>
            {canManageVlans ? (
              <article className="card section" style={{ padding: 12 }}>
                <strong>إضافة VLAN</strong>
                <form className="grid-2" style={{ marginTop: 10 }} onSubmit={(e) => {
                  e.preventDefault();
                  if (!branchRequired()) return;
                  submitJson('تمت إضافة VLAN.', () => api.post(`/network-docs/branches/${selectedBranchId}/vlans`, vlanForm), () => setVlanForm(emptyVlanForm));
                }}>
                  <label>VLAN ID<input className="input" value={vlanForm.vlanId} onChange={(e) => setVlanForm((c) => ({ ...c, vlanId: e.target.value }))} required /></label>
                  <label>الاسم<input className="input" value={vlanForm.name} onChange={(e) => setVlanForm((c) => ({ ...c, name: e.target.value }))} required /></label>
                  <label>Subnet<select className="select" value={vlanForm.subnetId} onChange={(e) => setVlanForm((c) => ({ ...c, subnetId: e.target.value }))}><option value="">بدون</option>{branchSubnets.map((subnet) => <option key={subnet.id || subnet._id} value={subnet.id || subnet._id}>{subnet.cidr}</option>)}</select></label>
                  <label>Purpose<input className="input" value={vlanForm.purpose} onChange={(e) => setVlanForm((c) => ({ ...c, purpose: e.target.value }))} /></label>
                  <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>حفظ VLAN</button></div>
                </form>
              </article>
            ) : null}

            {canManageWan ? (
              <article className="card section" style={{ padding: 12 }}>
                <strong>إضافة WAN</strong>
                <form className="grid-2" style={{ marginTop: 10 }} onSubmit={(e) => {
                  e.preventDefault();
                  if (!branchRequired()) return;
                  submitJson('تمت إضافة WAN.', () => api.post(`/network-docs/branches/${selectedBranchId}/wan-links`, wanForm), () => setWanForm(emptyWanForm));
                }}>
                  <label>ISP<input className="input" value={wanForm.ispName} onChange={(e) => setWanForm((c) => ({ ...c, ispName: e.target.value }))} required /></label>
                  <label>النوع<select className="select" value={wanForm.connectionType} onChange={(e) => setWanForm((c) => ({ ...c, connectionType: e.target.value }))}><option value="FIBER">Fiber</option><option value="WIRELESS">Wireless</option><option value="DSL">DSL</option><option value="LTE">LTE</option><option value="OTHER">Other</option></select></label>
                  <label>Download<input className="input" value={wanForm.downloadMbps} onChange={(e) => setWanForm((c) => ({ ...c, downloadMbps: e.target.value }))} /></label>
                  <label>Upload<input className="input" value={wanForm.uploadMbps} onChange={(e) => setWanForm((c) => ({ ...c, uploadMbps: e.target.value }))} /></label>
                  <label>Public IPs<input className="input" value={wanForm.publicIps} onChange={(e) => setWanForm((c) => ({ ...c, publicIps: e.target.value }))} /></label>
                  <label>Secret<input className="input" value={wanForm.subscriptionSecret} onChange={(e) => setWanForm((c) => ({ ...c, subscriptionSecret: e.target.value }))} /></label>
                  <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>حفظ WAN</button></div>
                </form>
              </article>
            ) : null}

            {canManageVpn ? (
              <article className="card section" style={{ padding: 12 }}>
                <strong>إضافة VPN</strong>
                <form className="grid-2" style={{ marginTop: 10 }} onSubmit={(e) => {
                  e.preventDefault();
                  if (!branchRequired()) return;
                  submitJson('تمت إضافة VPN.', () => api.post(`/network-docs/branches/${selectedBranchId}/vpn-tunnels`, { ...vpnForm, localSubnets: vpnForm.localSubnets.split(','), remoteSubnets: vpnForm.remoteSubnets.split(',') }), () => setVpnForm(emptyVpnForm));
                }}>
                  <label>الاسم<input className="input" value={vpnForm.name} onChange={(e) => setVpnForm((c) => ({ ...c, name: e.target.value }))} required /></label>
                  <label>النوع<select className="select" value={vpnForm.vpnType} onChange={(e) => setVpnForm((c) => ({ ...c, vpnType: e.target.value }))}><option value="SITE_TO_SITE_IPSEC">IPsec</option><option value="OPENVPN">OpenVPN</option><option value="WIREGUARD">WireGuard</option><option value="OTHER">Other</option></select></label>
                  <label>Peer IP<input className="input" value={vpnForm.peerIp} onChange={(e) => setVpnForm((c) => ({ ...c, peerIp: e.target.value }))} /></label>
                  <label>Secret<input className="input" value={vpnForm.secretValue} onChange={(e) => setVpnForm((c) => ({ ...c, secretValue: e.target.value }))} /></label>
                  <label>Local<input className="input" value={vpnForm.localSubnets} onChange={(e) => setVpnForm((c) => ({ ...c, localSubnets: e.target.value }))} /></label>
                  <label>Remote<input className="input" value={vpnForm.remoteSubnets} onChange={(e) => setVpnForm((c) => ({ ...c, remoteSubnets: e.target.value }))} /></label>
                  <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>حفظ VPN</button></div>
                </form>
              </article>
            ) : null}

            {canManageWifi ? (
              <article className="card section" style={{ padding: 12 }}>
                <strong>إضافة Wi-Fi</strong>
                <form className="grid-2" style={{ marginTop: 10 }} onSubmit={(e) => {
                  e.preventDefault();
                  if (!branchRequired()) return;
                  submitJson('تمت إضافة Wi‑Fi.', () => api.post(`/network-docs/branches/${selectedBranchId}/wifi-profiles`, wifiForm), () => setWifiForm(emptyWifiForm));
                }}>
                  <label>SSID<input className="input" value={wifiForm.ssid} onChange={(e) => setWifiForm((c) => ({ ...c, ssid: e.target.value }))} required /></label>
                  <label>Security<select className="select" value={wifiForm.securityType} onChange={(e) => setWifiForm((c) => ({ ...c, securityType: e.target.value }))}><option value="OPEN">Open</option><option value="WPA2_PSK">WPA2 PSK</option><option value="WPA3_PSK">WPA3 PSK</option></select></label>
                  <label>VLAN<select className="select" value={wifiForm.vlanId} onChange={(e) => setWifiForm((c) => ({ ...c, vlanId: e.target.value }))}><option value="">بدون</option>{branchVlans.map((vlan) => <option key={vlan.id || vlan._id} value={vlan.id || vlan._id}>{vlan.vlanId} - {vlan.name}</option>)}</select></label>
                  <label>PSK<input className="input" value={wifiForm.preSharedKey} onChange={(e) => setWifiForm((c) => ({ ...c, preSharedKey: e.target.value }))} /></label>
                  <label className="grid-span-full">Coverage<input className="input" value={wifiForm.coverageNotes} onChange={(e) => setWifiForm((c) => ({ ...c, coverageNotes: e.target.value }))} /></label>
                  <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>حفظ Wi‑Fi</button></div>
                </form>
              </article>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
            <article className="card section" style={{ padding: 12 }}><strong>الأجهزة</strong><table className="table" style={{ marginTop: 10 }}><thead><tr><th>الاسم</th><th>النوع</th><th>IP</th><th>Vendor/Model</th></tr></thead><tbody>{branchDevices.map((device) => <tr key={device.id || device._id}><td>{device.name}</td><td>{device.deviceType}</td><td>{device.managementIp || '-'}</td><td>{device.vendor || '-'} {device.model || ''}</td></tr>)}</tbody></table></article>
            <article className="card section" style={{ padding: 12 }}><strong>Subnets و IPs</strong><div className="split" style={{ marginTop: 10 }}><div><table className="table"><thead><tr><th>CIDR</th><th>Gateway</th><th>Purpose</th></tr></thead><tbody>{branchSubnets.map((subnet) => <tr key={subnet.id || subnet._id}><td>{subnet.cidr}</td><td>{subnet.gateway || '-'}</td><td>{subnet.purpose || '-'}</td></tr>)}</tbody></table></div><div><table className="table"><thead><tr><th>IP</th><th>Type</th><th>Subnet</th><th>Target</th></tr></thead><tbody>{branchIps.map((item) => <tr key={item.id || item._id}><td>{item.ipAddress}</td><td>{item.ipType}</td><td>{item.subnet?.cidr || '-'}</td><td>{item.device?.name || item.hostname || '-'}</td></tr>)}</tbody></table></div></div></article>
            <article className="card section" style={{ padding: 12 }}><strong>VLAN / WAN / VPN / Wi‑Fi</strong><table className="table" style={{ marginTop: 10 }}><thead><tr><th>النوع</th><th>الاسم</th><th>القيمة</th><th>سر مخفي</th></tr></thead><tbody>{branchVlans.map((item) => <tr key={`v-${item.id || item._id}`}><td>VLAN</td><td>{item.name}</td><td>{item.vlanId}</td><td>-</td></tr>)}{branchWan.map((item) => <tr key={`w-${item.id || item._id}`}><td>WAN</td><td>{item.ispName}</td><td>{(item.publicIps || []).join(', ') || `${item.speed?.downloadMbps || 0}/${item.speed?.uploadMbps || 0}`}</td><td>{item.subscriptionInfo?.secret?.maskedPreview || '-'} {canRevealSecrets && item.subscriptionInfo?.secret?.id ? <button className="btn btn-soft btn-sm" type="button" onClick={() => revealSecret(item.subscriptionInfo.secret.id)}>كشف</button> : null} {item.subscriptionInfo?.secret?.id && revealedSecrets[item.subscriptionInfo.secret.id] ? <div>{revealedSecrets[item.subscriptionInfo.secret.id]}</div> : null}</td></tr>)}{branchVpn.map((item) => <tr key={`p-${item.id || item._id}`}><td>VPN</td><td>{item.name}</td><td>{item.peerIp || '-'}</td><td>{item.secret?.maskedPreview || '-'} {canRevealSecrets && item.secret?.id ? <button className="btn btn-soft btn-sm" type="button" onClick={() => revealSecret(item.secret.id)}>كشف</button> : null} {item.secret?.id && revealedSecrets[item.secret.id] ? <div>{revealedSecrets[item.secret.id]}</div> : null}</td></tr>)}{branchWifi.map((item) => <tr key={`f-${item.id || item._id}`}><td>Wi‑Fi</td><td>{item.ssid}</td><td>{item.securityType}</td><td>{item.secret?.maskedPreview || '-'} {canRevealSecrets && item.secret?.id ? <button className="btn btn-soft btn-sm" type="button" onClick={() => revealSecret(item.secret.id)}>كشف</button> : null} {item.secret?.id && revealedSecrets[item.secret.id] ? <div>{revealedSecrets[item.secret.id]}</div> : null}</td></tr>)}</tbody></table></article>
          </div>
        </section>
      ) : null}

      {activeTab === 'attachments' ? (
        <section className="card section">
          <h2>المرفقات</h2>
          {canManageAttachments ? (
            <form className="grid-3" onSubmit={(e) => {
              e.preventDefault();
              if (!branchRequired()) return;
              const data = new FormData();
              data.append('customerId', customerId);
              data.append('branchId', selectedBranchId);
              data.append('entityType', 'NETWORK_BRANCH');
              data.append('entityId', selectedBranchId);
              data.append('category', attachmentForm.category);
              if (attachmentForm.file) data.append('files', attachmentForm.file);
              submitJson('تم رفع المرفق.', () => api.post('/network-docs/attachments', data), () => setAttachmentForm(emptyAttachmentForm));
            }}>
              <label>التصنيف<select className="select" value={attachmentForm.category} onChange={(e) => setAttachmentForm((c) => ({ ...c, category: e.target.value }))}><option value="PHOTO">Photo</option><option value="PDF">PDF</option><option value="CONFIG">Config</option><option value="DIAGRAM">Diagram</option><option value="BACKUP">Backup</option><option value="OTHER">Other</option></select></label>
              <label>الملف<input className="input" type="file" onChange={(e) => setAttachmentForm((c) => ({ ...c, file: e.target.files?.[0] || null }))} required /></label>
              <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>رفع</button></div>
            </form>
          ) : null}
          <table className="table" style={{ marginTop: 16 }}><thead><tr><th>الملف</th><th>التصنيف</th><th>النطاق</th><th>إجراء</th></tr></thead><tbody>{branchAttachments.map((attachment) => <tr key={attachment.id || attachment._id}><td>{attachment.originalName}</td><td>{attachment.category}</td><td>{attachment.storageScope}</td><td><button className="btn btn-soft btn-sm" type="button" onClick={() => downloadAttachment(attachment)}>تنزيل</button></td></tr>)}</tbody></table>
        </section>
      ) : null}

      {activeTab === 'change-log' ? (
        <section className="card section">
          <h2>سجل التغيير</h2>
          <table className="table">
            <thead><tr><th>الإجراء</th><th>الكيان</th><th>السبب</th><th>المنفذ</th><th>الوقت</th></tr></thead>
            <tbody>{branchChanges.map((item) => <tr key={item.id || item._id}><td>{item.action}</td><td>{item.entityType}</td><td>{item.reason || '-'}</td><td>{item.changedBy?.fullName || '-'}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</td></tr>)}</tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
