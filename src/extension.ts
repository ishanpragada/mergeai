import * as vscode from 'vscode';
import OpenAI from "openai";
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: '' });

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "mergeai" is now active!');

	// Register command to resolve merge conflicts
	const disposable = vscode.commands.registerCommand('mergeai.helloWorld', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found');
			return;
		}

		// Get the document text
		const document = editor.document;
		const text = document.getText();

		// Check if there are merge conflicts
		if (!text.includes('<<<<<<<') || !text.includes('>>>>>>>')) {
			vscode.window.showInformationMessage('No merge conflicts found in this file');
			return;
		}

		// Show progress notification
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzing merge conflicts...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0 });

			// Extract all merge conflicts
			const conflicts = extractMergeConflicts(text);
			if (conflicts.length === 0) {
				vscode.window.showInformationMessage('No valid merge conflicts found');
				return;
			}

			progress.report({ increment: 30, message: `Found ${conflicts.length} conflict(s)` });
			// Create a webview panel to display conflicts and resolutions
			const panel = vscode.window.createWebviewPanel(
				'mergeConflictPanel',
				'Merge Conflict Resolver',
				vscode.ViewColumn.Active,
				{ enableScripts: true }
			);
			// Initialize the webview content with conflicts but no resolutions yet
			let resolutions = new Array(conflicts.length).fill(null);
			updateWebviewContent(panel, conflicts, resolutions);

			// Set up message handling from webview
			panel.webview.onDidReceiveMessage(
				async message => {
					if (message.command === 'applyResolution') {
						await applyResolution(editor, message.index, message.resolution, conflicts[message.index]);
						vscode.window.showInformationMessage(`Applied resolution for conflict #${message.index + 1}`);
					} else if (message.command === 'applyAll') {
						for (let i = 0; i < conflicts.length; i++) {
							if (resolutions[i] && !resolutions[i].startsWith("Error:")) {
								await applyResolution(editor, i, resolutions[i], conflicts[i]);
							}
						}
						vscode.window.showInformationMessage('Applied all resolutions');
					} else if (message.command === 'regenerate') {
						try {
							const preference = message.preference || "";
							const newResolution = preference ? 
								await getAIResolutionWithPreference(conflicts[message.index], preference) : 
								await getAIResolution(conflicts[message.index], true);
							
							resolutions[message.index] = newResolution;
							
							// Update the status in the webview
							panel.webview.postMessage({ 
								command: 'updateGenerationStatus', 
								conflictIndex: message.index,
								status: 'complete'
							});
							
							updateWebviewContent(panel, conflicts, resolutions);
							vscode.window.showInformationMessage(`Regenerated resolution for conflict #${message.index + 1}`);
						} catch (error) {
							console.error('Error regenerating resolution:', error);
							resolutions[message.index] = "Error: Failed to regenerate resolution";
							
							// Update the status in the webview
							panel.webview.postMessage({ 
								command: 'updateGenerationStatus', 
								conflictIndex: message.index,
								status: 'error'
							});
							
							updateWebviewContent(panel, conflicts, resolutions);
							vscode.window.showErrorMessage(`Failed to regenerate resolution for conflict #${message.index + 1}`);
						}
					} else if (message.command === 'generateResolutions') {
						const preference = message.preference || "";
						
						// Create a progress bar in the notification area
						vscode.window.withProgress({
							location: vscode.ProgressLocation.Notification,
							title: `Generating merge resolutions${preference ? " with your preferences" : ""}`,
							cancellable: false
						}, async (progress) => {
							// Calculate the increment per conflict
							const incrementPerConflict = 100 / conflicts.length;
							
							// Process each conflict
							for (let i = 0; i < conflicts.length; i++) {
								// Update the progress notification with the current conflict number
								progress.report({ 
									increment: incrementPerConflict, 
									message: `Resolving conflict ${i + 1} of ${conflicts.length}` 
								});
								
								// Also update the webview to show which conflict is being processed
								panel.webview.postMessage({ 
									command: 'updateGenerationStatus', 
									conflictIndex: i,
									status: 'generating'
								});
					
								try {
									// Get AI suggestion for this conflict
									const resolution = preference ? 
										await getAIResolutionWithPreference(conflicts[i], preference) :
										await getAIResolution(conflicts[i]);
									
									resolutions[i] = resolution;
									
									// Update the webview that this conflict is complete
									panel.webview.postMessage({ 
										command: 'updateGenerationStatus', 
										conflictIndex: i,
										status: 'complete'
									});
									
									// Update the webview with the current resolutions
									updateWebviewContent(panel, conflicts, resolutions);
								} catch (error) {
									console.error('Error resolving conflict:', error);
									resolutions[i] = "Error: Failed to get AI resolution";
									
									// Update the webview that this conflict had an error
									panel.webview.postMessage({ 
										command: 'updateGenerationStatus', 
										conflictIndex: i,
										status: 'error'
									});
									
									updateWebviewContent(panel, conflicts, resolutions);
								}
							}
							
							vscode.window.showInformationMessage("All conflict resolutions generated");
							return Promise.resolve();
						});
					}
				},
				undefined,
				context.subscriptions
			);
		});
	});

	context.subscriptions.push(disposable);
}

