"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, Database, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { PROMPT_SUGGESTIONS, type PromptSuggestion } from "@/lib/prompt-suggestions";

const VISIBLE_COUNT = 6;

export type HeroSuggestionPreset = "enms" | "erp" | "ycrm" | "generic";
export type HeroSuggestionSystemHint = Exclude<HeroSuggestionPreset, "generic">;

type DomainPromptHint = {
	id: string;
	badge: string;
	label: string;
	description: string;
	prompt: string;
	tone: "teal" | "indigo" | "amber" | "emerald" | "rose" | "violet";
};

type DomainPromptPreset = {
	label: string;
	subtitle: string;
	trustLine: string;
	icon: typeof Database;
	hints: DomainPromptHint[];
};

const DOMAIN_PRESETS: Record<Exclude<HeroSuggestionPreset, "generic">, DomainPromptPreset> = {
	enms: {
		label: "EnMS",
		subtitle: "從需量、異常、告警、Benchmarking 到 ROI 試算，直接用已驗證題型快速開始。",
		trustLine: "優先使用本地 EnMS 資料回答；若資料不足，會明確指出缺少的場域、設備或時間區間。",
		icon: Zap,
		hints: [
			{
				id: "enms-demand-risk",
				badge: "需量風險",
				label: "過去 7 天最大需量與契約容量風險",
				description: "快速看出最大需量、契約容量逼近程度與可執行的降載建議。",
				prompt: "請用 EnMS 資料分析阿里山過去 7 天最大需量、契約容量風險，並提供降載建議。",
				tone: "rose",
			},
			{
				id: "enms-anomaly-root-cause",
				badge: "異常診斷",
				label: "今天有哪些異常與可能原因",
				description: "用摘要層與 raw layer 檢查異常用電、功因與可能根因。",
				prompt: "請用 EnMS 資料分析今天有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。",
				tone: "amber",
			},
			{
				id: "enms-top-loads",
				badge: "用電排行",
				label: "哪些設備 / 迴路最耗電",
				description: "找出近期最耗電的設備或迴路，協助決定先處理哪裡。",
				prompt: "請找出最近 7 天最耗電的設備或迴路，列出場域、電表別名、耗電量與需優先關注的原因。",
				tone: "teal",
			},
			{
				id: "enms-benchmark-sites",
				badge: "多場域比較",
				label: "多場域 Benchmarking 與排名",
				description: "比較場域總用電、需量與功率因數，快速看出差距與優先改善點。",
				prompt: "請比較阿里山與洋銘資訊最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。",
				tone: "indigo",
			},
			{
				id: "enms-alert-summary",
				badge: "告警治理",
				label: "最近告警摘要與治理建議",
				description: "整理近期預警與告警，區分立即處理、持續觀察與可抑制項目。",
				prompt: "請整理最近 7 天的 EnMS 告警與預警摘要，區分需要立即處理、持續觀察與可抑制的項目，並提供治理建議。",
				tone: "violet",
			},
			{
				id: "enms-roi-whatif",
				badge: "節能試算",
				label: "節能 ROI / what-if 模擬",
				description: "以真實帳單與用電資料估算 5% / 10% 節電情境的效益與假設缺口。",
				prompt: "請用 EnMS 資料評估洋銘資訊最近 30 天的能效表現，並做 5% 與 10% 節電情境的 what-if 試算，說明可節省的電費與需要補哪些假設。",
				tone: "emerald",
			},
		],
	},
	erp: {
		label: "ERP",
		subtitle: "聚焦訂單、出貨、庫存與應收分析，快速切入營運與供應鏈決策。",
		trustLine: "優先使用 ERP 真實交易資料回答；若資料不足，會明確指出缺少的公司、單據或時間區間。",
		icon: BarChart3,
		hints: [
			{
				id: "erp-sales-orders",
				badge: "訂單總覽",
				label: "近 30 天主要客戶訂單概況",
				description: "整理近 30 天訂單、出貨進度與異常，快速掌握主要客戶動態。",
				prompt: "請整理 ERP 最近 30 天主要客戶的銷售訂單、出貨進度與異常狀況，並用圖表呈現。",
				tone: "indigo",
			},
			{
				id: "erp-inventory-risk",
				badge: "庫存風險",
				label: "庫存與缺料風險",
				description: "檢查高風險缺料、庫存周轉異常與需優先追蹤的品項。",
				prompt: "請分析 ERP 目前高風險缺料項目、庫存周轉異常與需要優先追蹤的品項。",
				tone: "amber",
			},
			{
				id: "erp-ar-aging",
				badge: "應收帳款",
				label: "應收帳款風險",
				description: "整理 aging、逾期金額與高風險客戶，方便財務優先處理。",
				prompt: "請整理 ERP 應收帳款 aging，找出逾期客戶、金額最高客戶與需要優先追蹤的項目。",
				tone: "rose",
			},
			{
				id: "erp-production-delay",
				badge: "工單延誤",
				label: "工單 / 生產延誤",
				description: "找出延誤工單或製程，彙整目前狀態、影響與建議順序。",
				prompt: "請找出 ERP 最近延誤的工單或製程，整理目前狀態、影響與建議處理順序。",
				tone: "violet",
			},
			{
				id: "erp-customer-trend",
				badge: "客戶趨勢",
				label: "客戶營運趨勢",
				description: "比較主要客戶的訂單量、出貨量與營收趨勢，找出上升與下滑原因。",
				prompt: "請比較 ERP 主要客戶近 3 個月的訂單量、出貨量與營收趨勢，指出上升與下降原因。",
				tone: "teal",
			},
			{
				id: "erp-chart-demo",
				badge: "圖表展示",
				label: "ERP 圖表測試問題",
				description: "用真實資料做簡潔圖表，快速展示 ERP 分析與可視化能力。",
				prompt: "請用 ERP 真實資料整理最近 30 天主要客戶的訂單與出貨狀況，並用圖表呈現。",
				tone: "emerald",
			},
		],
	},
	ycrm: {
		label: "Y-CRM",
		subtitle: "從客戶背景、商機摘要到工作區健康度，快速切入業務與客情管理。",
		trustLine: "優先使用 Y-CRM 工作區資料回答；若資料不足，會明確指出缺少的 workspace、對象或時間範圍。",
		icon: Users,
		hints: [
			{
				id: "ycrm-owner-background",
				badge: "客戶背景",
				label: "業務員客戶背景整理",
				description: "整理指定業務員負責的客戶、商機與目前優先關注事項。",
				prompt: "請幫我整理 Y-CRM 工作區裡 Calleen Hong 目前負責的客戶背景與商機狀態。",
				tone: "indigo",
			},
			{
				id: "ycrm-opportunity-summary",
				badge: "商機摘要",
				label: "主要商機摘要",
				description: "總覽近期重要商機、階段、金額與需要優先跟進的原因。",
				prompt: "請整理 Y-CRM 最近 30 天的主要商機、目前階段、預估金額與需要優先跟進的原因。",
				tone: "amber",
			},
			{
				id: "ycrm-customer-chart",
				badge: "客戶圖表",
				label: "客戶商機圖表",
				description: "用圖表呈現客戶商機數量、總金額與當前狀態分布。",
				prompt: "請用圖表呈現 Y-CRM 各客戶的商機數量、總金額與目前狀態。",
				tone: "emerald",
			},
			{
				id: "ycrm-stalled-deals",
				badge: "停滯商機",
				label: "停滯商機追蹤",
				description: "找出停滯超過 14 天的商機，整理最近互動與建議下一步。",
				prompt: "請找出 Y-CRM 停滯超過 14 天的商機，整理最近互動、負責人與建議下一步。",
				tone: "rose",
			},
			{
				id: "ycrm-workspace-summary",
				badge: "工作區健康度",
				label: "工作區健康度",
				description: "彙整客戶、商機、待辦與高風險跟進項目，形成主管摘要。",
				prompt: "請整理目前 Y-CRM 工作區的客戶、商機、待辦與高風險跟進項目，做成主管摘要。",
				tone: "teal",
			},
			{
				id: "ycrm-account-plan",
				badge: "經營建議",
				label: "客戶經營建議",
				description: "根據互動紀錄與商機狀態，排出接下來 2 週的經營優先順序。",
				prompt: "請根據 Y-CRM 目前的互動紀錄與商機狀態，提供接下來 2 週的客戶經營優先順序與建議。",
				tone: "violet",
			},
		],
	},
};

