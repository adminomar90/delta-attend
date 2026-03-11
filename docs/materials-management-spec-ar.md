# مواصفات ميزة إدارة طلب وتجهيز وصرف واستلام المواد للمشاريع

## 1) الهدف
إنشاء دورة مواد متكاملة داخل النظام الحالي تبدأ من طلب المواد وتنتهي بالتصفية والإرجاع والإغلاق، مع تتبع كامل، صلاحيات واضحة، وتصدير تقارير وإرسالها عبر واتساب.

## 2) نطاق الميزة (Modules)
1. `Material Catalog`
تعريف المواد، الوحدات، الفئات، والسيريال/الدفعات.

2. `Inventory & Stock`
أرصدة المخزن، الحركات، الحجز، الخصم، الإرجاع.

3. `Project Material Requests`
طلبات المواد للمشاريع مع البنود وحالة الطلب.

4. `Approval Engine`
اعتماد كامل/جزئي/رفض مع سجل قرار وسبب.

5. `Warehouse Preparation`
تجهيز المواد المعتمدة (كامل/جزئي/على دفعات).

6. `Dispatch & Handover`
تسليم المواد للمستلم وإنشاء سند تسليم.

7. `Electronic Custody`
إنشاء ذمة إلكترونية تلقائية ومتابعة حالتها.

8. `Reconciliation`
تصفية الكميات (مصروف/متبقي/تالف/مفقود/مرجع).

9. `Returns Intake`
استلام المواد الراجعة للمخزن وتحديث الرصيد.

10. `Reporting & Export`
تقارير احترافية مع PDF/Excel.

11. `WhatsApp Notifications`
إشعارات تشغيلية وتقارير مشاركة.

12. `Audit & Compliance`
تسجيل كامل لكل عملية قبل/بعد.

## 3) نموذج البيانات المقترح (MongoDB/Mongoose)
> ملاحظة: النظام الحالي مبني على Mongo + Mongoose، لذلك الاقتراح أدناه Collections مع `ObjectId` references.

### 3.1 جداول/Collections أساسية
1. `materials`
- `code` (unique)
- `name`
- `category`
- `unit`
- `trackSerial` (boolean)
- `trackBatch` (boolean)
- `minStock`
- `estimatedUnitCost`
- `active`

2. `warehouses`
- `name`
- `code` (unique)
- `location`
- `active`

3. `stockBalances`
- `material` -> `materials`
- `warehouse` -> `warehouses`
- `qtyOnHand`
- `qtyReserved`
- `qtyAvailable` (محسوبة أو مخزنة)
- `avgCost`
- index unique `(material, warehouse)`

4. `stockTransactions`
- `material`
- `warehouse`
- `project` (optional)
- `request` (optional)
- `transactionType` enum:
`IN`, `OUT`, `RESERVE`, `RELEASE`, `RETURN_IN`, `DAMAGE`, `LOSS`, `ADJUSTMENT`
- `quantity`
- `unitCost`
- `referenceType`
- `referenceId`
- `performedBy`
- `performedAt`
- `notes`

### 3.2 دورة الطلب والتجهيز
5. `materialRequests`
- `requestNo` (unique: `MR-YYYY-####`)
- `project` -> `Project`
- `clientName`
- `requestedBy` -> `User`
- `requestDate`
- `priority` enum: `URGENT`, `NORMAL`, `LOW`
- `status` enum:
`NEW`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `PREPARING`, `PREPARED`, `DELIVERED`, `PENDING_RECONCILIATION`, `RECONCILED`, `CLOSED`
- `generalNotes`
- `approvalSummary`
- `closedAt`

6. `materialRequestItems`
- `request` -> `materialRequests`
- `material` -> `materials`
- `categorySnapshot`
- `unitSnapshot`
- `requestedQty`
- `availableQtyAtRequest`
- `approvedQty`
- `preparedQty`
- `deliveredQty`
- `lineStatus` enum: `PENDING`, `APPROVED`, `PARTIAL`, `REJECTED`, `DELIVERED`, `CLOSED`
- `lineNotes`

7. `materialRequestApprovals`
- `request`
- `action` enum: `APPROVE_FULL`, `APPROVE_PARTIAL`, `REJECT`, `MODIFY`
- `beforeSnapshot`
- `afterSnapshot`
- `approvedBy`
- `approvedAt`
- `comment`

8. `preparationOrders`
- `prepNo` (`PO-YYYY-####`)
- `request`
- `project`
- `preparedBy`
- `recipient`
- `preparedAt`
- `status` enum: `DRAFT`, `PARTIAL`, `READY`, `CANCELLED`
- `notes`

9. `preparationItems`
- `preparationOrder`
- `requestItem`
- `material`
- `approvedQty`
- `preparedQty`
- `unavailableQty`
- `batchNo`
- `serials` (array)
- `notes`

