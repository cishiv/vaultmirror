import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

import * as path from "path";
import * as fs from "fs";

interface VaultMirrorSettings {
	sourceVaultPath: string;
	targetVaultPath: string;
}

const DEFAULT_SETTINGS: VaultMirrorSettings = {
	sourceVaultPath: "",
	targetVaultPath: "",
};

export default class VaultMirrorPlugin extends Plugin {
	settings: VaultMirrorSettings;

	async onload() {
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon(
			"copy",
			"Vault Mirror",
			(evt: MouseEvent) => {
				// Open the vault mirror interface
				this.openVaultMirror();
			}
		);
		ribbonIconEl.addClass("vault-mirror-ribbon-class");

		this.addCommand({
			id: "open-vault-mirror",
			name: "Open Vault Mirror",
			callback: () => {
				this.openVaultMirror();
			},
		});

		this.addSettingTab(new VaultMirrorSettingTab(this.app, this));
	}

	onunload() {}

	openVaultMirror() {
		if (!this.settings.sourceVaultPath || !this.settings.targetVaultPath) {
			new Notice("Please configure both vault paths in settings first!");
			return;
		}
		new VaultMirrorModal(this.app, this).open();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async getMarkdownFiles(vaultPath: string): Promise<string[]> {
		try {
			const files: string[] = [];

			const scanDirectory = (dir: string) => {
				const items = fs.readdirSync(dir);
				for (const item of items) {
					const fullPath = path.join(dir, item);
					const stat = fs.statSync(fullPath);

					if (stat.isDirectory() && !item.startsWith(".")) {
						// Skip hidden directories like .obsidian
						scanDirectory(fullPath);
					} else if (stat.isFile() && item.endsWith(".md")) {
						// Get relative path from vault root
						const relativePath = path.relative(vaultPath, fullPath);
						files.push(relativePath);
					}
				}
			};

			if (fs.existsSync(vaultPath)) {
				scanDirectory(vaultPath);
			} else {
				throw new Error(`Vault path does not exist: ${vaultPath}`);
			}

			return files.sort();
		} catch (error) {
			console.error("Error reading vault:", error);
			throw error;
		}
	}

	async copyFiles(
		sourceFiles: string[],
		fromVault: string,
		toVault: string
	): Promise<void> {
		for (const file of sourceFiles) {
			try {
				const sourcePath = path.join(fromVault, file);

				const fileName = path.basename(file);
				const targetPath = path.join(toVault, fileName);

				if (fs.existsSync(targetPath)) {
					const name = path.parse(fileName).name;
					const ext = path.parse(fileName).ext;
					let counter = 1;
					let uniqueTargetPath = targetPath;

					while (fs.existsSync(uniqueTargetPath)) {
						const uniqueFileName = `${name}_${counter}${ext}`;
						uniqueTargetPath = path.join(toVault, uniqueFileName);
						counter++;
					}

					fs.copyFileSync(sourcePath, uniqueTargetPath);
					new Notice(
						`Copied ${fileName} as ${path.basename(
							uniqueTargetPath
						)} (renamed to avoid conflict)`
					);
				} else {
					fs.copyFileSync(sourcePath, targetPath);
				}
			} catch (error) {
				console.error(`Error copying file ${file}:`, error);
				new Notice(`Error copying ${file}: ${error.message}`);
			}
		}
	}
}

class VaultMirrorModal extends Modal {
	plugin: VaultMirrorPlugin;
	sourceFiles: string[] = [];
	targetFiles: string[] = [];
	selectedSourceFiles: Set<string> = new Set();
	selectedTargetFiles: Set<string> = new Set();
	isScanned = false;

	constructor(app: App, plugin: VaultMirrorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.style.width = "90vw";
		this.modalEl.style.height = "80vh";
		this.modalEl.style.maxWidth = "1200px";

		contentEl.createEl("h2", { text: "Vault Mirror" });

		this.createInitialInterface();
	}