// Get AI resolution for a conflict with user preference
async function getAIResolutionWithPreference(conflict: string, preference: string): Promise<string> {
    // Parse the conflict to extract current and incoming changes
    const startMarker = '<<<<<<<';
    const middleMarker = '=======';
    const endMarker = '>>>>>>>';

    const startMarkerPos = conflict.indexOf(startMarker);
    const middleMarkerPos = conflict.indexOf(middleMarker);
    const endMarkerPos = conflict.indexOf(endMarker);

    if (startMarkerPos === -1 || middleMarkerPos === -1 || endMarkerPos === -1) {
        return "Error: Invalid conflict format";
    }

    // Extract current branch (HEAD) content
    const currentStartPos = startMarkerPos + startMarker.length;
    const currentBranch = conflict.substring(currentStartPos, middleMarkerPos).trim();

    // Extract incoming content
    const incomingStartPos = middleMarkerPos + middleMarker.length;
    const incomingBranch = conflict.substring(incomingStartPos, endMarkerPos).trim();

    // Get context if available (a few lines before/after the conflict)
    let contextBefore = "";
    let contextAfter = "";

    // Create prompt for the AI with the user's preference
    const promptText = `
You are a merge conflict resolver. Below is a Git merge conflict. Please analyze both versions and suggest the best resolution, following the user's preference.

CURRENT BRANCH (HEAD):
\`\`\`
${currentBranch}
\`\`\`

INCOMING BRANCH:
\`\`\`
${incomingBranch}
\`\`\`

${contextBefore ? `CONTEXT BEFORE:\n\`\`\`\n${contextBefore}\`\`\`\n` : ''}
${contextAfter ? `CONTEXT AFTER:\n\`\`\`\n${contextAfter}\`\`\`\n` : ''}

USER PREFERENCE:
${preference}

Analyze both versions and provide the resolved code that:
1. Follows the user's stated preference for how to handle the merge
2. Preserves the intended functionality from both versions according to the preference
3. Resolves any logical conflicts
4. Maintains consistent style and formatting
5. Does not include conflict markers

ONLY RETURN THE RESOLVED CODE ITSELF, NO EXPLANATION OR ADDITIONAL TEXT.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a code merge conflict resolution assistant. Your task is to analyze Git merge conflicts and suggest the best resolution. Only provide the resolved code without explanation or conflict markers." },
                { role: "user", content: promptText },
            ]
        });

        const resolution = response.choices[0]?.message?.content?.trim() || "No resolution provided";
        
        // Clean up any remaining markdown code blocks if the AI included them
        return resolution.replace(/```[\w]*\n|```$/g, '').trim();
    } catch (error) {
        console.error('Error fetching AI resolution with preference:', error);
        throw error;
    }
}

// Extract merge conflicts from text
function extractMergeConflicts(text: string): string[] {
	const conflicts: string[] = [];
	let position = 0;

	while (true) {
		const startMarker = '<<<<<<<';
		const middleMarker = '=======';
		const endMarker = '>>>>>>>';

		const startPos = text.indexOf(startMarker, position);
		if (startPos === -1) break;

		const middlePos = text.indexOf(middleMarker, startPos);
		if (middlePos === -1) break;

		const endPos = text.indexOf(endMarker, middlePos);
		if (endPos === -1) break;

		// Find the end of the line where the end marker is
		const endLinePos = text.indexOf('\n', endPos);
		const conflictEndPos = endLinePos !== -1 ? endLinePos : text.length;

		// Extract the entire conflict block
		const conflict = text.substring(startPos, conflictEndPos);
		conflicts.push(conflict);

		// Move position forward
		position = conflictEndPos;
	}

	return conflicts;
}

