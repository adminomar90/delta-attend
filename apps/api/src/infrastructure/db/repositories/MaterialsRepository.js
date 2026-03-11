import { MaterialModel } from '../models/MaterialModel.js';
import { WarehouseModel } from '../models/WarehouseModel.js';
import { StockBalanceModel } from '../models/StockBalanceModel.js';
import { StockTransactionModel } from '../models/StockTransactionModel.js';
import { MaterialRequestModel } from '../models/MaterialRequestModel.js';
import { MaterialDispatchModel } from '../models/MaterialDispatchModel.js';
import { MaterialCustodyModel } from '../models/MaterialCustodyModel.js';
import { MaterialReconciliationModel } from '../models/MaterialReconciliationModel.js';
import { MaterialReturnReceiptModel } from '../models/MaterialReturnReceiptModel.js';

const materialPopulate = [
  { path: 'createdBy', select: 'fullName role employeeCode' },
];

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const requestPopulate = [
  { path: 'project', select: 'name code status owner' },
  { path: 'requestedBy', select: 'fullName role employeeCode phone manager' },
  { path: 'requestedFor', select: 'fullName role employeeCode phone' },
  { path: 'assignedPreparer', select: 'fullName role employeeCode phone' },
  { path: 'items.material', select: 'code name category unit active' },
  { path: 'approvals.approvedBy', select: 'fullName role employeeCode' },
  { path: 'preparations.preparedBy', select: 'fullName role employeeCode' },
  { path: 'preparations.warehouse', select: 'name code' },
  { path: 'approvalSummary.approvedBy', select: 'fullName role employeeCode' },
  { path: 'dispatchRef', select: 'dispatchNo status recipient deliveredAt' },
  { path: 'custodyRef', select: 'custodyNo status holder openedAt closedAt' },
  { path: 'reconciliationRef', select: 'reconcileNo status submittedAt reviewedAt' },
];

const dispatchPopulate = [
  { path: 'request', select: 'requestNo status project requestedBy requestedFor' },
  { path: 'project', select: 'name code' },
  { path: 'recipient', select: 'fullName role employeeCode phone' },
  { path: 'deliveredBy', select: 'fullName role employeeCode' },
  { path: 'preparedBy', select: 'fullName role employeeCode' },
  { path: 'warehouse', select: 'name code' },
  { path: 'items.material', select: 'code name category unit' },
];

const custodyPopulate = [
  { path: 'request', select: 'requestNo status project requestedBy requestedFor assignedPreparer' },
  { path: 'project', select: 'name code' },
  { path: 'holder', select: 'fullName role employeeCode phone manager' },
  { path: 'dispatchNotes', select: 'dispatchNo status deliveredAt recipient' },
  { path: 'items.material', select: 'code name category unit' },
];

const reconciliationPopulate = [
  { path: 'custody', select: 'custodyNo status holder request project' },
  { path: 'request', select: 'requestNo status requestedBy requestedFor project assignedPreparer' },
  { path: 'project', select: 'name code' },
  { path: 'submittedBy', select: 'fullName role employeeCode phone' },
  { path: 'reviewedBy', select: 'fullName role employeeCode' },
  { path: 'items.material', select: 'code name category unit' },
  { path: 'returnReceiptRef', select: 'returnNo status receivedAt' },
];

const returnReceiptPopulate = [
  { path: 'reconciliation', select: 'reconcileNo status custody request' },
  { path: 'custody', select: 'custodyNo status holder' },
  { path: 'request', select: 'requestNo status project' },
  { path: 'project', select: 'name code' },
  { path: 'returnedBy', select: 'fullName role employeeCode phone' },
  { path: 'receivedByStorekeeper', select: 'fullName role employeeCode' },
  { path: 'items.material', select: 'code name category unit' },
];

export class MaterialsRepository {
  async createMaterial(payload) {
    return MaterialModel.create(payload);
  }

  async listMaterials(filter = {}) {
    return MaterialModel.find(filter)
      .populate(materialPopulate)
      .sort({ createdAt: -1 });
  }

  async findMaterialById(id) {
    return MaterialModel.findById(id)
      .populate(materialPopulate);
  }

  async findMaterialByCode(code) {
    return MaterialModel.findOne({ code: String(code || '').trim().toUpperCase() })
      .populate(materialPopulate);
  }

  async findMaterialByName(name) {
    const safeName = String(name || '').trim();
    if (!safeName) {
      return null;
    }

    return MaterialModel.findOne({
      name: { $regex: `^${escapeRegex(safeName)}$`, $options: 'i' },
    }).populate(materialPopulate);
  }

