#!/usr/bin/env python3
"""
Y-CRM Schema 自動掃描腳本
掃描指定工作區的所有表、欄位、外鍵關聯、enum 值
產出完整的 schema reference，供 AI 直接使用

用法：
  python3 scan-schema.py [schema_name]
  python3 scan-schema.py                                     # 預設掃 Y-CRM 工作區
  python3 scan-schema.py workspace_407lopjyyvm7bxeutk1tvqkpo # 掃指定工作區
"""

import subprocess, json, sys, os, re
from datetime import datetime

# ── 設定 ──
DB_NAME = os.environ.get("DB_NAME", "default")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASS", "postgres")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
ALIAS = "ycrm"
SCHEMA = sys.argv[1] if len(sys.argv) > 1 else "workspace_3joxkr9ofo5hlxjan164egffx"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "reference")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, f"auto-schema-{SCHEMA}.md")

ATTACH = f"INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname={DB_NAME} user={DB_USER} password={DB_PASS} host={DB_HOST} port={DB_PORT}' AS {ALIAS} (TYPE postgres_scanner, READ_ONLY);"

# ── 拼音 → 中文對照 ──
PINYIN_MAP = {
    "fuZeYeWu": "負責業務",
    "fuZeYeWuTuBiaoXianShiYong": "負責業務（圖表顯示用，存人名字串）",
    "chengAnLu": "成案率",
    "yuJiJieDanRiQi": "預計接單日期",
    "shuoMing": "說明",
    "yeWuFuZeRen": "業務負責人",
    "lianLuoDianHua": "聯絡電話",
    "chuanZhen": "傳真",
    "gongSiTongBian": "公司統編",
    "gongSiWangZhi": "公司網址",
    "ziBenE": "資本額",
    "yuanGongRenShu": "員工人數",
    "shouJiHaoMa": "手機號碼",
    "lianLuoDianHuaFenJi": "聯絡電話分機",
    "dianZiYouJianEmail": "電子郵件",
    "lineId": "LINE ID",
    "yuanGong": "員工（身份）",
    "renYuan": "人員",
    "jiaoYiTiaoJian": "交易條件",
    "beiZhu": "備註",
    "yeJiMuBiao": "業績目標",
    "chanPin": "產品",
    "danJia": "單價",
    "shuLiang": "數量",
    "xiaoJi": "小計",
    "fuZeYeWuFirstName": "負責業務（名）",
    "fuZeYeWuLastName": "負責業務（姓）",
}

# ── 已知 FK 目標 ──
FK_TARGETS = {
    "companyId": "company",
    "personId": "person",
    "assigneeId": "workspaceMember（指派人）",
    "accountOwnerId": "workspaceMember（帳戶擁有者）",
    "pointOfContactId": "person（聯繫人）",
    "userId": "core.user",
    "workspaceId": "core.workspace",
    "workspaceMemberId": "workspaceMember",
    "createdByWorkspaceMemberId": "workspaceMember（建立者）",
    "workflowId": "workflow",
    "workflowVersionId": "workflowVersion",
    "taskId": "task",
    "noteId": "note",
    "opportunityId": "opportunity",
    "messageId": "message",
    "threadId": "lineChatThread / messageThread",
    "senderId": "workspaceMember（發送者）",
    "fuZeYeWuId": "workspaceMember（負責業務）",
    "yeWuFuZeRenId": "workspaceMember（業務負責人）",
    "renYuanId": "自訂物件（人員）",
    "connectedAccountId": "connectedAccount",
    "calendarChannelId": "calendarChannel",
    "calendarEventId": "calendarEvent",
    "messageChannelId": "messageChannel",
    "messageThreadId": "messageThread",
    "dashboardId": "dashboard",
    "salesQuoteId": "salesQuote",
    "salesQuoteLineItemId": "salesQuoteLineItem",
    "favoriteFolderId": "favoriteFolder",
    "pageLayoutId": "pageLayout（版面）",
}

# ── 系統欄位 ──
SYSTEM_COLS = {
    "id": "ID", "createdAt": "建立時間", "updatedAt": "更新時間",
    "deletedAt": "軟刪除", "position": "排序", "searchVector": "搜尋向量（系統）",
    "createdBySource": "建立來源", "createdByWorkspaceMemberId": "建立者 member ID",
    "createdByName": "⚠️ 記錄建立者（≠負責人）", "createdByContext": "建立上下文",
}

