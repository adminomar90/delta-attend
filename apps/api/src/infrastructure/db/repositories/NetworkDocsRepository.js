import { NetworkAttachmentModel } from '../models/NetworkAttachmentModel.js';
import { NetworkBranchModel } from '../models/NetworkBranchModel.js';
import { NetworkChangeLogModel } from '../models/NetworkChangeLogModel.js';
import { NetworkCustomerModel } from '../models/NetworkCustomerModel.js';
import { NetworkDeviceModel } from '../models/NetworkDeviceModel.js';
import { NetworkIpAllocationModel } from '../models/NetworkIpAllocationModel.js';
import { NetworkSecretModel } from '../models/NetworkSecretModel.js';
import { NetworkSubnetModel } from '../models/NetworkSubnetModel.js';
import { NetworkVlanModel } from '../models/NetworkVlanModel.js';
import { NetworkVpnTunnelModel } from '../models/NetworkVpnTunnelModel.js';
import { NetworkWanLinkModel } from '../models/NetworkWanLinkModel.js';
import { NetworkWifiProfileModel } from '../models/NetworkWifiProfileModel.js';

const userSummary = 'fullName role employeeCode department jobTitle email';

export class NetworkDocsRepository {
  async listCustomers(filter = {}) {
    return NetworkCustomerModel.find(filter)
      .populate('createdBy', userSummary)
      .sort({ updatedAt: -1, createdAt: -1 });
  }

  async createCustomer(payload) {
    return NetworkCustomerModel.create(payload);
  }

  async findCustomerById(id) {
    return NetworkCustomerModel.findById(id)
      .populate('createdBy', userSummary);
  }

  async updateCustomerById(id, payload) {
    return NetworkCustomerModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('createdBy', userSummary);
  }

  async listBranches(filter = {}) {
    return NetworkBranchModel.find(filter)
      .populate('customer', 'name contractStatus')
      .populate('createdBy', userSummary)
      .sort({ name: 1, createdAt: -1 });
  }

  async createBranch(payload) {
    return NetworkBranchModel.create(payload);
  }

  async findBranchById(id) {
    return NetworkBranchModel.findById(id)
      .populate('customer', 'name contractStatus')
      .populate('createdBy', userSummary);
  }

  async updateBranchById(id, payload) {
    return NetworkBranchModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('customer', 'name contractStatus')
      .populate('createdBy', userSummary);
  }

