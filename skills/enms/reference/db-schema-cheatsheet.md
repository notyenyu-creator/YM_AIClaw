# EnMS DB Schema Cheatsheet

## 1. 連線原則

- 只連 `.27`
- `DuckDB :memory:` + `READ_ONLY`
- 先 PostgreSQL / TimescaleDB，後 Mongo

## 2. 主 join keys

### Raw ↔ Meter

```sql
e."DeviceAddress" = r.mac
AND COALESCE(e."CircuitSeq", '1') = COALESCE(r.circuit_seq::text, '1')
```

### Meter ↔ Power Account

```sql
e."PowerAccountId" = p."AccountId"
```

### Gateway ↔ Site

```sql
g."MacAddress" = <gateway_mac>
g."SiteId" = s."SiteId"
```

### Site ↔ Company

```sql
s."CompanyNo" = c."CompanyNo"
```

## 3. 最小驗證 SQL

### 確認版本

```sql
SELECT version();
```

### 列出主要表

```sql
SELECT table_schema, table_name
FROM enms.information_schema.tables
WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
ORDER BY table_schema, table_name;
```

### Timescale metadata

```sql
SELECT * FROM enms.timescaledb_information.hypertables;
SELECT * FROM enms.timescaledb_information.continuous_aggregates;
```

### Summary view

```sql
SELECT *
FROM enms.public."DeviceDataSummaryView"
ORDER BY "RecordTime" DESC
LIMIT 20;
```

### Raw + meter alias

```sql
SELECT
  r.timestamp,
  r.mac,
  r.circuit_seq,
  r.ps,
  r.eps,
  r.pfs,
  e."DeviceAlias",
  e."MeterRole",
  e."PowerAccountId"
FROM enms.public.mqtt_raw_data r
LEFT JOIN enms.public."ElectricityMeter" e
  ON e."DeviceAddress" = r.mac
 AND COALESCE(e."CircuitSeq", '1') = COALESCE(r.circuit_seq::text, '1')
ORDER BY r.timestamp DESC
LIMIT 100;
```

## 4. 不要犯的錯

1. 不要只看 `mqtt_raw_messages.payload`
2. 不要不 join 主資料就回答
3. 不要只掃 FK 就以為理解完整 schema
4. 不要把 `.29` 當資料源
5. 不要先用 Mongo 當主分析庫
