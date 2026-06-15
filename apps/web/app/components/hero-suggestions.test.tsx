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

		expect(screen.getByText("ERP 問題提示")).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "近 30 天主要客戶訂單概況",
			}),
		).toBeInTheDocument();
	});

	it("renders a compact launcher after conversation start", () => {
		render(
			<HeroSuggestions
				compact
				onPromptClick={vi.fn()}
				defaultPreset="enms"
				enablePresetTabs
			/>,
		);

		expect(screen.getByText("已驗證題型")).toBeInTheDocument();
		expect(screen.queryByText("從這裡開始最穩")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "過去 7 天最大需量與契約容量風險",
			}),
		).toBeInTheDocument();
	});
});
