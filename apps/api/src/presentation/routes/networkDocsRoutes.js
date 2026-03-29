import { Router } from 'express';
import { Permission } from '../../shared/constants.js';
import {
  approveBranchBaseline,
  createBranchDevice,
  createBranchIpAllocation,
  createBranchSubnet,
  createBranchVlan,
  createBranchWanLink,
  createBranchVpnTunnel,
  createBranchWifiProfile,
  createCustomerBranch,
  createNetworkCustomer,
  downloadNetworkAttachment,
  exportBranchNetworkPdf,
  exportCustomerNetworkPdf,
  getNetworkCustomerWorkspace,
  listBranchDevices,
  listBranchIpAllocations,
  listBranchSubnets,
  listBranchVlans,
  listBranchWanLinks,
  listBranchVpnTunnels,
  listBranchWifiProfiles,
  listCustomerBranches,
  listNetworkAttachments,
  listNetworkChangeLogs,
  listNetworkCustomers,
  networkDocsDashboardSummary,
  revealNetworkSecret,
  updateNetworkBranch,
  updateNetworkCustomer,
  updateNetworkDevice,
  updateNetworkIpAllocation,
  updateNetworkSubnet,
  updateNetworkVlan,
  updateNetworkWanLink,
  updateNetworkVpnTunnel,
  updateNetworkWifiProfile,
  uploadNetworkAttachments,
} from '../controllers/networkDocsController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  canApproveNetworkBaseline,
  canExportNetworkReports,
  canManageNetworkAttachments,
  canManageNetworkBranches,
  canManageNetworkCustomers,
  canManageNetworkDevices,
  canManageNetworkIpPlan,
  canManageNetworkVlans,
  canManageNetworkVpn,
  canManageNetworkWan,
  canManageNetworkWifi,
  canViewNetworkChangeLog,
  canViewNetworkSecrets,
  requireAnyPermission,
} from '../middlewares/authorizationMiddleware.js';
import { uploadNetworkAttachmentMiddleware } from '../middlewares/uploadMiddleware.js';

const networkDocsRoutes = Router();

networkDocsRoutes.use(requireAuth);
networkDocsRoutes.use(requireAnyPermission(
  Permission.VIEW_NETWORK_DOCUMENTATION,
  Permission.MANAGE_NETWORK_CUSTOMERS,
  Permission.MANAGE_NETWORK_BRANCHES,
  Permission.MANAGE_NETWORK_DEVICES,
  Permission.MANAGE_NETWORK_IP_PLAN,
  Permission.MANAGE_NETWORK_VLANS,
  Permission.MANAGE_NETWORK_WAN,
  Permission.MANAGE_NETWORK_VPN,
  Permission.MANAGE_NETWORK_WIFI,
  Permission.MANAGE_NETWORK_ATTACHMENTS,
  Permission.APPROVE_NETWORK_BASELINE,
  Permission.EXPORT_NETWORK_REPORTS,
  Permission.VIEW_NETWORK_SECRETS,
  Permission.VIEW_NETWORK_CHANGE_LOG,
));

networkDocsRoutes.get('/dashboard/summary', networkDocsDashboardSummary);

networkDocsRoutes.get('/customers', listNetworkCustomers);
networkDocsRoutes.post('/customers', canManageNetworkCustomers, createNetworkCustomer);
networkDocsRoutes.get('/customers/:id/workspace', getNetworkCustomerWorkspace);
networkDocsRoutes.patch('/customers/:id', canManageNetworkCustomers, updateNetworkCustomer);

networkDocsRoutes.get('/customers/:customerId/branches', listCustomerBranches);
networkDocsRoutes.post('/customers/:customerId/branches', canManageNetworkBranches, createCustomerBranch);
networkDocsRoutes.patch('/branches/:id', canManageNetworkBranches, updateNetworkBranch);
networkDocsRoutes.patch('/branches/:id/approve-baseline', canApproveNetworkBaseline, approveBranchBaseline);

networkDocsRoutes.get('/branches/:branchId/devices', listBranchDevices);
networkDocsRoutes.post('/branches/:branchId/devices', canManageNetworkDevices, createBranchDevice);
networkDocsRoutes.patch('/devices/:id', canManageNetworkDevices, updateNetworkDevice);

networkDocsRoutes.get('/branches/:branchId/subnets', listBranchSubnets);
networkDocsRoutes.post('/branches/:branchId/subnets', canManageNetworkIpPlan, createBranchSubnet);
networkDocsRoutes.patch('/subnets/:id', canManageNetworkIpPlan, updateNetworkSubnet);

networkDocsRoutes.get('/branches/:branchId/ip-allocations', listBranchIpAllocations);
networkDocsRoutes.post('/branches/:branchId/ip-allocations', canManageNetworkIpPlan, createBranchIpAllocation);
networkDocsRoutes.patch('/ip-allocations/:id', canManageNetworkIpPlan, updateNetworkIpAllocation);

networkDocsRoutes.get('/branches/:branchId/vlans', listBranchVlans);
networkDocsRoutes.post('/branches/:branchId/vlans', canManageNetworkVlans, createBranchVlan);
networkDocsRoutes.patch('/vlans/:id', canManageNetworkVlans, updateNetworkVlan);

networkDocsRoutes.get('/branches/:branchId/wan-links', listBranchWanLinks);
networkDocsRoutes.post('/branches/:branchId/wan-links', canManageNetworkWan, createBranchWanLink);
networkDocsRoutes.patch('/wan-links/:id', canManageNetworkWan, updateNetworkWanLink);

networkDocsRoutes.get('/branches/:branchId/vpn-tunnels', listBranchVpnTunnels);
networkDocsRoutes.post('/branches/:branchId/vpn-tunnels', canManageNetworkVpn, createBranchVpnTunnel);
networkDocsRoutes.patch('/vpn-tunnels/:id', canManageNetworkVpn, updateNetworkVpnTunnel);

networkDocsRoutes.get('/branches/:branchId/wifi-profiles', listBranchWifiProfiles);
networkDocsRoutes.post('/branches/:branchId/wifi-profiles', canManageNetworkWifi, createBranchWifiProfile);
networkDocsRoutes.patch('/wifi-profiles/:id', canManageNetworkWifi, updateNetworkWifiProfile);

networkDocsRoutes.get('/attachments', listNetworkAttachments);
networkDocsRoutes.post('/attachments', canManageNetworkAttachments, uploadNetworkAttachmentMiddleware.array('files', 10), uploadNetworkAttachments);
networkDocsRoutes.get('/attachments/:id/download', downloadNetworkAttachment);

networkDocsRoutes.get('/changes', canViewNetworkChangeLog, listNetworkChangeLogs);
networkDocsRoutes.post('/secrets/:id/reveal', canViewNetworkSecrets, revealNetworkSecret);

networkDocsRoutes.get('/reports/customer/:customerId/pdf', canExportNetworkReports, exportCustomerNetworkPdf);
networkDocsRoutes.get('/reports/branch/:branchId/pdf', canExportNetworkReports, exportBranchNetworkPdf);

export default networkDocsRoutes;