const PRESET_THEME: Record<HeroSuggestionPreset, {
	accent: string;
	accentSoft: string;
	panelBg: string;
	panelBorder: string;
}> = {
	enms: {
		accent: "#0f766e",
		accentSoft: "rgba(15, 118, 110, 0.12)",
		panelBg: "linear-gradient(180deg, rgba(244, 252, 251, 0.98) 0%, rgba(239, 248, 247, 0.96) 100%)",
		panelBorder: "rgba(15, 118, 110, 0.16)",
	},
	erp: {
		accent: "#b45309",
		accentSoft: "rgba(180, 83, 9, 0.12)",
		panelBg: "linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(255, 247, 237, 0.96) 100%)",
		panelBorder: "rgba(180, 83, 9, 0.16)",
	},
	ycrm: {
		accent: "#4338ca",
		accentSoft: "rgba(67, 56, 202, 0.12)",
		panelBg: "linear-gradient(180deg, rgba(246, 247, 255, 0.98) 0%, rgba(238, 242, 255, 0.96) 100%)",
		panelBorder: "rgba(67, 56, 202, 0.16)",
	},
	generic: {
		accent: "#334155",
		accentSoft: "rgba(51, 65, 85, 0.12)",
		panelBg: "linear-gradient(180deg, rgba(250, 250, 250, 0.98) 0%, rgba(245, 245, 245, 0.96) 100%)",
		panelBorder: "rgba(148, 163, 184, 0.18)",
	},
};