// Get AI resolution for a conflict
async function getAIResolution(conflict: string, isRegeneration: boolean = false): Promise<string> {
	// Parse the conflict to extract current and incoming changes
	const startMarker = '<<<<<<<';
	const middleMarker = '=======';
	const endMarker = '>>>>>>>';

	const startMarkerPos = conflict.indexOf(startMarker);
	const middleMarkerPos = conflict.indexOf(middleMarker);
	const endMarkerPos = conflict.indexOf(endMarker);

	if (startMarkerPos === -1 || middleMarkerPos === -1 || endMarkerPos === -1) {
		return "Error: Invalid conflict format";
	}

	// Extract current branch (HEAD) content
	const currentStartPos = startMarkerPos + startMarker.length;
	const currentBranch = conflict.substring(currentStartPos, middleMarkerPos).trim();

	// Extract incoming content
	const incomingStartPos = middleMarkerPos + middleMarker.length;
	const incomingBranch = conflict.substring(incomingStartPos, endMarkerPos).trim();

	// Get context if available (a few lines before/after the conflict)
	let contextBefore = "";
	let contextAfter = "";

	// Create prompt for the AI
	const promptText = `
You are a merge conflict resolver. Below is a Git merge conflict. Please analyze both versions and suggest the best resolution.

CURRENT BRANCH (HEAD):
\`\`\`
${currentBranch}
\`\`\`

INCOMING BRANCH:
\`\`\`
${incomingBranch}
\`\`\`

${contextBefore ? `CONTEXT BEFORE:\n\`\`\`\n${contextBefore}\`\`\`\n` : ''}
${contextAfter ? `CONTEXT AFTER:\n\`\`\`\n${contextAfter}\`\`\`\n` : ''}

${isRegeneration ? 'Please provide an alternative resolution approach.' : ''}

Analyze both versions and provide the resolved code that:
1. Preserves the intended functionality from both versions if possible
2. Resolves any logical conflicts
3. Maintains consistent style and formatting
4. Does not include conflict markers