	createInitialInterface() {
		const { contentEl } = this;

		const title = contentEl.querySelector("h2");
		contentEl.empty();
		if (title) contentEl.appendChild(title);

		const infoSection = contentEl.createDiv({ cls: "vault-mirror-info" });

		infoSection.createEl("h3", { text: "Vault Paths" });

		const sourceInfo = infoSection.createDiv({ cls: "vault-info-item" });
		sourceInfo.createEl("strong", { text: "Source Vault: " });
		sourceInfo.createSpan({
			text: this.plugin.settings.sourceVaultPath,
			cls: "vault-path",
		});

		const targetInfo = infoSection.createDiv({ cls: "vault-info-item" });
		targetInfo.createEl("strong", { text: "Target Vault: " });
		targetInfo.createSpan({
			text: this.plugin.settings.targetVaultPath,
			cls: "vault-path",
		});

		const actionSection = contentEl.createDiv({
			cls: "vault-mirror-actions",
		});

		const scanBtn = actionSection.createEl("button", {
			text: "Scan Vaults for .md Files",
			cls: "scan-button",
		});
		scanBtn.onclick = () => this.scanVaults();

		const statusSection = contentEl.createDiv({
			cls: "vault-mirror-status",
		});
		statusSection.createEl("p", {
			text: 'Click "Scan Vaults" to find all markdown files in both vaults.',
			cls: "status-text",
		});
	}

	async scanVaults() {
		const { contentEl } = this;

		const statusSection = contentEl.querySelector(".vault-mirror-status");
		if (statusSection) {
			statusSection.empty();
			statusSection.createEl("p", {
				text: "Scanning vaults...",
				cls: "vault-mirror-loading",
			});
		}

		try {
			await this.loadFiles();
			this.isScanned = true;

			const title = contentEl.querySelector("h2");
			contentEl.empty();
			if (title) contentEl.appendChild(title);

			this.createInterface();
		} catch (error) {
			console.error("Error scanning vaults:", error);
			if (statusSection) {
				statusSection.empty();
				statusSection.createEl("p", {
					text: `Error scanning vaults: ${error.message}`,
					cls: "vault-mirror-error",
				});

				// Add retry button
				const retryBtn = statusSection.createEl("button", {
					text: "Try Again",
					cls: "scan-button",
				});
				retryBtn.onclick = () => this.scanVaults();
			}
		}
	}

	async loadFiles() {
		this.sourceFiles = await this.plugin.getMarkdownFiles(
			this.plugin.settings.sourceVaultPath
		);
		this.targetFiles = await this.plugin.getMarkdownFiles(
			this.plugin.settings.targetVaultPath
		);
	}

	createInterface() {
		const { contentEl } = this;

		const mainContainer = contentEl.createDiv({
			cls: "vault-mirror-container",
		});

		const sourceSection = mainContainer.createDiv({ cls: "vault-section" });
		sourceSection.createEl("h3", {
			text: `Source Vault (${this.sourceFiles.length} files)`,
		});
		sourceSection.createEl("p", {
			text: this.plugin.settings.sourceVaultPath,
			cls: "vault-path",
		});

		if (this.sourceFiles.length === 0) {
			sourceSection.createDiv({
				text: "No .md files found",
				cls: "vault-mirror-empty",
			});
		} else {
			const sourceFileList = sourceSection.createDiv({
				cls: "file-list",
			});
			this.createFileList(
				sourceFileList,
				this.sourceFiles,
				this.selectedSourceFiles,
				"source"
			);
		}

		const middleSection = mainContainer.createDiv({
			cls: "middle-section",
		});

		const copyRightBtn = middleSection.createEl("button", {
			text: "Copy →",
			cls: "copy-button",
		});
		copyRightBtn.onclick = () => this.copyToTarget();

		const copyLeftBtn = middleSection.createEl("button", {
			text: "← Copy",
			cls: "copy-button",
		});
		copyLeftBtn.onclick = () => this.copyToSource();

		const refreshBtn = middleSection.createEl("button", {
			text: "↻ Refresh",
			cls: "refresh-button",
		});
		refreshBtn.onclick = () => this.refresh();

		const targetSection = mainContainer.createDiv({ cls: "vault-section" });
		targetSection.createEl("h3", {
			text: `Target Vault (${this.targetFiles.length} files)`,
		});
		targetSection.createEl("p", {
			text: this.plugin.settings.targetVaultPath,
			cls: "vault-path",
		});

		if (this.targetFiles.length === 0) {
			targetSection.createDiv({
				text: "No .md files found",
				cls: "vault-mirror-empty",
			});
		} else {
			const targetFileList = targetSection.createDiv({
				cls: "file-list",
			});
			this.createFileList(
				targetFileList,
				this.targetFiles,
				this.selectedTargetFiles,
				"target"
			);
		}
	}