const TONE_STYLES: Record<
	DomainPromptHint["tone"],
	{ background: string; borderColor: string; color: string }
> = {
	teal: {
		background: "rgba(20, 184, 166, 0.08)",
		borderColor: "rgba(13, 148, 136, 0.18)",
		color: "#0f766e",
	},
	indigo: {
		background: "rgba(99, 102, 241, 0.08)",
		borderColor: "rgba(79, 70, 229, 0.18)",
		color: "#4338ca",
	},
	amber: {
		background: "rgba(245, 158, 11, 0.08)",
		borderColor: "rgba(217, 119, 6, 0.18)",
		color: "#b45309",
	},
	emerald: {
		background: "rgba(16, 185, 129, 0.08)",
		borderColor: "rgba(5, 150, 105, 0.18)",
		color: "#047857",
	},
	rose: {
		background: "rgba(244, 63, 94, 0.08)",
		borderColor: "rgba(225, 29, 72, 0.18)",
		color: "#be123c",
	},
	violet: {
		background: "rgba(139, 92, 246, 0.08)",
		borderColor: "rgba(124, 58, 237, 0.18)",
		color: "#7c3aed",
	},
};

function shuffleArray<T>(arr: T[]): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function pickRandom(count: number): PromptSuggestion[] {
	return shuffleArray(PROMPT_SUGGESTIONS).slice(0, count);
}

function SuggestionPill({
	suggestion,
	onClick,
}: {
	suggestion: PromptSuggestion;
	onClick: (prompt: string) => void;
}) {
	const Icon = suggestion.icon;
	const isBrand = suggestion.iconType === "brand";

	return (
		<button
			type="button"
			onClick={() => onClick(suggestion.prompt)}
			className="group flex items-center gap-1.5 px-3 md:px-3.5 py-1.5 md:py-2 text-[11px] md:text-xs font-medium whitespace-nowrap rounded-xl transition-all duration-200 border shrink-0"
			style={{
				background: "var(--color-surface)",
				borderColor: "var(--color-border)",
				color: "var(--color-text-secondary)",
			}}
		>
			<div
				className={`flex-shrink-0 transition-all duration-200 ${
					isBrand
						? "grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100"
						: "opacity-45 group-hover:opacity-100"
				}`}
			>
				{isBrand ? (
					<Icon
						className="w-3.5 h-3.5"
						style={{ color: suggestion.brandColor }}
					/>
				) : (
					<Icon className="w-3.5 h-3.5" />
				)}
			</div>
			{suggestion.label}
		</button>
	);
}

