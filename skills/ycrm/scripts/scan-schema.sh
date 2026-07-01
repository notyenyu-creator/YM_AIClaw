#!/bin/bash
# Y-CRM Schema 自動掃描腳本
# 掃描指定工作區的所有表、欄位、外鍵關聯、enum 值
# 產出完整的 schema reference，供 AI 直接使用
#
# 用法：
#   bash scan-schema.sh [schema_name]
#   bash scan-schema.sh                          # 預設掃 Y-CRM 工作區
#   bash scan-schema.sh workspace_407lopjyyvm7bxeutk1tvqkpo  # 掃指定工作區

set -euo pipefail

ALIAS="ycrm"
SCHEMA="${1:-workspace_3joxkr9ofo5hlxjan164egffx}"
YCRM_CONN="${YCRM_PG_CONNECTION:-${Y_CRM_PG_CONNECTION:-${OPENCLAW_YCRM_PG_CONNECTION:-${YCRM_POSTGRES_CONNECTION:-}}}}"

if [ -z "$YCRM_CONN" ]; then
  echo "ERROR: missing Y-CRM DB connection. Set YCRM_PG_CONNECTION before scanning schema." >&2
  exit 1
fi
YCRM_CONN_SQL="${YCRM_CONN//\'/\'\'}"

OUTPUT_DIR="$(dirname "$0")/../reference"
OUTPUT_FILE="$OUTPUT_DIR/auto-schema-${SCHEMA}.md"

run_duckdb() {
  local query="$1"
  {
    printf "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH '%s' AS %s (TYPE postgres_scanner, READ_ONLY);\n" "$YCRM_CONN_SQL" "$ALIAS"
    printf "%s\n" "$query"
  } | env \
    -u YCRM_PG_CONNECTION \
    -u Y_CRM_PG_CONNECTION \
    -u OPENCLAW_YCRM_PG_CONNECTION \
    -u YCRM_POSTGRES_CONNECTION \
    duckdb -json :memory:
}

echo "🔍 掃描 schema: $SCHEMA ..."

# ── 1. 列出所有表 ──
echo "  📋 掃描表..."
TABLES_JSON=$(run_duckdb "SELECT table_name FROM $ALIAS.information_schema.tables WHERE table_schema = '$SCHEMA' AND table_name NOT LIKE '\_%' ESCAPE '\\' ORDER BY table_name;" 2>/dev/null)

CUSTOM_TABLES_JSON=$(run_duckdb "SELECT table_name FROM $ALIAS.information_schema.tables WHERE table_schema = '$SCHEMA' AND table_name LIKE '\_%' ESCAPE '\\' ORDER BY table_name;" 2>/dev/null)

# ── 2. 對每張表掃描欄位 ──
echo "  📊 掃描欄位與關聯..."

