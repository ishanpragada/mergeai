import * as vscode from 'vscode';
import { MergeConflictHandler } from './mergeHandler';

export function activate(context: vscode.ExtensionContext) {
    const mergeHandler = new MergeConflictHandler(context);

    let resolveCommand = vscode.commands.registerCommand('mergeai.resolveMergeConflict', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            mergeHandler.handleMergeConflict(activeEditor);
        } else {
            vscode.window.showErrorMessage('Please open a file with merge conflicts first.');
        }
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

    let openHandler = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.getText().includes('<<<<<<<')) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
                vscode.window.showInformationMessage(
                    'Merge conflicts detected. Would you like to resolve them?',
                    'Yes', 'No'
                ).then(selection => {
                    if (selection === 'Yes') {
                        mergeHandler.handleMergeConflict(editor);
                    }
                });
            }
        }
    });

	console.log('Congratulations, your extension "mergeai" is now active!');
		


    context.subscriptions.push(resolveCommand, openHandler);
}



export function deactivate() {}