STANDARD_COLS = {
    "name": "名稱", "nameFirstName": "名", "nameLastName": "姓",
    "emailsPrimaryEmail": "主要 Email", "emailsAdditionalEmails": "其他 Email",
    "phonesPrimaryPhoneNumber": "主要電話", "phonesPrimaryPhoneCountryCode": "國碼",
    "phonesPrimaryPhoneCallingCode": "來電號碼", "phonesAdditionalPhones": "其他電話",
    "jobTitle": "職稱", "city": "城市", "intro": "簡介", "avatarUrl": "頭像",
    "title": "標題", "status": "狀態", "stage": "階段",
    "closeDate": "預計關閉日", "dueAt": "截止日",
    "amountAmountMicros": "金額（÷1000000＝元）", "amountCurrencyCode": "幣別",
    "annualRecurringRevenueAmountMicros": "年營收（÷1000000＝元）",
    "annualRecurringRevenueCurrencyCode": "年營收幣別",
    "idealCustomerProfile": "理想客戶", "employees": "員工數",
    "domainNamePrimaryLinkUrl": "網域", "domainNameSecondaryLinks": "其他網域",
    "linkedinLinkPrimaryLinkUrl": "LinkedIn", "xLinkPrimaryLinkUrl": "X (Twitter)",
    "tagline": "標語", "workPolicy": "工作政策", "visaSponsorship": "簽證贊助",
    "lineUserId": "LINE User ID（系統自動）", "lineDisplayName": "LINE 顯示名稱",
    "lineProfilePictureUrl": "LINE 頭像（系統自動）", "lineStatus": "LINE 狀態",
    "lastLineInteractionAt": "最後 LINE 互動", "performanceRating": "績效評級",
}


