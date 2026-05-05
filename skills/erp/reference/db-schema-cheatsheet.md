# ERP DB Schema Cheatsheet

> 來源：`ErpUAT_local.public`
> 更新日期：2026-05-04

## 1. 最重要的查詢鐵則

1. 表名要用雙引號 + 全大寫
2. 優先用 `READ_ONLY`
3. 預設 `LIMIT 100`
4. 預設排除 `cancelled_at IS NULL`
5. 先 summary、後 drill-down

---

## 2. 核心主檔

### 客戶 / 供應商 / 品項

- `B_CUSTOMER`
- `B_VENDOR`
- `B_ITEM`
- `B_COMPANY`
- `B_SITE`
- `B_USER`

### 基本欄位

- customer: `customer_id`, `customer_name`
- vendor: `vendor_id`, `vendor_name`
- item: `item_id`, `item_name`
- company/site: `company_id`, `site_id`

---

## 3. 交易主檔 / 明細

### 銷售

- `SO`
- `SO_LINE`
- `DO`
- `DO_LINE`
- `PICK`

### 採購

- `PR`
- `PR_LINE`
- `PO`
- `PO_LINE`
- `GR`
- `GR_LINE`

### 庫存

- `INVENTORY`
- `INV_TRANS`
- `INV_IN`
- `INV_OUT`
- `TFR`
- `CNT`
- `ADJ`

### 生產

- `WO`
- BOM 相關表

---

## 4. 常見關聯

### 銷售單主檔 ↔ 明細

```sql
JOIN erp.public."SO_LINE" l
USING (company_id, site_id, so_id)
```

### 訂單 ↔ 客戶

```sql
JOIN erp.public."B_CUSTOMER" c
  ON c.customer_id = s.customer_id
```

### 訂單明細 ↔ 品項

```sql
JOIN erp.public."B_ITEM" i
  ON i.item_id = l.item_id
```

---

## 5. 常見查詢起手式

### 探查表欄位

```sql
SELECT column_name, data_type, is_nullable
FROM erp.information_schema.columns
WHERE table_schema = 'public' AND table_name = 'SO'
ORDER BY ordinal_position;
```

### 取樣資料

```sql
SELECT * FROM erp.public."SO" LIMIT 5;
```

### 排除作廢單

```sql
WHERE cancelled_at IS NULL
```
