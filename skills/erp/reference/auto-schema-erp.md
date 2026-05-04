# ERP Auto-Schema Reference

> 來源：`118.168.188.27:5433/ErpUAT_local`，schema = `public`
> 產生日期：2026-04-27
> 涵蓋核心 30 表（共 108 表，其餘表用 `information_schema.columns` 動態探查）

## 連線複製貼上

```sql
INSTALL postgres_scanner;
LOAD postgres_scanner;
ATTACH 'host=118.168.188.27 port=5433 dbname=ErpUAT_local user=erp_local password=erp_local' AS erp (TYPE postgres, READ_ONLY);
```

---

## 1. 基礎主檔

### `B_COMPANY`（公司主檔）— 1 筆
```
PK: company_id (varchar 10)
company_name, short_name, tax_no, currency_id, contact_person,
company_zip_code, company_addr, invoice_zip_code, invoice_addr, phone
```

### `B_SITE`（廠別主檔）
```
PK: (company_id, site_id)
site_name, site_type, addr, phone, zip_code
```

### `B_CUSTOMER`（客戶主檔）— 11 筆
```
PK: customer_id (varchar 10)
customer_name, customer_name_en, short_name,
customer_type, currency_id, pay_term_id, pay_method_id, tax_id,
tax_no (統編), zip_code, city, dist, addr,
contact, phone, fax, email, credit_limit,
created_at, created_by, updated_at, updated_by, cancelled_at
```

### `B_VENDOR`（供應商主檔）— 5 筆
```
PK: vendor_id (varchar 10)
vendor_name, short_name, tax_no, currency_id, pay_term_id,
contact, phone, email, addr,
created_at, cancelled_at
```

### `B_ITEM`（品項主檔）— 64 筆
```
PK: item_id (varchar 40)
item_name, short_name, type, unit_id, unit_wt,
spec1..spec5, abc_class (A/B/C),
safety_stock, shelf_life_days, short_exp_days, exp_warning_days,
lot_ctrl, serial_ctrl, exp_ctrl, qc_ctrl (bit),
created_at, cancelled_at
```

### `B_DEPT`（部門主檔）
```
PK: (company_id, dept_id)
dept_name, parent_dept_id
```

### `B_USER`（使用者主檔）— 5 筆
```
PK: user_id
user_name, email, dept_id, role, status
```

---

## 2. 銷售流程

### `QUOTE`（報價單）
```
PK: quote_id (varchar 20)
quote_no, quote_date, valid_date, customer_id, customer_name,
contact_person, contact_tel, contact_email,
currency_id, exchange_rate, tax_id, tax_type,
pay_term_id, pay_method_id, delivery_term, delivery_date,
created_at, created_by
```

### `QUOTE_LINE`（報價明細）
```
PK: (quote_id, line_no)
item_id, qty, unit_price, line_amt, ...
```

### `SO`（銷售訂單）— 11 筆
```
PK: (company_id, site_id, so_id)
dept_id, customer_id, currency_id, pay_term_id, pay_method_id, tax_id,
quote_id (FK QUOTE),
so_type, so_date, delivery_date,
ship_to_zip, ship_to_city, ship_to_dist, ship_to_addr,
ship_to_contact, ship_to_phone,
exchange_rate, subtotal_amt, discount_rate, discount_amt,
freight_amt, other_amt, tax_rate, tax_amt, total_amt, deposit_amt,
order_status (default '10'),
picking_status (default '10'),
shipping_status (default '10'),
invoice_status (default '10'),
approved_date, memo, extdata,
created_at, created_by, updated_at, cancelled_at, cancelled_by,
closed_at, closed_by, cust_order_id, ext_doc_id
```

### `SO_LINE`（銷售訂單明細）
```
PK: (company_id, site_id, so_id, line_no)
item_id, unit_id, quote_line_no, stk_status_code,
item_desc, qty, unit_price, discount_rate, line_amt,
tax_rate, tax_amt, total_amt,
picked_qty, shipped_qty, returned_qty,
delivery_date, lot_no, trn_wo (boolean),
memo, extdata
FK: item_id → B_ITEM, so_id → SO
```

### `DO`（出貨單）
```
PK: (company_id, site_id, do_id)
so_id (FK SO), pick_id (FK PICK),
customer_id, do_type, do_date,
ship_to_*（同 SO），
shipping_date, ship_method, distance, ship_mode, fuel_type,
tracking_no, freight_amt, insurance_amt, other_amt, total_amt,
shipping_status (default 'PENDING'),
created_at, cancelled_at
```

### `DO_LINE`（出貨明細）
```
PK: (company_id, site_id, do_id, line_no)
so_id, so_line_no (FK SO_LINE), item_id, unit_id,
stk_status_code, item_desc,
order_qty, ship_qty, unit_price, line_amt,
lot_no, expiry_date,
pick_id, pick_line_no, memo, extdata (jsonb)
```

### `PICK`（揀貨單）/ `PICK_LINE`
```
與 DO 對應，記錄揀貨過程
```

---

## 3. 採購流程

### `PR`（請購單）/ `PR_LINE`
```
PK: (company_id, site_id, pr_id)
dept_id, applicant, request_date, status, ...
```

### `PO`（採購單）— 10 筆
```
PK: (company_id, site_id, po_id)
vendor_id (FK B_VENDOR), po_date, expected_date,
total_amt, order_status, receive_status, ...
```

### `PO_LINE`（採購明細）
```
PK: (company_id, site_id, po_id, line_no)
item_id, qty, unit_price, line_amt, received_qty, ...
```

### `GR`（進貨單）/ `GR_LINE`
```
記錄供應商交貨入庫
```

### `PO_RTN`（退購單）/ `PO_RTN_LINE`
```
退回給供應商
```

---

## 4. 庫存