### 3.3 التسليم والذمة
10. `dispatchNotes`
- `dispatchNo` (`DN-YYYY-####`)
- `request`
- `project`
- `recipient` -> `User`
- `deliveredBy` -> `User`
- `preparedBy` -> `User`
- `deliveredAt`
- `confirmationMethod` enum: `PIN`, `SIGNATURE`, `CHECKBOX`
- `status` enum: `ISSUED`, `CONFIRMED`, `CANCELLED`
- `notes`

11. `dispatchItems`
- `dispatchNote`
- `material`
- `deliveredQty`
- `batchNo`
- `serials`
- `conditionAtDelivery`
- `notes`

12. `custodies`
- `custodyNo` (`CU-YYYY-####`)
- `request`
- `project`
- `holder` -> `User`
- `openedAt`
- `status` enum:
`OPEN`, `PENDING_RECONCILIATION`, `PARTIALLY_RECONCILED`, `FULLY_RECONCILED`, `OVERDUE`, `CLOSED`
- `closedAt`
- `isOverdue`
- `dueDate`

13. `custodyItems`
- `custody`
- `material`
- `receivedQty`
- `consumedQty`
- `remainingQty`
- `returnedQty`
- `damagedQty`
- `lostQty`
- `lineStatus` enum: `OPEN`, `PARTIAL`, `RECONCILED`, `CLOSED`

### 3.4 التصفية والإرجاع
14. `reconciliations`
- `reconcileNo` (`RC-YYYY-####`)
- `custody`
- `project`
- `submittedBy`
- `reviewedBy`
- `submittedAt`
- `reviewedAt`
- `status` enum: `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`
- `notes`

15. `reconciliationItems`
- `reconciliation`
- `custodyItem`
- `material`
- `receivedQty`
- `consumedQty`
- `remainingQty`
- `damagedQty`
- `lostQty`
- `toReturnQty`
- `notes`

16. `returnReceipts`
- `returnNo` (`RT-YYYY-####`)
- `reconciliation`
- `project`
- `returnedBy`
- `receivedByStorekeeper`
- `receivedAt`
- `status` enum: `DRAFT`, `RECEIVED`, `REJECTED`
- `notes`

17. `returnItems`
- `returnReceipt`
- `material`
- `returnedQty`
- `itemCondition` enum: `NEW`, `PARTIAL_USED`, `DAMAGED`, `UNUSABLE`
- `notes`

## 4) Workflow كامل (State Machine)
1. `Material Request`
`NEW -> UNDER_REVIEW -> APPROVED/REJECTED -> PREPARING -> PREPARED -> DELIVERED -> PENDING_RECONCILIATION -> RECONCILED -> CLOSED`

2. `Approval`
- اعتماد كامل: كل البنود approvedQty = requestedQty.
- اعتماد جزئي: بعض البنود أو كميات أقل.
- رفض: إغلاق الطلب مع سبب.

3. `Preparation`
- تجهيز كامل أو جزئي.
- كل تجهيز ينشئ حركة مخزن (`RESERVE` ثم `OUT` حسب السياسة).

4. `Dispatch`
- التسليم ينشئ سند.
- عند التأكيد يتم إنشاء `Custody` تلقائيًا.

5. `Custody Reconciliation`
- المستلم يدخل المصروف/المتبقي/التالف/المفقود/المرجع.
- لا إغلاق إلا بعد معالجة كل البنود.

6. `Return Intake`
- موظف المخزن يؤكد الاستلام.
- تحديث `stockBalances` + `stockTransactions`.
- تحديث الذمة حتى الإغلاق.

## 5) قواعد العمل الأساسية
1. لا تسليم بدون طلب معتمد.
2. كل كمية مسلمة = ذمة على المستلم.
3. لا إغلاق ذمة إلا بعد تصفية كل البنود.
4. المصروف فقط يُحمّل على المشروع.
5. أي فرق يظهر في تقارير الفروقات.
6. منع تعديل السجلات بعد الإغلاق إلا بصلاحية override.
7. كل انتقال حالة يسجل Audit Log.
8. دعم تجهيز وتسليم على دفعات لنفس الطلب.

## 6) الصلاحيات المقترحة
1. صلاحيات جديدة (Permission constants)
- `MANAGE_MATERIALS`
- `CREATE_MATERIAL_REQUESTS`
- `REVIEW_MATERIAL_REQUESTS`
- `APPROVE_MATERIAL_REQUESTS`
- `PREPARE_MATERIALS`
- `DELIVER_MATERIALS`
- `RECEIVE_RETURNS`
- `RECONCILE_CUSTODY`
- `CLOSE_CUSTODY`
- `VIEW_MATERIAL_REPORTS`
- `ADJUST_STOCK`
- `OVERRIDE_CLOSED_MATERIAL_TX`

2. ربط الأدوار
- المدير: جميع الصلاحيات + إغلاق الذمم.
- موظف المخزن: تجهيز/تسليم/استلام راجع/تقارير المخزن.
- الفني/الموظف: إنشاء طلب، استلام، تصفية، إرجاع، عرض ذمته.
- المحاسب/الإدارة: التقارير، متابعة الذمم والفروقات.

