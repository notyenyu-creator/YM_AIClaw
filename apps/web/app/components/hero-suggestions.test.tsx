// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeroSuggestions } from "./hero-suggestions";

describe("HeroSuggestions", () => {
	it("renders EnMS demo hints by default when preset tabs are enabled", async () => {
		const onPromptClick = vi.fn();
		render(
			<HeroSuggestions
				compact={false}
				onPromptClick={onPromptClick}
				defaultPreset="enms"
				enablePresetTabs
			/>,
		);

		expect(screen.getByText("EnMS 問題提示")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "EnMS" })).toHaveAttribute("aria-pressed", "true");
		expect(
			screen.getByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).toBeInTheDocument();

		await userEvent.click(
			screen.getByRole("button", {
				name: "節能 ROI / what-if 模擬",
			}),
		);

		expect(onPromptClick).toHaveBeenCalledWith(
			expect.stringContaining("what-if 試算"),
			"enms",
		);
	});

	it("switches to ERP hints when the ERP preset is selected", async () => {
		render(
			<HeroSuggestions
				compact={false}
				onPromptClick={vi.fn()}
				defaultPreset="enms"
				enablePresetTabs
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "ERP" }));

		expect(screen.getByRole("button", { name: "ERP" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText("ERP 問題提示")).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "近 30 天主要客戶訂單概況",
			}),
		).toBeInTheDocument();
	});

	it("renders a collapsed compact launcher after conversation start", async () => {
		const onPromptClick = vi.fn();
		render(
			<HeroSuggestions
				compact
				onPromptClick={onPromptClick}
				defaultPreset="enms"
				enablePresetTabs
			/>,
		);

		expect(screen.getByText("EnMS 問題提示已收合")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /顯示提示/i }),
		).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("從這裡開始最穩")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: /顯示提示/i }));

		expect(screen.getByText("已驗證題型")).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).toBeInTheDocument();

		await userEvent.click(
			screen.getByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		);

		expect(onPromptClick).toHaveBeenCalledWith(
			expect.stringContaining("契約容量風險"),
			"enms",
		);

		expect(screen.getByText("EnMS 問題提示已收合")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: /顯示提示/i }));
		await userEvent.click(screen.getByRole("button", { name: /收合/i }));

		expect(screen.getByText("EnMS 問題提示已收合")).toBeInTheDocument();
	});

	it("collapses compact hints again when switching domain tabs", async () => {
		const onPromptClick = vi.fn();
		render(
			<HeroSuggestions
				compact
				onPromptClick={onPromptClick}
				defaultPreset="enms"
				enablePresetTabs
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /顯示提示/i }));

		expect(
			screen.getByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "ERP" }));

		expect(screen.getByText("ERP 問題提示已收合")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "近 30 天主要客戶訂單概況",
			}),
		).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: /顯示提示/i }));
		await userEvent.click(
			screen.getByRole("button", {
				name: "近 30 天主要客戶訂單概況",
			}),
		);

		expect(onPromptClick).toHaveBeenCalledWith(
			expect.stringContaining("ERP 最近 30 天主要客戶"),
			"erp",
		);
		expect(screen.getByText("ERP 問題提示已收合")).toBeInTheDocument();
	});
});