ONLY RETURN THE RESOLVED CODE ITSELF, NO EXPLANATION OR ADDITIONAL TEXT.`;

	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4o",
			messages: [
				{ role: "system", content: "You are a code merge conflict resolution assistant. Your task is to analyze Git merge conflicts and suggest the best resolution. Only provide the resolved code without explanation or conflict markers." },
				{ role: "user", content: promptText },
			]
		});

		const resolution = response.choices[0]?.message?.content?.trim() || "No resolution provided";
		
		// Clean up any remaining markdown code blocks if the AI included them
		return resolution.replace(/```[\w]*\n|```$/g, '').trim();
	} catch (error) {
		console.error('Error fetching AI resolution:', error);
		throw error;
	}
}

// Apply a resolution to the document
async function applyResolution(editor: vscode.TextEditor, index: number, resolution: string, originalConflict: string): Promise<void> {
	const document = editor.document;
	const text = document.getText();
	
	// Find the start and end positions of the conflict in the document
	const startPos = text.indexOf(originalConflict);
	if (startPos === -1) {
		vscode.window.showErrorMessage('Cannot locate the conflict in the document. It may have been modified.');
		return;
	}
	
	const endPos = startPos + originalConflict.length;
	
	// Create a range covering the conflict
	const startPosition = document.positionAt(startPos);
	const endPosition = document.positionAt(endPos);
	const range = new vscode.Range(startPosition, endPosition);
	
	// Replace the conflict with the resolution
	await editor.edit(editBuilder => {
		editBuilder.replace(range, resolution);
	});
}

// Update the webview content
function updateWebviewContent(panel: vscode.WebviewPanel, conflicts: string[], resolutions: string[]): void {
	panel.webview.html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Merge Conflict Resolver</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
					padding: 20px;
					color: #ffffff;
					background-color: #1e1e1e;
				}
				.conflict-container {
					margin-bottom: 30px;
					border: 2px solid #3c3c3c;
					border-radius: 8px;
					overflow: hidden;
					background-color: #1e1e1e;
				}
				.conflict-header, .resolution-header {
					background-color: #333;
					padding: 12px 16px;
					font-weight: bold;
					display: flex;
					justify-content: space-between;
					align-items: center;
					color: #ffffff;
				}
				.conflict-content, .resolution-content {
					padding: 15px;
					background-color: #1e1e1e;
					border-left: 5px solid #d73a49;
					white-space: pre-wrap;
					font-family: 'Courier New', monospace;
					font-size: 14px;
					overflow-x: auto;
					border-radius: 4px;
				}
				.resolution-content {
					border-left: 5px solid #107c10;
				}
				.btn {
					background-color: #0078d7;
					color: white;
					border: none;
					padding: 8px 12px;
					border-radius: 4px;
					cursor: pointer;
					font-size: 12px;
					margin-left: 5px;
				}
				.btn:hover {
					background-color: #106ebe;
				}
				.apply-all-btn {
					background-color: #107c10;
					padding: 12px 18px;
					font-size: 14px;
					margin-bottom: 20px;
					display: ${resolutions.some(r => r !== null) ? 'block' : 'none'};
				}
				.apply-all-btn:hover {
					background-color: #0b5e0b;
				}
				.loading {
					font-style: italic;
					color: #999;
				}
				.active-generation {
					font-style: italic;
					color: #3794ff;
					display: flex;
					align-items: center;
				}
				.active-generation::before {
					content: "";
					display: inline-block;
					width: 12px;
					height: 12px;
					margin-right: 8px;
					border-radius: 50%;
					border: 2px solid #3794ff;
					border-top-color: transparent;
					animation: spin 1s linear infinite;
				}
				@keyframes spin {
					to { transform: rotate(360deg); }
				}
				.generation-error {
					font-style: italic;
					color: #f48771;
				}
				.generation-complete {
					color: #89d185;
				}
				pre {
					font-family: 'Consolas', monospace;
					background-color: #1e1e1e;
					font-size: 12px;
				}
				code {
					color: #d4d4d4;
					background-color: #1e1e1e;
				}
				.token.comment { color: #6a9955; }
				.token.keyword { color: #569cd6; }
				.token.string { color: #ce9178; }
				.token.function { color: #dcdcaa; }
				.token.operator { color: #d4d4d4; }
				.token.punctuation { color: #d4d4d4; }
				.token.number { color: #b5cea8; }
				.merge-preference-container {
					margin-bottom: 20px;
					padding: 15px;
					background-color: #252526;
					border-radius: 8px;
					border: 1px solid #3c3c3c;
				}
				.merge-preference-container label {
					display: block;
					margin-bottom: 8px;
					font-weight: bold;
				}
				.merge-preference-container textarea {
					width: 100%;
					height: 80px;
					background-color: #1e1e1e;
					color: #ffffff;
					border: 1px solid #3c3c3c;
					border-radius: 4px;
					padding: 8px;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
					resize: vertical;
				}
				.merge-preference-container button {
					margin-top: 8px;
				}
				.warning-text {
					color: #f48771;
					font-style: italic;
					margin-top: 8px;
					font-size: 12px;
				}
				.pending-message {
					text-align: center;
					font-style: italic;
					color: #999;
					padding: 20px;
					background-color: #252526;
					border-radius: 8px;
					margin-bottom: 20px;
					display: ${resolutions.some(r => r !== null) ? 'none' : 'block'};
				}
				.progress-container {
					margin-top: 20px;
					display: none;
				}
				.progress-bar {
					height: 6px;
					background-color: #333;
					border-radius: 3px;
					overflow: hidden;
					margin-bottom: 10px;
				}
				.progress-fill {
					height: 100%;
					background-color: #0078d7;
					width: 0%;
					transition: width 0.3s ease-in-out;
				}
				.progress-text {
					font-size: 12px;
					color: #cccccc;
					text-align: center;
				}
			</style>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/prism.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/components/prism-javascript.min.js"></script>
		</head>
		<body>
			<h1>Merge Conflict Resolver</h1>
			<p>Review and apply AI-suggested resolutions for each merge conflict.</p>
			
			<div class="merge-preference-container">
				<label for="merge-preference">Describe how you want the merge to occur:</label>
				<textarea id="merge-preference" placeholder="Example: 'Prefer the incoming changes for feature implementations but keep our error handling logic'" spellcheck="false"></textarea>
				<button id="generateBtn" class="btn">Generate Resolutions</button>
				<div class="warning-text">No resolutions will be generated until you submit your preferences or click Generate.</div>
				
				<div class="progress-container" id="progressContainer">
					<div class="progress-bar">
						<div class="progress-fill" id="progressFill"></div>
					</div>
					<div class="progress-text" id="progressText">Initializing...</div>
				</div>
			</div>
			
			<div class="pending-message">
				No resolutions have been generated yet. Describe your preferences above and click "Generate Resolutions".
			</div>
			
			<button id="applyAllBtn" class="btn apply-all-btn">Apply All Resolutions</button>
			<div id="conflicts-container">
				${conflicts.map((conflict, index) => {
					return `
						<div class="conflict-container" id="conflict-${index}">
							<div class="conflict-header">
								<span>Conflict #${index + 1}</span>
								<span id="status-${index}" class="loading">Waiting for generation...</span>
							</div>
							<pre><code class="language-javascript">${escapeHtml(conflict)}</code></pre>
							<div class="resolution-container">
								<div class="resolution-header">
									<span>AI Resolution</span>
									<div>
										${resolutions[index] !== null ? `
											<button class="btn regenerate-btn" onclick="regenerateResolution(${index})">Regenerate</button>
											<button class="btn" onclick="applyResolution(${index})">Apply</button>
										` : ''}
									</div>
								</div>
								<pre><code class="language-javascript" id="resolution-${index}">
									${resolutions[index] ? escapeHtml(resolutions[index]) : '<span class="loading">Waiting for generation...</span>'}
								</code></pre>
							</div>
						</div>
					`;
				}).join('')}
			</div>
			<script>
				const vscode = acquireVsCodeApi();
				let currentPreference = "";
				let totalConflicts = ${conflicts.length};
				let completedConflicts = 0;
				
				// Handle messages from extension
				window.addEventListener('message', event => {
					const message = event.data;
					
					if (message.command === 'updateGenerationStatus') {
						const statusElement = document.getElementById('status-' + message.conflictIndex);
						
						// Update the status indicator for this conflict
						if (message.status === 'generating') {
							statusElement.className = 'active-generation';
							statusElement.textContent = 'Generating resolution...';
						} else if (message.status === 'complete') {
							statusElement.className = 'generation-complete';
							statusElement.textContent = 'Resolution complete';
							completedConflicts++;
							updateProgressBar();
						} else if (message.status === 'error') {
							statusElement.className = 'generation-error';
							statusElement.textContent = 'Error generating resolution';
							completedConflicts++;
							updateProgressBar();
						}
					}
				});
				
				function updateProgressBar() {
					const progressFill = document.getElementById('progressFill');
					const progressText = document.getElementById('progressText');
					const percentage = Math.round((completedConflicts / totalConflicts) * 100);
					
					progressFill.style.width = percentage + '%';
					progressText.textContent = \`Generating resolutions: \${completedConflicts} of \${totalConflicts} complete (\${percentage}%)\`;
					
					if (completedConflicts >= totalConflicts) {
						progressText.textContent = 'All resolutions generated';
						// Hide progress after a delay
						setTimeout(() => {
							document.getElementById('progressContainer').style.display = 'none';
						}, 3000);
					}
				}
				
				function applyResolution(index) {
					const resolution = document.getElementById('resolution-' + index).innerText;
					vscode.postMessage({ command: 'applyResolution', index: index, resolution: resolution });
				}
				
				function regenerateResolution(index) {
					const statusElement = document.getElementById('status-' + index);
					statusElement.className = 'active-generation';
					statusElement.textContent = 'Regenerating...';
					
					vscode.postMessage({ 
						command: 'regenerate', 
						index: index,
						preference: currentPreference
					});
				}
				
				document.getElementById('applyAllBtn').addEventListener('click', function() {
					vscode.postMessage({ command: 'applyAll' });
				});
				
				document.getElementById('generateBtn').addEventListener('click', function() {
					// Reset counters
					completedConflicts = 0;
					
					// Show progress container
					const progressContainer = document.getElementById('progressContainer');
					progressContainer.style.display = 'block';
					
					// Reset progress bar
					const progressFill = document.getElementById('progressFill');
					const progressText = document.getElementById('progressText');
					progressFill.style.width = '0%';
					progressText.textContent = 'Initializing...';
					
					const preference = document.getElementById('merge-preference').value.trim();
					currentPreference = preference;
					
					// Update status indicators
					for (let i = 0; i < totalConflicts; i++) {
						const statusElement = document.getElementById('status-' + i);
						statusElement.className = 'loading';
						statusElement.textContent = 'Waiting for generation...';
					}
					
					vscode.postMessage({ 
						command: 'generateResolutions', 
						preference: preference 
					});
					
					// Update UI to show we're generating
					document.querySelectorAll('.pending-message').forEach(el => {
						el.style.display = 'none';
					});
					document.getElementById('applyAllBtn').style.display = 'block';
					document.querySelectorAll('[id^="resolution-"]').forEach(el => {
						el.innerHTML = '<span class="loading">Waiting for generation...</span>';
					});
				});
			</script>
		</body>
		</html>
	`;
}

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function deactivate() {}