  async updateMaterialById(id, payload) {
    return MaterialModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(materialPopulate);
  }

  async createWarehouse(payload) {
    return WarehouseModel.create(payload);
  }

  async listWarehouses(filter = {}) {
    return WarehouseModel.find(filter).sort({ createdAt: -1 });
  }

  async findWarehouseById(id) {
    return WarehouseModel.findById(id);
  }

  async updateWarehouseById(id, payload) {
    return WarehouseModel.findByIdAndUpdate(id, payload, { new: true });
  }

  async listStockBalances(filter = {}) {
    return StockBalanceModel.find(filter)
      .populate('material', 'code name category unit active minStock estimatedUnitCost')
      .populate('warehouse', 'name code location active')
      .sort({ updatedAt: -1 });
  }

  async findStockBalance(materialId, warehouseId) {
    return StockBalanceModel.findOne({ material: materialId, warehouse: warehouseId })
      .populate('material', 'code name category unit active minStock estimatedUnitCost')
      .populate('warehouse', 'name code location active');
  }

  async upsertStockBalance(materialId, warehouseId, payload = {}) {
    return StockBalanceModel.findOneAndUpdate(
      {
        material: materialId,
        warehouse: warehouseId,
      },
      {
        $setOnInsert: {
          material: materialId,
          warehouse: warehouseId,
          qtyOnHand: 0,
          qtyReserved: 0,
          avgCost: 0,
        },
        ...payload,
      },
      {
        new: true,
        upsert: true,
      },
    )
      .populate('material', 'code name category unit active minStock estimatedUnitCost')
      .populate('warehouse', 'name code location active');
  }

  async createStockTransaction(payload) {
    return StockTransactionModel.create(payload);
  }

  async listStockTransactions(filter = {}, options = {}) {
    const query = StockTransactionModel.find(filter)
      .populate('material', 'code name category unit')
      .populate('warehouse', 'name code')
      .populate('project', 'name code')
      .populate('request', 'requestNo status')
      .populate('performedBy', 'fullName role employeeCode')
      .sort(options.sort || { performedAt: -1, createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async createRequest(payload) {
    return MaterialRequestModel.create(payload);
  }

  async listRequests(filter = {}, options = {}) {
    const query = MaterialRequestModel.find(filter)
      .populate(requestPopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async findRequestById(id) {
    return MaterialRequestModel.findById(id)
      .populate(requestPopulate);
  }

  async updateRequestById(id, payload) {
    return MaterialRequestModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(requestPopulate);
  }

  async createDispatch(payload) {
    return MaterialDispatchModel.create(payload);
  }

  async listDispatches(filter = {}, options = {}) {
    const query = MaterialDispatchModel.find(filter)
      .populate(dispatchPopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async findDispatchById(id) {
    return MaterialDispatchModel.findById(id)
      .populate(dispatchPopulate);
  }

  async createCustody(payload) {
    return MaterialCustodyModel.create(payload);
  }

  async listCustodies(filter = {}, options = {}) {
    const query = MaterialCustodyModel.find(filter)
      .populate(custodyPopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async findCustodyById(id) {
    return MaterialCustodyModel.findById(id)
      .populate(custodyPopulate);
  }

  async updateCustodyById(id, payload) {
    return MaterialCustodyModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(custodyPopulate);
  }

  async createReconciliation(payload) {
    return MaterialReconciliationModel.create(payload);
  }

  async listReconciliations(filter = {}, options = {}) {
    const query = MaterialReconciliationModel.find(filter)
      .populate(reconciliationPopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async findReconciliationById(id) {
    return MaterialReconciliationModel.findById(id)
      .populate(reconciliationPopulate);
  }

  async updateReconciliationById(id, payload) {
    return MaterialReconciliationModel.findByIdAndUpdate(id, payload, { new: true })
      .populate(reconciliationPopulate);
  }

  async createReturnReceipt(payload) {
    return MaterialReturnReceiptModel.create(payload);
  }

  async listReturnReceipts(filter = {}, options = {}) {
    const query = MaterialReturnReceiptModel.find(filter)
      .populate(returnReceiptPopulate)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) {
      query.limit(options.limit);
    }

    return query;
  }

  async findReturnReceiptById(id) {
    return MaterialReturnReceiptModel.findById(id)
      .populate(returnReceiptPopulate);
  }
}