	createFileList(
		container: HTMLElement,
		files: string[],
		selectedFiles: Set<string>,
		side: "source" | "target"
	) {
		const selectAllContainer = container.createDiv({
			cls: "select-all-container",
		});
		const selectAllCheckbox = selectAllContainer.createEl("input", {
			type: "checkbox",
		});
		selectAllContainer.createSpan({ text: "Select All" });

		const fileContainer = container.createDiv({ cls: "file-items" });

		selectAllCheckbox.onchange = () => {
			if (selectAllCheckbox.checked) {
				files.forEach((file) => selectedFiles.add(file));
			} else {
				selectedFiles.clear();
			}
			this.updateFileList(fileContainer, files, selectedFiles, side);
		};

		this.updateFileList(fileContainer, files, selectedFiles, side);
	}

	updateFileList(
		container: HTMLElement,
		files: string[],
		selectedFiles: Set<string>,
		side: "source" | "target"
	) {
		container.empty();

		files.forEach((file) => {
			const fileItem = container.createDiv({ cls: "file-item" });

			const checkbox = fileItem.createEl("input", { type: "checkbox" });
			checkbox.checked = selectedFiles.has(file);
			checkbox.onchange = () => {
				if (checkbox.checked) {
					selectedFiles.add(file);
				} else {
					selectedFiles.delete(file);
				}
			};

			fileItem.createSpan({ text: file, cls: "file-name" });
		});
	}

	async copyToTarget() {
		if (this.selectedSourceFiles.size === 0) {
			new Notice("No source files selected");
			return;
		}

		const filesToCopy = Array.from(this.selectedSourceFiles);
		await this.plugin.copyFiles(
			filesToCopy,
			this.plugin.settings.sourceVaultPath,
			this.plugin.settings.targetVaultPath
		);

		new Notice(`Copied ${filesToCopy.length} files to target vault`);
		this.selectedSourceFiles.clear();
		await this.refresh();
	}

	async copyToSource() {
		if (this.selectedTargetFiles.size === 0) {
			new Notice("No target files selected");
			return;
		}

		const filesToCopy = Array.from(this.selectedTargetFiles);
		await this.plugin.copyFiles(
			filesToCopy,
			this.plugin.settings.targetVaultPath,
			this.plugin.settings.sourceVaultPath
		);

		new Notice(`Copied ${filesToCopy.length} files to source vault`);
		this.selectedTargetFiles.clear();
		await this.refresh();
	}

	async refresh() {
		if (!this.isScanned) {
			this.createInitialInterface();
			return;
		}

		await this.loadFiles();
		this.selectedSourceFiles.clear();
		this.selectedTargetFiles.clear();

		const { contentEl } = this;
		const title = contentEl.querySelector("h2");
		contentEl.empty();
		if (title) contentEl.appendChild(title);
		this.createInterface();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class VaultMirrorSettingTab extends PluginSettingTab {
	plugin: VaultMirrorPlugin;

	constructor(app: App, plugin: VaultMirrorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Mirror Settings" });

		new Setting(containerEl)
			.setName("Source Vault Path")
			.setDesc("Path to the source vault directory")
			.addText((text) =>
				text
					.setPlaceholder("Enter source vault path")
					.setValue(this.plugin.settings.sourceVaultPath)
					.onChange(async (value) => {
						this.plugin.settings.sourceVaultPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Target Vault Path")
			.setDesc("Path to the target vault directory")
			.addText((text) =>
				text
					.setPlaceholder("Enter target vault path")
					.setValue(this.plugin.settings.targetVaultPath)
					.onChange(async (value) => {
						this.plugin.settings.targetVaultPath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
