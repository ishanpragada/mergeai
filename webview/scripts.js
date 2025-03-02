(function() {
    const vscode = acquireVsCodeApi();

    // Store editor elements
    const localEditor = document.getElementById('local-editor');
    const mergedEditor = document.getElementById('merged-editor');
    const remoteEditor = document.getElementById('remote-editor');

    // Store conflict data
    let conflictData = {
        local: [],
        remote: [],
        merged: []
    };

    // Initialize the webview
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'setConflicts':
                setConflictData(message.local, message.remote);
                break;
        }
    });

    function setConflictData(localLines, remoteLines) {
        conflictData.local = localLines;
        conflictData.remote = remoteLines;
        conflictData.merged = [];
        
        renderEditors();
        highlightCurrentConflict();
    }

    function renderEditors() {
        // Clear editors
        localEditor.innerHTML = '';
        remoteEditor.innerHTML = '';
        mergedEditor.innerHTML = '';

        // Render local changes
        conflictData.local.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.textContent = line;
            lineElement.classList.add('conflict-line', 'local-conflict');
            lineElement.dataset.index = index;
            lineElement.dataset.source = 'local';
            lineElement.addEventListener('click', () => acceptChange('local', index));
            localEditor.appendChild(lineElement);
        });

        // Render remote changes
        conflictData.remote.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.textContent = line;
            lineElement.classList.add('conflict-line', 'remote-conflict');
            lineElement.dataset.index = index;
            lineElement.dataset.source = 'remote';
            lineElement.addEventListener('click', () => acceptChange('remote', index));
            remoteEditor.appendChild(lineElement);
        });

        // Render merged content
        conflictData.merged.forEach(item => {
            const lineElement = document.createElement('div');
            lineElement.textContent = item.content;
            lineElement.classList.add('conflict-line');
            lineElement.classList.add(item.source === 'local' ? 'local-conflict' : 'remote-conflict');
            mergedEditor.appendChild(lineElement);
        });

        updateHints();
    }

    function acceptChange(source, index) {
        const content = source === 'local' ? conflictData.local[index] : conflictData.remote[index];
        conflictData.merged.push({
            content,
            source
        });
        
        // Mark the line as accepted in both editors
        const sourceEditor = source === 'local' ? localEditor : remoteEditor;
        const otherEditor = source === 'local' ? remoteEditor : localEditor;
        
        sourceEditor.children[index].classList.add('accepted');
        if (otherEditor.children[index]) {
            otherEditor.children[index].classList.add('rejected');
        }
        
        renderEditors();
    }

    function updateHints() {
        const hint = document.getElementById('keyboard-hints');
        hint.innerHTML = `
            <div class="hint">
                <kbd>←</kbd> Accept local change
                <kbd>→</kbd> Accept remote change
                <kbd>↑</kbd> Previous conflict
                <kbd>↓</kbd> Next conflict
                <kbd>Space</kbd> Skip current conflict
            </div>
        `;
    }

    // Handle keyboard navigation
    let currentIndex = 0;

    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case 'ArrowLeft':
                // Accept local change
                if (currentIndex < conflictData.local.length) {
                    acceptChange('local', currentIndex);
                    currentIndex++;
                }
                break;
            case 'ArrowRight':
                // Accept remote change
                if (currentIndex < conflictData.remote.length) {
                    acceptChange('remote', currentIndex);
                    currentIndex++;
                }
                break;
            case 'ArrowUp':
                // Previous conflict
                if (currentIndex > 0) {
                    currentIndex--;
                    highlightCurrentConflict();
                }
                break;
            case 'ArrowDown':
            case ' ':
                // Next conflict
                if (currentIndex < Math.max(conflictData.local.length, conflictData.remote.length) - 1) {
                    currentIndex++;
                    highlightCurrentConflict();
                }
                break;
        }
    });

    function highlightCurrentConflict() {
        // Remove current highlight from all lines
        document.querySelectorAll('.current-conflict').forEach(el => {
            el.classList.remove('current-conflict');
        });
        
        // Add highlight to current lines
        const localLine = localEditor.children[currentIndex];
        const remoteLine = remoteEditor.children[currentIndex];
        
        if (localLine) localLine.classList.add('current-conflict');
        if (remoteLine) remoteLine.classList.add('current-conflict');
    }

    // Handle commit changes
    document.getElementById('commitChanges').addEventListener('click', () => {
        if (conflictData.merged.length === 0) {
            vscode.postMessage({
                command: 'showError',
                message: 'Please accept some changes before committing'
            });
            return;
        }

        const resolvedCode = conflictData.merged.map(item => item.content).join('\n');
        vscode.postMessage({
            command: 'commitResolution',
            resolvedCode
        });
    });
})();