def run_duckdb(sql):
    """執行 DuckDB 查詢，回傳 JSON list"""
    full_sql = f"{ATTACH} {sql}"
    try:
        result = subprocess.run(
            ["duckdb", "-json", ":memory:", full_sql],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (json.JSONDecodeError, subprocess.TimeoutExpired, Exception) as e:
        pass
    return []


def guess_desc(col_name, data_type):
    """推測欄位中文說明"""
    if col_name in SYSTEM_COLS:
        return SYSTEM_COLS[col_name]
    if col_name in STANDARD_COLS:
        return STANDARD_COLS[col_name]
    if col_name in PINYIN_MAP:
        return PINYIN_MAP[col_name]

    # FK 目標
    if col_name in FK_TARGETS:
        return f"FK → {FK_TARGETS[col_name]}"

    # 拼音前綴匹配
    suffixes = ["Id", "PrimaryLinkUrl", "PrimaryLinkLabel", "SecondaryLinks",
                "PrimaryPhoneNumber", "PrimaryPhoneCountryCode", "PrimaryPhoneCallingCode",
                "AdditionalPhones", "AdditionalEmails", "AmountMicros", "CurrencyCode",
                "Blocknote", "Markdown", "FirstName", "LastName"]
    for sfx in suffixes:
        if col_name.endswith(sfx):
            base = col_name[:-len(sfx)]
            if base in PINYIN_MAP:
                if sfx == "Id":
                    return f"FK → workspaceMember?（{PINYIN_MAP[base]}）"
                elif sfx == "AmountMicros":
                    return f"{PINYIN_MAP[base]}（÷1000000＝元）"
                elif sfx == "CurrencyCode":
                    return f"{PINYIN_MAP[base]}幣別"
                elif sfx in ("PrimaryLinkUrl", "PrimaryPhoneNumber"):
                    return f"{PINYIN_MAP[base]}"
                elif sfx in ("FirstName", "LastName"):
                    return f"{PINYIN_MAP[base]}（{'名' if sfx == 'FirstName' else '姓'}）"
                elif sfx in ("Blocknote", "Markdown"):
                    return f"{PINYIN_MAP[base]}（{sfx} 格式）"
                else:
                    return f"{PINYIN_MAP[base]}"

    # UUID + Id → 未知 FK
    if data_type == "uuid" and col_name.endswith("Id"):
        return "FK → ?（需探查）"

    # body 相關
    if "Blocknote" in col_name:
        return "內容（BlockNote 格式）"
    if "Markdown" in col_name:
        return "內容（Markdown 格式）"

    return ""


def is_custom_pinyin(col_name):
    """判斷是否為自訂拼音欄位"""
    if col_name in SYSTEM_COLS or col_name in STANDARD_COLS:
        return False
    if col_name in PINYIN_MAP:
        return True
    for sfx in ["Id", "AmountMicros", "CurrencyCode", "PrimaryLinkUrl", "FirstName", "LastName"]:
        if col_name.endswith(sfx):
            base = col_name[:-len(sfx)]
            if base in PINYIN_MAP:
                return True
    return False


# ═══════════════════════════════════════════
print(f"🔍 掃描 schema: {SCHEMA} ...")

# 1. 列出所有表
print("  📋 掃描表...")
std_tables = run_duckdb(
    f"SELECT table_name FROM {ALIAS}.information_schema.tables "
    f"WHERE table_schema = '{SCHEMA}' AND table_name NOT LIKE '\\_%' ESCAPE '\\' "
    f"ORDER BY table_name;"
)
custom_tables = run_duckdb(
    f"SELECT table_name FROM {ALIAS}.information_schema.tables "
    f"WHERE table_schema = '{SCHEMA}' AND table_name LIKE '\\_%' ESCAPE '\\' "
    f"ORDER BY table_name;"
)

std_table_names = [r["table_name"] for r in std_tables]
custom_table_names = [r["table_name"] for r in custom_tables]
all_table_names = std_table_names + custom_table_names

# 2. 掃描每張表的欄位
print("  📊 掃描欄位...")
table_columns = {}
for tn in all_table_names:
    cols = run_duckdb(
        f'SELECT column_name, data_type, is_nullable '
        f'FROM {ALIAS}.information_schema.columns '
        f"WHERE table_schema = '{SCHEMA}' AND table_name = '{tn}' "
        f'ORDER BY ordinal_position;'
    )
    table_columns[tn] = cols

# 3. 掃描 enum 值
print("  🏷️  掃描 enum 值...")
table_enums = {}
for tn, cols in table_columns.items():
    enums = {}
    for c in cols:
        if c["data_type"] == "USER-DEFINED":
            vals = run_duckdb(
                f'SELECT DISTINCT "{c["column_name"]}" AS val '
                f'FROM {ALIAS}."{SCHEMA}"."{tn}" '
                f'WHERE "deletedAt" IS NULL AND "{c["column_name"]}" IS NOT NULL '
                f'ORDER BY "{c["column_name"]}" LIMIT 20;'
            )
            if vals:
                enums[c["column_name"]] = [r["val"] for r in vals]
    if enums:
        table_enums[tn] = enums

# 4. 建立 FK 關聯總表
print("  🔗 建立關聯地圖...")
all_fks = []
for tn, cols in table_columns.items():
    for c in cols:
        cn = c["column_name"]
        if c["data_type"] == "uuid" and cn.endswith("Id") and cn != "id":
            target = FK_TARGETS.get(cn, None)
            if not target:
                # 嘗試拼音前綴
                base = cn[:-2]  # remove "Id"
                if base in PINYIN_MAP:
                    target = f"workspaceMember?（{PINYIN_MAP[base]}）"
                else:
                    target = "?（需探查）"
            all_fks.append((tn, cn, target))

# ═══════════════════════════════════════════
# 輸出 Markdown
print("  📝 產生文件...")

os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write("# 自動產生的 Schema Reference\n\n")
    f.write("> **此檔案由 `scan-schema.py` 自動產生，請勿手動編輯。**\n")
    f.write(f"> 重新掃描：`python3 scripts/scan-schema.py {SCHEMA}`\n\n")
    f.write(f"- Schema: `{SCHEMA}`\n")
    f.write(f"- 掃描時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"- 標準表: {len(std_table_names)} 張\n")
    f.write(f"- 自訂表: {len(custom_table_names)} 張\n\n")
    f.write("---\n\n")

    # ── 標準表 ──
    f.write("## 標準表\n\n")
    for tn in std_table_names:
        cols = table_columns[tn]
        f.write(f"### {tn}\n\n")
        f.write("| 欄位 | 型別 | 說明 |\n")
        f.write("|------|------|------|\n")
        for c in cols:
            cn = c["column_name"]
            dt = c["data_type"]
            desc = guess_desc(cn, dt)
            marker = "**" if is_custom_pinyin(cn) else ""
            f.write(f"| {marker}{cn}{marker} | {dt} | {desc} |\n")

        # enum 值
        if tn in table_enums:
            for ecol, evals in table_enums[tn].items():
                f.write(f"\n> **{ecol} 值**：`{', '.join(evals)}`\n")
        f.write("\n")

    # ── 自訂表 ──
    if custom_table_names:
        f.write("---\n\n## 自訂物件表（_ 開頭）\n\n")
        for tn in custom_table_names:
            cols = table_columns[tn]
            f.write(f"### {tn}\n\n")
            f.write("| 欄位 | 型別 | 說明 |\n")
            f.write("|------|------|------|\n")
            for c in cols:
                cn = c["column_name"]
                dt = c["data_type"]
                desc = guess_desc(cn, dt)
                marker = "**" if is_custom_pinyin(cn) else ""
                f.write(f"| {marker}{cn}{marker} | {dt} | {desc} |\n")
            if tn in table_enums:
                for ecol, evals in table_enums[tn].items():
                    f.write(f"\n> **{ecol} 值**：`{', '.join(evals)}`\n")
            f.write("\n")

    # ── FK 關聯總表 ──
    f.write("---\n\n## 外鍵關聯總表\n\n")
    f.write("以下為所有 UUID 型 `xxxId` 欄位（外鍵關聯）：\n\n")
    f.write("| 來源表 | FK 欄位 | 目標 |\n")
    f.write("|--------|---------|------|\n")
    for src, fk, tgt in all_fks:
        f.write(f"| {src} | {fk} | → {tgt} |\n")

    f.write("\n---\n\n")
    f.write("> **使用方式**：AI 查詢時 `read` 此檔案即可獲得完整 schema。\n")
    f.write(f"> **更新方式**：`python3 scripts/scan-schema.py {SCHEMA}`\n")

print(f"✅ 完成！輸出到 {OUTPUT_FILE}")
print(f"  - 標準表: {len(std_table_names)} 張")
print(f"  - 自訂表: {len(custom_table_names)} 張")
print(f"  - FK 關聯: {len(all_fks)} 條")
