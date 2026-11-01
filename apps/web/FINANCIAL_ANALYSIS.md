# Financial analysis

- Entry: **الصرف المالي → التحليل المالي**, `/financial-disbursements/analysis`.
- Permission: `VIEW_FINANCIAL_ANALYSIS`, shown under the employee editor's **المالية والصرف** group. General managers inherit it; other employees receive it explicitly.
- The API enforces this permission separately from `VIEW_FINANCIAL_REPORTS`.
- Data scope follows existing financial access: general/financial managers and users with `VIEW_ALL_FINANCIAL_DISBURSEMENTS` can analyze all records; everyone else sees their own requests and requests assigned to them for review. Filters never expand this scope.

## Calculation rules

- Uses financial disbursement records, including archived records by default. The initial period is the current calendar year through today in `Asia/Baghdad`.
- Each line's `amount` or `approvedAmount` contributes once. Repeated `transactionTotalAmount` values are never summed.
- Requested basis includes every matching line. Approved basis uses financially approved, general-manager approved, ready and paid states. Paid basis includes `DISBURSED`, `PENDING_RECEIPT_CONFIRMATION`, `RECEIVED`, `CLOSED`.
- A zero approved amount stays zero. Requested, rejected and draft records do not become actual paid spending.
- Currency is mandatory; currencies are never combined or converted.
- Internal arithmetic uses integer cents. A transaction count groups by transaction number, falling back to request number / record ID.
- Average transaction amount divides the selected basis total by the count of all matching transactions, including matching zero-value states.
- Date filtering uses transaction date, falling back to creation date, with inclusive Baghdad calendar days. The previous-period comparison uses the same filters and an immediately preceding equal-length period.
- Invoice support analyzes attachment presence, file names and expense metadata. It does not perform OCR or verify invoice contents. Repeated attachment URLs within one transaction are deduplicated and shared among its lines.
- Summaries, rankings and trend cover **all** matching accessible records; detail pagination returns 20 lines per page. There is no silent 500-row reporting cap.
- Analysis responses use `Cache-Control: no-store`. No records are changed and no database migration is required.

## Views and filtering

Filters: period, currency, amount basis, project, employee, expense type, workflow status, archive, attachments, amount range and text search. Ranking charts filter interactively by category, project, employee or status. Distribution supports bars/donut, time trend supports line/columns and day/month intervals, details support table/cards, sorting, pagination and a dialog for recorded amounts and attachments.

## Validation

`node --test tests/financialAnalysis.test.js` checks aggregation, currencies, Arabic search, attachments, rounding, dates, comparisons and pagination. Set `RUN_FINANCIAL_ANALYSIS_DB_TESTS=1` to run `tests/financialAnalysis.integration.test.js` against a randomly named isolated local MongoDB database; the fixture is removed afterward.