export function HeroSuggestions({
	compact,
	onPromptClick,
	defaultPreset = "generic",
	enablePresetTabs = false,
}: {
	compact: boolean;
	onPromptClick: (prompt: string, systemHint?: HeroSuggestionSystemHint) => void;
	defaultPreset?: HeroSuggestionPreset;
	enablePresetTabs?: boolean;
}) {
	const [preset, setPreset] = useState<HeroSuggestionPreset>(defaultPreset);
	const [domainHintsExpanded, setDomainHintsExpanded] = useState(!compact);
	const [seed] = useState(0);
	const domainHintPanelId = useId();

	useEffect(() => {
		setPreset(defaultPreset);
	}, [defaultPreset]);

	useEffect(() => {
		setDomainHintsExpanded(!compact);
	}, [compact]);

	const visible = useMemo(
		() => pickRandom(VISIBLE_COUNT),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[seed],
	);

	const row1 = visible.slice(0, 3);
	const row2 = visible.slice(3);
	const activeDomainPreset = preset === "generic" ? null : DOMAIN_PRESETS[preset];
	const activeSystemHint: HeroSuggestionSystemHint | null =
		preset === "generic" ? null : preset;
	const theme = PRESET_THEME[preset];
	const handlePresetClick = (nextPreset: HeroSuggestionPreset) => {
		setPreset(nextPreset);
		if (compact) {
			setDomainHintsExpanded(false);
		}
	};
	const handleDomainHintClick = (prompt: string, systemHint?: HeroSuggestionSystemHint) => {
		onPromptClick(prompt, systemHint);
		if (compact) {
			setDomainHintsExpanded(false);
		}
	};

	return (
		<div
			className={`mt-4 md:mt-6 flex flex-col gap-3 w-full max-w-[820px] mx-auto ${compact ? "px-1.5" : "px-4"}`}
		>
			{enablePresetTabs && (
				<div className="flex items-center justify-center gap-2 flex-wrap">
					{(["enms", "erp", "ycrm"] as const).map((key) => {
						const isActive = preset === key;
						return (
							<button
								key={key}
								type="button"
								onClick={() => handlePresetClick(key)}
								aria-pressed={isActive}
								className="rounded-full px-4 py-2 text-xs font-semibold border transition-all duration-200 shadow-sm"
								style={{
									background: isActive ? PRESET_THEME[key].accent : "color-mix(in srgb, var(--color-surface) 92%, transparent)",
									borderColor: isActive ? PRESET_THEME[key].accent : "var(--color-border)",
									color: isActive ? "#ffffff" : "var(--color-text-secondary)",
									boxShadow: isActive ? `0 10px 24px ${PRESET_THEME[key].accentSoft}` : "none",
								}}
							>
								{DOMAIN_PRESETS[key].label}
							</button>
						);
					})}
					<button
						type="button"
						onClick={() => handlePresetClick("generic")}
						aria-pressed={preset === "generic"}
						className="rounded-full px-4 py-2 text-xs font-semibold border transition-all duration-200 shadow-sm"
						style={{
							background: preset === "generic" ? PRESET_THEME.generic.accent : "color-mix(in srgb, var(--color-surface) 92%, transparent)",
							borderColor: preset === "generic" ? PRESET_THEME.generic.accent : "var(--color-border)",
							color: preset === "generic" ? "#ffffff" : "var(--color-text-secondary)",
							boxShadow: preset === "generic" ? `0 10px 24px ${PRESET_THEME.generic.accentSoft}` : "none",
						}}
					>
						通用
					</button>
				</div>
			)}

			{activeDomainPreset ? (
				compact ? (
				domainHintsExpanded ? (
				<div
					id={domainHintPanelId}
					role="region"
					aria-label={`${activeDomainPreset.label} 問題提示`}
					className="rounded-[22px] border px-3.5 py-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
					style={{
						background: "color-mix(in srgb, var(--color-surface) 90%, white 10%)",
						borderColor: theme.panelBorder,
					}}
				>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2.5 min-w-0">
							<div
								className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border"
								style={{
									background: theme.accentSoft,
									borderColor: theme.panelBorder,
									color: theme.accent,
								}}
							>
								<activeDomainPreset.icon className="h-4 w-4" />
							</div>
							<div className="min-w-0">
								<p
									className="text-[11px] font-semibold tracking-[0.14em] uppercase"
									style={{ color: "var(--color-text-muted)" }}
								>
									{activeDomainPreset.label} 問題提示
								</p>
								<p
									className="text-sm font-semibold truncate"
									style={{ color: "var(--color-text)" }}
								>
									已驗證題型
								</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
								style={{
									background: "rgba(255,255,255,0.72)",
									borderColor: theme.panelBorder,
									color: theme.accent,
								}}
							>
								<Database className="h-3.5 w-3.5" />
								資料優先
							</span>
							<button
								type="button"
								onClick={() => setDomainHintsExpanded(false)}
								aria-expanded="true"
								aria-controls={domainHintPanelId}
								className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all hover:-translate-y-0.5"
								style={{
									background: "rgba(255,255,255,0.78)",
									borderColor: theme.panelBorder,
									color: "var(--color-text-secondary)",
								}}
							>
								<ChevronUp className="h-3.5 w-3.5" />
								收合
							</button>
						</div>
					</div>

					<p
						className="mt-2 text-xs leading-5"
						style={{ color: "var(--color-text-secondary)" }}
					>
						{activeDomainPreset.trustLine}
					</p>

					<div className="mt-3 flex flex-wrap gap-2">
						{activeDomainPreset.hints.map((hint) => (
							<button
								key={hint.id}
								type="button"
								onClick={() => handleDomainHintClick(hint.prompt, activeSystemHint ?? undefined)}
								aria-label={hint.label}
								className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left transition-all duration-200 hover:-translate-y-0.5"
								style={{
									background: TONE_STYLES[hint.tone].background,
									borderColor: TONE_STYLES[hint.tone].borderColor,
									color: TONE_STYLES[hint.tone].color,
								}}
							>
								<span
									className="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em]"
									style={{
										background: "rgba(255,255,255,0.64)",
										borderColor: "rgba(255,255,255,0.5)",
										color: TONE_STYLES[hint.tone].color,
									}}
								>
									{hint.badge}
								</span>
								<span className="truncate text-[12px] font-semibold">
									{hint.label}
								</span>
							</button>
						))}
					</div>
				</div>
				) : (
				<div
					className="rounded-[20px] border px-3 py-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.05)]"
					style={{
						background: "color-mix(in srgb, var(--color-surface) 92%, white 8%)",
						borderColor: theme.panelBorder,
					}}
				>
					<button
						type="button"
						onClick={() => setDomainHintsExpanded(true)}
						aria-expanded="false"
						aria-controls={domainHintPanelId}
						className="flex w-full items-center justify-between gap-3 text-left"
					>
						<div className="flex min-w-0 items-center gap-2.5">
							<div
								className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border"
								style={{
									background: theme.accentSoft,
									borderColor: theme.panelBorder,
									color: theme.accent,
								}}
							>
								<activeDomainPreset.icon className="h-4 w-4" />
							</div>
							<div className="min-w-0">
								<p
									className="truncate text-xs font-semibold"
									style={{ color: "var(--color-text)" }}
								>
									{activeDomainPreset.label} 問題提示已收合
								</p>
								<p
									className="truncate text-[11px]"
									style={{ color: "var(--color-text-muted)" }}
								>
									需要範例題型時再展開，不會擋住輸入內容。
								</p>
							</div>
						</div>
						<span
							className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
							style={{
								background: theme.accentSoft,
								borderColor: theme.panelBorder,
								color: theme.accent,
							}}
						>
							<ChevronDown className="h-3.5 w-3.5" />
							顯示提示
						</span>
					</button>
				</div>
				)
				) : (
				<div
					className={`border ${compact ? "rounded-[24px] px-4 py-4" : "rounded-[32px] px-5 py-5 md:px-6 md:py-6"} shadow-[0_24px_80px_rgba(15,23,42,0.08)]`}
					style={{
						background: theme.panelBg,
						borderColor: theme.panelBorder,
					}}
				>
					<div className={`mb-4 ${compact ? "space-y-3" : "space-y-4"}`}>
						<div className={`flex ${compact ? "flex-col gap-3" : "items-start justify-between gap-4"}`}>
							<div className="flex items-start gap-3">
								<div
									className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
									style={{
										background: theme.accentSoft,
										borderColor: theme.panelBorder,
										color: theme.accent,
									}}
								>
									<activeDomainPreset.icon className="h-5 w-5" />
								</div>
								<div>
									<p
										className="text-[11px] md:text-xs font-semibold tracking-[0.18em] uppercase"
										style={{ color: "var(--color-text-muted)" }}
									>
										{activeDomainPreset.label} 問題提示
									</p>
									<h3
										className={`font-semibold ${compact ? "text-base" : "text-xl md:text-2xl"} mt-1`}
										style={{ color: "var(--color-text)" }}
									>
										從這裡開始最穩
									</h3>
									<p
										className={`${compact ? "text-xs" : "text-sm"} mt-1.5 max-w-[560px] leading-6`}
										style={{ color: "var(--color-text-secondary)" }}
									>
										{activeDomainPreset.subtitle}
									</p>
								</div>
							</div>
							<div className={`flex ${compact ? "flex-wrap" : "flex-col items-end"} gap-2`}>
								<span
									className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
									style={{
										background: "rgba(255,255,255,0.56)",
										borderColor: theme.panelBorder,
										color: theme.accent,
									}}
								>
									<Database className="h-3.5 w-3.5" />
									資料優先
								</span>
								<span
									className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
									style={{
										background: "rgba(255,255,255,0.56)",
										borderColor: theme.panelBorder,
										color: "var(--color-text-secondary)",
									}}
								>
									<ShieldCheck className="h-3.5 w-3.5" />
									已驗證題型
								</span>
							</div>
						</div>

						<div
							className="rounded-2xl border px-4 py-3"
							style={{
								background: "rgba(255,255,255,0.58)",
								borderColor: theme.panelBorder,
							}}
						>
							<div className="flex items-start gap-2">
								<Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.accent }} />
								<p
									className={`${compact ? "text-xs" : "text-sm"} leading-6`}
									style={{ color: "var(--color-text-secondary)" }}
								>
									{activeDomainPreset.trustLine}
								</p>
							</div>
						</div>
					</div>
					<div className={`grid grid-cols-1 md:grid-cols-2 ${compact ? "gap-2.5" : "gap-3"}`}>
						{activeDomainPreset.hints.map((hint) => (
							<button
								key={hint.id}
								type="button"
								onClick={() => handleDomainHintClick(hint.prompt, activeSystemHint ?? undefined)}
								aria-label={hint.label}
								className="group text-left rounded-[22px] border px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
								style={{
									...TONE_STYLES[hint.tone],
									boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
								}}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<span
											className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase"
											style={{
												background: "rgba(255,255,255,0.55)",
												borderColor: "rgba(255,255,255,0.45)",
												color: TONE_STYLES[hint.tone].color,
											}}
										>
											{hint.badge}
										</span>
										<div className="mt-2 text-sm md:text-[15px] font-semibold leading-6">
											{hint.label}
										</div>
										<p className="mt-1.5 text-xs md:text-[13px] leading-5 opacity-90">
											{hint.description}
										</p>
									</div>
									<div
										className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
										style={{
											background: "rgba(255,255,255,0.55)",
											borderColor: "rgba(255,255,255,0.45)",
											color: TONE_STYLES[hint.tone].color,
										}}
									>
										↗
									</div>
								</div>
							</button>
						))}
					</div>
				</div>
				)
			) : (
				<>
					<div className="flex items-center justify-center gap-2 flex-wrap">
						{row1.map((s) => (
							<SuggestionPill
								key={s.id}
								suggestion={s}
								onClick={onPromptClick}
							/>
						))}
					</div>
					<div className="flex items-center justify-center gap-2 flex-wrap">
						{row2.map((s) => (
							<SuggestionPill
								key={s.id}
								suggestion={s}
								onClick={onPromptClick}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