{
cat <<'HEADER'
# 自動產生的 Schema Reference

> **此檔案由 `scan-schema.sh` 自動產生，請勿手動編輯。**
> 重新掃描：`bash scripts/scan-schema.sh`

HEADER

echo "## 掃描資訊"
echo ""
echo "- Schema: \`$SCHEMA\`"
echo "- 掃描時間: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "---"
echo ""

# ── 標準表 ──
echo "## 標準表"
echo ""

TABLES=$(echo "$TABLES_JSON" | python3 -c "import sys,json; [print(r['table_name']) for r in json.load(sys.stdin)]" 2>/dev/null || true)

for TABLE in $TABLES; do
  echo "### $TABLE"
  echo ""

  # 取得欄位
  COLS_JSON=$(run_duckdb "SELECT column_name, data_type, is_nullable FROM $ALIAS.information_schema.columns WHERE table_schema = '$SCHEMA' AND table_name = '$TABLE' ORDER BY ordinal_position;" 2>/dev/null)

  echo "| 欄位 | 型別 | 說明 |"
  echo "|------|------|------|"

  # 用 python3 解析並標註 FK、拼音翻譯
  echo "$COLS_JSON" | python3 -c "
import sys, json, re

# 拼音 → 中文對照（常見）
PINYIN_MAP = {
    'fuZeYeWu': '負責業務',
    'fuZeYeWuTuBiaoXianShiYong': '負責業務（圖表顯示用）',
    'chengAnLu': '成案率',
    'yuJiJieDanRiQi': '預計接單日期',
    'shuoMing': '說明',
    'yeWuFuZeRen': '業務負責人',
    'lianLuoDianHua': '聯絡電話',
    'chuanZhen': '傳真',
    'gongSiTongBian': '公司統編',
    'gongSiWangZhi': '公司網址',
    'ziBenE': '資本額',
    'yuanGongRenShu': '員工人數',
    'shouJiHaoMa': '手機號碼',
    'lianLuoDianHuaFenJi': '聯絡電話分機',
    'dianZiYouJianEmail': '電子郵件',
    'lineId': 'LINE ID',
    'yuanGong': '員工（身份）',
    'renYuan': '人員',
}

SYSTEM_COLS = {
    'id': 'ID',
    'createdAt': '建立時間',
    'updatedAt': '更新時間',
    'deletedAt': '軟刪除',
    'position': '排序',
    'searchVector': '搜尋向量（系統）',
    'createdBySource': '建立來源',
    'createdByWorkspaceMemberId': '建立者 ID',
    'createdByName': '記錄建立者（≠負責人）',
    'createdByContext': '建立上下文',
}

STANDARD_COLS = {
    'name': '名稱',
    'nameFirstName': '名',
    'nameLastName': '姓',
    'emailsPrimaryEmail': '主要 Email',
    'emailsAdditionalEmails': '其他 Email',
    'phonesPrimaryPhoneNumber': '主要電話',
    'phonesPrimaryPhoneCountryCode': '國碼',
    'phonesPrimaryPhoneCallingCode': '來電號碼',
    'phonesAdditionalPhones': '其他電話',
    'jobTitle': '職稱',
    'city': '城市',
    'intro': '簡介',
    'avatarUrl': '頭像',
    'companyId': 'FK → company',
    'assigneeId': 'FK → workspaceMember（指派人）',
    'pointOfContactId': 'FK → person（聯繫人）',
    'accountOwnerId': 'FK → workspaceMember（帳戶擁有者）',
    'title': '標題',
    'status': '狀態',
    'stage': '階段',
    'closeDate': '預計關閉日',
    'dueAt': '截止日',
    'amountAmountMicros': '金額（÷1000000＝元）',
    'amountCurrencyCode': '幣別',
    'annualRecurringRevenueAmountMicros': '年營收（÷1000000＝元）',
    'annualRecurringRevenueCurrencyCode': '年營收幣別',
    'idealCustomerProfile': '理想客戶',
    'domainNamePrimaryLinkUrl': '網域',
    'domainNamePrimaryLinkLabel': '網域標籤',
    'domainNameSecondaryLinks': '其他網域',
    'linkedinLinkPrimaryLinkUrl': 'LinkedIn',
    'linkedinLinkPrimaryLinkLabel': 'LinkedIn 標籤',
    'linkedinLinkSecondaryLinks': '其他 LinkedIn',
    'xLinkPrimaryLinkUrl': 'X (Twitter)',
    'xLinkPrimaryLinkLabel': 'X 標籤',
    'xLinkSecondaryLinks': '其他 X',
    'tagline': '標語',
    'employees': '員工數',
    'workPolicy': '工作政策',
    'visaSponsorship': '簽證贊助',
    'lineUserId': 'LINE User ID（系統自動）',
    'lineDisplayName': 'LINE 顯示名稱',
    'lineProfilePictureUrl': 'LINE 頭像（系統自動）',
    'lineStatus': 'LINE 狀態',
    'lastLineInteractionAt': '最後 LINE 互動',
    'performanceRating': '績效評級',
    'workPreference': '工作偏好',
}

def guess_description(col_name, data_type):
    # 系統欄位
    if col_name in SYSTEM_COLS:
        return SYSTEM_COLS[col_name]
    # 標準欄位
    if col_name in STANDARD_COLS:
        return STANDARD_COLS[col_name]
    # 拼音完全匹配
    if col_name in PINYIN_MAP:
        return PINYIN_MAP[col_name]
    # 拼音前綴匹配（處理 xxxId, xxxPrimaryLinkUrl 等）
    base = re.sub(r'(Id|PrimaryLinkUrl|PrimaryLinkLabel|SecondaryLinks|PrimaryPhoneNumber|PrimaryPhoneCountryCode|PrimaryPhoneCallingCode|AdditionalPhones|AdditionalEmails|AmountMicros|CurrencyCode)$', '', col_name)
    if base in PINYIN_MAP:
        suffix = col_name[len(base):]
        if suffix == 'Id':
            return f'FK → workspaceMember?（{PINYIN_MAP[base]}）'
        elif 'AmountMicros' in suffix:
            return f'{PINYIN_MAP[base]}（÷1000000＝元）'
        elif 'CurrencyCode' in suffix:
            return f'{PINYIN_MAP[base]}幣別'
        elif 'PrimaryLinkUrl' in suffix:
            return f'{PINYIN_MAP[base]}（URL）'
        elif 'PrimaryPhoneNumber' in suffix:
            return f'{PINYIN_MAP[base]}（號碼）'
        else:
            return f'{PINYIN_MAP[base]}（{suffix}）'
    # UUID + Id 結尾 → 可能是 FK
    if data_type == 'uuid' and col_name.endswith('Id'):
        return f'FK → ?（需探查目標表）'
    return ''

rows = json.load(sys.stdin)
for r in rows:
    col = r['column_name']
    dtype = r['data_type']
    desc = guess_description(col, dtype)
    # 標記自訂拼音欄位
    is_pinyin = col not in SYSTEM_COLS and col not in STANDARD_COLS and not col.startswith('line') and not col.startswith('whatsapp') and not col.startswith('introVideo')
    has_chinese = any(base in col for base in PINYIN_MAP)
    marker = '**' if has_chinese else ''
    print(f'| {marker}{col}{marker} | {dtype} | {desc} |')
" 2>/dev/null

  # 掃描 enum 值（USER-DEFINED 型別）
  ENUM_COLS=$(echo "$COLS_JSON" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
for r in rows:
    if r['data_type'] == 'USER-DEFINED':
        print(r['column_name'])
" 2>/dev/null || true)

  for ENUM_COL in $ENUM_COLS; do
    ENUM_VALS=$(run_duckdb "SELECT DISTINCT \"$ENUM_COL\" AS val FROM $ALIAS.\"$SCHEMA\".\"$TABLE\" WHERE \"deletedAt\" IS NULL AND \"$ENUM_COL\" IS NOT NULL ORDER BY \"$ENUM_COL\" LIMIT 20;" 2>/dev/null || echo "[]")
    VALS=$(echo "$ENUM_VALS" | python3 -c "import sys,json; vals=json.load(sys.stdin); print(', '.join([r['val'] for r in vals]))" 2>/dev/null || echo "（掃描失敗）")
    if [ -n "$VALS" ]; then
      echo ""
      echo "> **${ENUM_COL} 值**：\`$VALS\`"
    fi
  done

  echo ""
done

# ── 自訂表 ──
CUSTOM_TABLES=$(echo "$CUSTOM_TABLES_JSON" | python3 -c "import sys,json; [print(r['table_name']) for r in json.load(sys.stdin)]" 2>/dev/null || true)

if [ -n "$CUSTOM_TABLES" ]; then
  echo "---"
  echo ""
  echo "## 自訂物件表（_ 開頭）"
  echo ""

  for TABLE in $CUSTOM_TABLES; do
    echo "### $TABLE"
    echo ""

    COLS_JSON=$(run_duckdb "SELECT column_name, data_type FROM $ALIAS.information_schema.columns WHERE table_schema = '$SCHEMA' AND table_name = '$TABLE' ORDER BY ordinal_position;" 2>/dev/null)

    echo "| 欄位 | 型別 |"
    echo "|------|------|"
    echo "$COLS_JSON" | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    print(f'| {r[\"column_name\"]} | {r[\"data_type\"]} |')
" 2>/dev/null
    echo ""
  done
fi

# ── FK 關聯總表 ──
echo "---"
echo ""
echo "## 外鍵關聯總表"
echo ""
echo "以下為所有 UUID 型 \`xxxId\` 欄位（可能的外鍵關聯）："
echo ""
echo "| 來源表 | FK 欄位 | 推測目標 |"
echo "|--------|---------|----------|"

for TABLE in $TABLES; do
  FK_JSON=$(run_duckdb "SELECT column_name FROM $ALIAS.information_schema.columns WHERE table_schema = '$SCHEMA' AND table_name = '$TABLE' AND data_type = 'uuid' AND column_name LIKE '%Id' AND column_name <> 'id' ORDER BY column_name;" 2>/dev/null)

  echo "$FK_JSON" | python3 -c "
import sys, json

FK_TARGETS = {
    'companyId': 'company',
    'personId': 'person',
    'assigneeId': 'workspaceMember',
    'accountOwnerId': 'workspaceMember',
    'pointOfContactId': 'person',
    'userId': 'core.user',
    'workspaceId': 'core.workspace',
    'workspaceMemberId': 'workspaceMember',
    'createdByWorkspaceMemberId': 'workspaceMember',
    'workflowId': 'workflow',
    'workflowVersionId': 'workflowVersion',
    'taskId': 'task',
    'noteId': 'note',
    'opportunityId': 'opportunity',
    'messageId': 'message',
    'threadId': 'lineChatThread / messageThread',
    'senderId': 'workspaceMember',
    'fuZeYeWuId': 'workspaceMember（負責業務）',
    'yeWuFuZeRenId': 'workspaceMember（業務負責人）',
    'renYuanId': '自訂物件（人員）',
}

table = '$TABLE'
rows = json.load(sys.stdin)
for r in rows:
    col = r['column_name']
    target = FK_TARGETS.get(col, '?（需探查）')
    print(f'| {table} | {col} | → {target} |')
" 2>/dev/null
done

echo ""
echo "---"
echo ""
echo "> **使用方式**：AI 查詢時直接 \`read\` 此檔案即可獲得完整 schema 資訊。"
echo "> **更新方式**：\`bash scripts/scan-schema.sh $SCHEMA\`"

} > "$OUTPUT_FILE"

echo "✅ 完成！輸出到 $OUTPUT_FILE"
echo "  - 標準表: $(echo "$TABLES" | wc -l | tr -d ' ') 張"
echo "  - 自訂表: $(echo "$CUSTOM_TABLES" | wc -l | tr -d ' ') 張"