  async listDevices(filter = {}) {
    return NetworkDeviceModel.find(filter)
      .populate('customer', 'name')
      .populate('branch', 'name city documentationStatus')
      .populate('createdBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async createDevice(payload) {
    return NetworkDeviceModel.create(payload);
  }

  async findDeviceById(id) {
    return NetworkDeviceModel.findById(id)
      .populate('customer', 'name')
      .populate('branch', 'name city documentationStatus')
      .populate('createdBy', userSummary);
  }

  async updateDeviceById(id, payload) {
    return NetworkDeviceModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('customer', 'name')
      .populate('branch', 'name city documentationStatus')
      .populate('createdBy', userSummary);
  }

  async listSubnets(filter = {}) {
    return NetworkSubnetModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('createdBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async createSubnet(payload) {
    return NetworkSubnetModel.create(payload);
  }

  async findSubnetById(id) {
    return NetworkSubnetModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('createdBy', userSummary);
  }

  async updateSubnetById(id, payload) {
    return NetworkSubnetModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('createdBy', userSummary);
  }

  async listIpAllocations(filter = {}) {
    return NetworkIpAllocationModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('device', 'name deviceType vendor model managementIp')
      .populate('createdBy', userSummary)
      .sort({ ipAddress: 1, createdAt: -1 });
  }

  async createIpAllocation(payload) {
    return NetworkIpAllocationModel.create(payload);
  }

  async findIpAllocationById(id) {
    return NetworkIpAllocationModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('device', 'name deviceType vendor model managementIp')
      .populate('createdBy', userSummary);
  }

  async updateIpAllocationById(id, payload) {
    return NetworkIpAllocationModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('device', 'name deviceType vendor model managementIp')
      .populate('createdBy', userSummary);
  }

  async listVlans(filter = {}) {
    return NetworkVlanModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('ports.device', 'name deviceType')
      .populate('createdBy', userSummary)
      .sort({ vlanId: 1, createdAt: -1 });
  }

  async createVlan(payload) {
    return NetworkVlanModel.create(payload);
  }

  async findVlanById(id) {
    return NetworkVlanModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('ports.device', 'name deviceType')
      .populate('createdBy', userSummary);
  }

  async updateVlanById(id, payload) {
    return NetworkVlanModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('subnet', 'name cidr gateway')
      .populate('ports.device', 'name deviceType')
      .populate('createdBy', userSummary);
  }

  async listWanLinks(filter = {}) {
    return NetworkWanLinkModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('subscriptionInfo.secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async createWanLink(payload) {
    return NetworkWanLinkModel.create(payload);
  }

  async findWanLinkById(id) {
    return NetworkWanLinkModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('subscriptionInfo.secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async updateWanLinkById(id, payload) {
    return NetworkWanLinkModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('subscriptionInfo.secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async listVpnTunnels(filter = {}) {
    return NetworkVpnTunnelModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async createVpnTunnel(payload) {
    return NetworkVpnTunnelModel.create(payload);
  }

  async findVpnTunnelById(id) {
    return NetworkVpnTunnelModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async updateVpnTunnelById(id, payload) {
    return NetworkVpnTunnelModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async listWifiProfiles(filter = {}) {
    return NetworkWifiProfileModel.find(filter)
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('accessPoints', 'name deviceType managementIp')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async createWifiProfile(payload) {
    return NetworkWifiProfileModel.create(payload);
  }

  async findWifiProfileById(id) {
    return NetworkWifiProfileModel.findById(id)
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('accessPoints', 'name deviceType managementIp')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async updateWifiProfileById(id, payload) {
    return NetworkWifiProfileModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('branch', 'name city documentationStatus')
      .populate('vlan', 'name vlanId')
      .populate('accessPoints', 'name deviceType managementIp')
      .populate('secret', 'maskedPreview secretType')
      .populate('createdBy', userSummary);
  }

  async createAttachment(payload) {
    return NetworkAttachmentModel.create(payload);
  }

  async listAttachments(filter = {}) {
    return NetworkAttachmentModel.find(filter)
      .populate('customer', 'name')
      .populate('branch', 'name city')
      .populate('uploadedBy', userSummary)
      .sort({ createdAt: -1 });
  }

  async findAttachmentById(id) {
    return NetworkAttachmentModel.findById(id)
      .populate('customer', 'name')
      .populate('branch', 'name city')
      .populate('uploadedBy', userSummary);
  }

  async createSecret(payload) {
    return NetworkSecretModel.create(payload);
  }

  async findSecretById(id) {
    return NetworkSecretModel.findById(id)
      .populate('createdBy', userSummary)
      .populate('lastViewedBy', userSummary);
  }

  async findSecretByOwner({ ownerType, ownerId, secretType }) {
    return NetworkSecretModel.findOne({
      ownerType,
      ownerId,
      secretType,
    })
      .populate('createdBy', userSummary)
      .populate('lastViewedBy', userSummary);
  }

  async updateSecretById(id, payload) {
    return NetworkSecretModel.findByIdAndUpdate(id, payload, { new: true })
      .populate('createdBy', userSummary)
      .populate('lastViewedBy', userSummary);
  }

  async createChangeLog(payload) {
    return NetworkChangeLogModel.create(payload);
  }

  async listChangeLogs(filter = {}, limit = 200) {
    return NetworkChangeLogModel.find(filter)
      .populate('customer', 'name')
      .populate('branch', 'name city')
      .populate('changedBy', userSummary)
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(1000, Number(limit || 200))));
  }

  async getDashboardSummary() {
    const [
      customers,
      branches,
      devices,
      subnets,
      vlans,
      vpns,
      outdatedBranches,
      recentChanges,
    ] = await Promise.all([
      NetworkCustomerModel.countDocuments({ archivedAt: null }),
      NetworkBranchModel.countDocuments({}),
      NetworkDeviceModel.countDocuments({}),
      NetworkSubnetModel.countDocuments({}),
      NetworkVlanModel.countDocuments({}),
      NetworkVpnTunnelModel.countDocuments({}),
      NetworkBranchModel.countDocuments({ documentationStatus: 'OUTDATED' }),
      this.listChangeLogs({}, 8),
    ]);

    return {
      customers,
      branches,
      devices,
      subnets,
      vlans,
      vpns,
      outdatedBranches,
      recentChanges,
    };
  }

  async getCustomerWorkspace(customerId) {
    const customer = await this.findCustomerById(customerId);
    if (!customer) {
      return null;
    }

    const branches = await this.listBranches({ customer: customerId });
    const branchIds = branches.map((item) => item._id);
    const branchFilter = branchIds.length ? { branch: { $in: branchIds } } : { branch: null, _id: null };

    const [
      devices,
      subnets,
      ipAllocations,
      vlans,
      wanLinks,
      vpnTunnels,
      wifiProfiles,
      attachments,
      changeLogs,
    ] = await Promise.all([
      this.listDevices(branchFilter),
      this.listSubnets(branchFilter),
      this.listIpAllocations(branchFilter),
      this.listVlans(branchFilter),
      this.listWanLinks(branchFilter),
      this.listVpnTunnels(branchFilter),
      this.listWifiProfiles(branchFilter),
      this.listAttachments({ customer: customerId }),
      this.listChangeLogs({ customer: customerId }, 100),
    ]);

    return {
      customer,
      branches,
      devices,
      subnets,
      ipAllocations,
      vlans,
      wanLinks,
      vpnTunnels,
      wifiProfiles,
      attachments,
      changeLogs,
    };
  }
}
