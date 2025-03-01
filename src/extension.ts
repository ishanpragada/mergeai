import * as vscode from 'vscode';
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: 'put key here' });

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "mergeai" is now active!');

	const disposable = vscode.commands.registerCommand('mergeai.helloWorld', async () => {
		const panel = vscode.window.createWebviewPanel(
			'inputPanel',
			'User Input',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);

		panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>User Input</title>
			</head>
			<body style="background-color: #f0f0f0; display: flex; flex-direction: column; align-items: center; padding: 20px;">
				<textarea id="userInput" placeholder="Type here..." style="width: 100%; height: 150px; padding: 8px;"></textarea>
				<button id="submitBtn" style="margin-top: 10px; padding: 10px;">Submit</button>
				<div id="response" style="margin-top: 20px; padding: 10px; background-color: white; width: 100%; min-height: 50px;">Response will appear here...</div>
				<script>
					const vscode = acquireVsCodeApi();
					document.getElementById('submitBtn').addEventListener('click', () => {
						const input = document.getElementById('userInput').value;
						document.getElementById('response').innerText = 'Processing...';
						vscode.postMessage({ command: 'submit', text: input });
					});

					window.addEventListener('message', event => {
						const message = event.data;
						if (message.command === 'response') {
							document.getElementById('response').innerText = message.text;
						}
					});
				</script>
			</body>
			</html>
		`;

		panel.webview.onDidReceiveMessage(
			async message => {
				if (message.command === 'submit') {
					console.log(`User input: ${message.text}`);
					vscode.window.showInformationMessage(`Processing input...`);

					try {
						const response = await openai.chat.completions.create({
							model: "gpt-4o",
							messages: [
								{ role: "system", content: "You are a helpful assistant." },
								{ role: "user", content: message.text },
							]
						});

						const reply = response.choices[0]?.message?.content || "No response from AI.";
						panel.webview.postMessage({ command: 'response', text: reply });
					} catch (error) {
						console.error('Error fetching response:', error);
						panel.webview.postMessage({ command: 'response', text: `Error fetching response:` });
					}
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
