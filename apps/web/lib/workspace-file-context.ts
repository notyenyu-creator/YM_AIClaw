export function rewriteWorkspaceFileContextPaths(
	userText: string,
	workspacePrefix: string | null,
): string {
	if (!workspacePrefix) {
		return userText;
	}

	return userText.replace(
		/\[Context: workspace file '([^']+)'\]/,
		`[Context: workspace file '${workspacePrefix}/$1']`,
	);
}