## 7) API Endpoints المقترحة
1. `Materials`
- `GET /api/materials`
- `POST /api/materials`
- `PATCH /api/materials/:id`

2. `Stock`
- `GET /api/stock/balances`
- `GET /api/stock/transactions`
- `POST /api/stock/adjustments`

3. `Requests`
- `GET /api/material-requests`
- `POST /api/material-requests`
- `GET /api/material-requests/:id`
- `PATCH /api/material-requests/:id/status`
- `PATCH /api/material-requests/:id/approve`
- `PATCH /api/material-requests/:id/reject`

4. `Preparation`
- `POST /api/material-requests/:id/preparation-orders`
- `PATCH /api/preparation-orders/:id/items`
- `PATCH /api/preparation-orders/:id/complete`

5. `Dispatch`
- `POST /api/preparation-orders/:id/dispatch`
- `PATCH /api/dispatch-notes/:id/confirm`

6. `Custody/Reconciliation`
- `GET /api/custodies`
- `GET /api/custodies/:id`
- `POST /api/custodies/:id/reconciliations`
- `PATCH /api/reconciliations/:id/review`
- `PATCH /api/custodies/:id/close`

7. `Returns`
- `POST /api/reconciliations/:id/returns`
- `PATCH /api/return-receipts/:id/receive`

8. `Reports`
- `GET /api/material-reports/requests`
- `GET /api/material-reports/preparation-delivery`
- `GET /api/material-reports/open-custodies`
- `GET /api/material-reports/reconciliation`
- `GET /api/material-reports/material-movement`
- `GET /api/material-reports/project-summary`
- `GET /api/material-reports/:type/pdf`
- `GET /api/material-reports/:type/excel`

## 8) واجهات UI المطلوبة
1. شاشة `طلبات المواد`
- إنشاء طلب + بنود + حالة + تتبع.

2. شاشة `مراجعة واعتماد`
- إنبوكس للطلبات بانتظار القرار.

3. شاشة `تجهيز المخزن`
- تجهيز البنود المعتمدة + دفعات/سيريال.

4. شاشة `التسليم`
- إصدار سند تسليم + تأكيد استلام.

5. شاشة `الذمم`
- عرض الذمم المفتوحة/المتأخرة.

6. شاشة `تصفية الذمة`
- إدخال المصروف/المتبقي/التالف/المفقود/المرجع.

7. شاشة `استلام المواد الراجعة`
- استقبال الراجع وتحديث المخزون.

8. شاشة `تقارير المواد`
- فلاتر متقدمة + PDF/Excel + طباعة.

## 9) WhatsApp (إشعارات + تقارير)
1. أحداث الإشعار
- طلب جديد.
- اعتماد/رفض.
- بدء تجهيز.
- تم التسليم.
- ذمة مفتوحة متأخرة.
- استلام مواد راجعة.
- اكتمال التصفية.

2. قالب رسالة مختصر
- `رقم الطلب/السند`
- `اسم المشروع`
- `المستلم/المنفذ`
- `الكميات`
- `الحالة`
- `رابط التفاصيل`

3. إرسال التقارير
- سند التسليم PDF
- تقرير ذمة موظف PDF
- تقرير تصفية PDF
- تقرير إرجاع PDF
- تقرير حركة مشروع PDF/Excel

## 10) Audit Log (إلزامي)
لكل عملية:
- `actorId`
- `action`
- `entityType`
- `entityId`
- `before`
- `after`
- `ipAddress`
- `userAgent`
- `timestamp`

## 11) الفهرسة والأداء
1. Indexes إلزامية
- `materialRequests.status + requestDate`
- `materialRequestItems.request + material`
- `stockBalances.material + warehouse` (unique)
- `stockTransactions.material + warehouse + performedAt`
- `custodies.status + holder + project`
- `reconciliations.status + submittedAt`

2. حماية التزامن
- استخدام `version` أو optimistic locking في أوامر التجهيز/التسليم.

3. Outbox/Queue
- إشعارات واتساب والتقارير الثقيلة عبر Queue (لاحقًا).

## 12) خطة تنفيذ مرحلية
1. `Phase 1 (Core)`
- Materials + Stock + Material Requests + Approval.

2. `Phase 2 (Warehouse Ops)`
- Preparation + Dispatch + Custody creation.

3. `Phase 3 (Reconciliation & Returns)`
- Reconciliation + Returns + Custody close rules.

4. `Phase 4 (Reports & WhatsApp)`
- جميع التقارير PDF/Excel + إشعارات/إرسال واتساب.

5. `Phase 5 (Hardening)`
- صلاحيات دقيقة، مؤشرات أداء، منع التلاعب بعد الإغلاق.

## 13) مخرجات متوقعة
1. دورة مواد كاملة قابلة للتتبع.
2. تقارير تشغيلية ومحاسبية دقيقة.
3. ذمم واضحة ومغلقة وفق قواعد العمل.
4. تكامل واتساب جاهز للإشعارات والتقارير.
5. أساس قابل للتوسع دون إعادة بناء.