### `INVENTORY`（庫存即時表）— 49 筆
```
PK: (company_id, site_id, inv_id)
item_id (FK B_ITEM), lot_no (default ''),
stk_status_code,
mfg_date, expiry_date, receive_date,
on_hand_qty, available_qty, reserved_qty,
allocated_qty, in_transit_qty, in_inspect_qty,
avg_cost, last_cost, std_cost,
last_in_time, last_out_time, last_count_time, last_doc_type
```

### `INV_TRANS`（庫存異動明細）
```
所有庫存變動的歷史，配合 INV_TRANS_ARCHIVE
trans_type, trans_date, qty_in, qty_out, doc_type, doc_id, ...
```

### `INV_IN` / `INV_IN_LINE`（一般入庫）
### `INV_OUT` / `INV_OUT_LINE`（一般出庫）
### `TFR` / `TFR_LINE`（廠間/倉間調撥）
### `CNT` / `CNT_LINE`（盤點單）
### `ADJ` / `ADJ_LINE`（庫存調整）

---

## 5. 生產（含 MES 雛型）

### `WO`（工單）— 48 筆
```
PK: (company_id, site_id, wo_id)
so_id (對應銷售訂單), so_line_no,
item_id (生產的成品),
plan_qty, finished_qty, scrapped_qty,
plan_start_date, plan_end_date, actual_start, actual_end,
status, ...
```

### `WO_LINE`（工單需料明細）
```
PK: (company_id, site_id, wo_id, line_no)
item_id, required_qty, issued_qty, ...
（從 BOM 展開的需料清單）
```

### `WO_PROCESS`（工序）
```
PK: (company_id, site_id, wo_id, process_seq)
process_id (FK B_PROCESS), machine_id, operator,
plan_qty, qc_qty, scrap_qty, ...
```

### `WO_PROCESS_REPORT`（報工紀錄）
```
記錄每次工序的實際完成數量、時間、人員
```

### `B_BOM` / `B_BOM_LINE` / `B_BOM_PROCESS`
```
產品結構與標準工序
```

### `B_PROCESS`（製程主檔）
```
PK: process_id
process_name, standard_time, ...
```

---

## 6. 領退料 / 成品入庫

### `ISSUE` / `ISSUE_LINE`（領料單）
### `ISSUE_REVERSE` / `ISSUE_REVERSE_LINE`（退料）
### `SR` / `SR_LINE`（成品入庫單）

---

## 7. 服務

### `SV_TICKET`（服務工單）
```
ticket_no, customer_id, item_id (對應產品),
issue_desc, status, priority,
opened_at, closed_at
```

### `SV_TICKET_PART`（服務用料）
### `SV_TICKET_WORKLOG`（服務工時）
### `SV_TICKET_IMAGE`（現場照片）

---

## 8. 財務

### `B_DOC`（傳票主檔）
### `B_DOC_INV`（發票對應）
### `INV_COST_TRANS`（成本異動）

---

## 9. 字典與設定

### `B_EXT_DICT`（自訂字典 — 重要！）
```
所有 *_status 欄位的中文標籤都在這裡
查詢方式：
SELECT dict_code, dict_value, dict_label
FROM erp.public."B_EXT_DICT"
WHERE dict_code = 'SO_ORDER_STATUS';
```

### `B_EXT_CONFIG`（系統設定）
### `B_PAY_METHOD`（付款方式）
### `B_PAY_TERM`（付款條件）
### `B_TAX`（稅種）
### `B_UNIT`（單位）
### `B_CURRENCY`（幣別）
### `B_STK_STATUS`（庫存狀態）
### `B_ZIP`（郵遞區號）

---

## 10. 視圖（Views）

| View | 用途 |
|------|------|
| `V_BOM_STRUCTURE` | BOM 階層展開 |
| `V_B_STK_STATUS` | 庫存狀態彙總 |
| `V_USER_FULL_PERMISSIONS` | 使用者權限 |
| `v_inventory_alert` | 庫存警示 |

---

## 11. 動態探查未列出的表

若使用者問題涉及上面沒列的表，動態查 `information_schema`：

```sql
-- 列所有表
SELECT table_name FROM erp.information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 看某表欄位
SELECT column_name, data_type, is_nullable
FROM erp.information_schema.columns
WHERE table_schema = 'public' AND table_name = '<TABLE>'
ORDER BY ordinal_position;

-- 看 FK 關係
SELECT
  tc.table_name, kcu.column_name,
  ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM erp.information_schema.table_constraints tc
JOIN erp.information_schema.key_column_usage kcu USING (constraint_name)
JOIN erp.information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '<TABLE>';
```

---

## 12. 已知陷阱

1. **`SO.so_id` 是 varchar(20)，但有些表用 varchar(5)/varchar(10) for company_id**
   - `SO.company_id` 是 varchar(10)
   - `SO_LINE.company_id` 是 varchar(5) ← 不一致！
   - JOIN 時 DuckDB 會自動轉型，但要注意 padding

2. **`extdata` 欄位**
   - `SO`, `SO_LINE`, `B_CUSTOMER` 等是 `text`
   - `DO_LINE` 是 `jsonb`
   - 不要假設一致

3. **欄位 `lot_no` 預設 `''`（空字串）不是 NULL**
   - 查詢時用 `WHERE lot_no <> ''` 排除空批號

4. **`bit(1)` 欄位**
   - `B_ITEM.lot_ctrl`, `serial_ctrl`, `exp_ctrl`, `qc_ctrl` 是 `bit(1)` 不是 `boolean`
   - 比較用 `WHERE lot_ctrl = B'1'`

5. **狀態碼大多是 varchar**
   - `'10'`、`'20'`、`'PENDING'`、`'SHIPPED'` 都有，需查 `B_EXT_DICT` 確認
