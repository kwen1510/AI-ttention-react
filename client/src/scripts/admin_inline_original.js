const socket = io();
    let sessionCode = null;
    const groups = new Map();
    let elapsedInterval = null;
    let recordingStart = null;
let heartbeatInterval = null;
let connectionCheckInterval = null;
let lastHeartbeatTime = Date.now();
let isConnected = true;
let promptLibrary = [];
const queryParams = new URLSearchParams(window.location.search);
let pendingPromptFromQuery = queryParams.get('prompt') || null;

const startActiveClasses = ['bg-green-500', 'hover:bg-green-600', 'text-white', 'border-green-600'];
const startInactiveClasses = ['bg-gray-300', 'hover:bg-gray-300', 'text-gray-500', 'border-gray-300'];
const stopActiveClasses = ['bg-red-500', 'hover:bg-red-600', 'text-white', 'border-red-600'];
const stopInactiveClasses = ['bg-gray-300', 'hover:bg-gray-400', 'text-black', 'border-slate-300'];

function updateRecordingButtons(isRecording) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (!startBtn || !stopBtn) return;

    const applyClasses = (element, addClasses, removeClasses) => {
        removeClasses.forEach(cls => element.classList.remove(cls));
        addClasses.forEach(cls => element.classList.add(cls));
    };

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        applyClasses(startBtn, startInactiveClasses, startActiveClasses);
        applyClasses(stopBtn, stopActiveClasses, stopInactiveClasses);
        startBtn.classList.add('cursor-not-allowed');
        stopBtn.classList.remove('cursor-not-allowed');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        applyClasses(startBtn, startActiveClasses, startInactiveClasses);
        applyClasses(stopBtn, stopInactiveClasses, stopActiveClasses);
        startBtn.classList.remove('cursor-not-allowed');
        stopBtn.classList.add('cursor-not-allowed');
    }
}

function resetUI(preserveGroups = false) {
    if (!preserveGroups) {
        groups.clear();
        document.getElementById('groupsGrid').innerHTML = '';
            document.getElementById('groupsGrid').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
        } else {
            groups.forEach((g, num) => {
                g.transcripts = [];
                g.summary = null;
                g.stats = {};
                g.cumulativeTranscript = null;
                g.uploadErrors = 0;
                updateGroup(num, {});
            });
    }
    document.getElementById('timeElapsed').textContent = '0:00';
    if (elapsedInterval) {
        clearInterval(elapsedInterval);
        elapsedInterval = null;
    }
    updateRecordingButtons(false);
}
    
    // Error handling
    function showErrorToast(message) {
        const errorToast = document.getElementById('errorToast');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        errorToast.classList.remove('hidden');
        errorToast.classList.add('animate-slide-up');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            hideErrorToast();
        }, 10000);
    }
    
    function hideErrorToast() {
        const errorToast = document.getElementById('errorToast');
        errorToast.classList.add('hidden');
        errorToast.classList.remove('animate-slide-up');
    }
    
    // Initialize Lucide icons
    document.addEventListener('DOMContentLoaded', () => {
        try {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
                console.log('✅ Lucide icons initialized successfully');
            } else {
                console.warn('⚠️ Lucide library not loaded, using fallback icons');
                showFallbackIcons();
            }
        } catch (error) {
            console.error('❌ Error initializing Lucide icons:', error);
            showFallbackIcons();
        }
    });
    
    // Backup initialization with timeout
    setTimeout(() => {
        try {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
                console.log('✅ Lucide icons re-initialized via timeout');
            } else {
                console.warn('⚠️ Lucide library still not loaded, using fallback icons');
                showFallbackIcons();
            }
        } catch (error) {
            console.error('❌ Error in backup icon initialization:', error);
            showFallbackIcons();
        }
    }, 1000);
    
    // Show fallback SVG icons if Lucide fails to load
    function showFallbackIcons() {
        const lucideIcons = document.querySelectorAll('[data-lucide]');
        const fallbackIcons = document.querySelectorAll('.lucide-fallback');
        
        lucideIcons.forEach(icon => {
            icon.style.display = 'none';
        });
        
        fallbackIcons.forEach(icon => {
            icon.style.display = 'inline-block';
        });
        
        console.log('🔄 Switched to fallback icons');
    }
    
    // Connection status management
    function updateConnectionStatus(connected) {
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        
        if (connected && !isConnected) {
            // Reconnected
            dot.className = 'w-2 h-2 bg-green-400 rounded-full animate-ping-slow';
            text.textContent = 'Connected';
            text.className = 'text-xs font-medium text-black';
            isConnected = true;
            console.log('🟢 Admin dashboard connected');
        } else if (!connected && isConnected) {
            // Disconnected
            dot.className = 'w-2 h-2 bg-red-400 rounded-full animate-pulse';
            text.textContent = 'Disconnected';
            text.className = 'text-xs font-medium text-red-200';
            isConnected = false;
            console.log('🔴 Admin dashboard disconnected');
            showErrorToast('Connection lost. Attempting to reconnect...');
        }
    }
    
    // Start heartbeat system
    function startHeartbeat() {
        // Send heartbeat every 10 seconds
        heartbeatInterval = setInterval(() => {
            if (socket.connected && sessionCode) {
                socket.emit('admin_heartbeat', { sessionCode });
                console.log('💓 Admin heartbeat sent');
            }
        }, 10000);
        
        // Check connection status every 3 seconds with tighter threshold
        connectionCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastHeartbeat = now - lastHeartbeatTime;
            
            // Consider disconnected if no heartbeat response in 25 seconds
            if (timeSinceLastHeartbeat > 25000) {
                updateConnectionStatus(false);
            } else {
                updateConnectionStatus(true);
            }
        }, 3000);
    }
    
    // Stop heartbeat system
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
            connectionCheckInterval = null;
        }
    }
    
    // Default prompt
    const DEFAULT_PROMPT = "Summarise the following classroom discussion in ≤6 clear bullet points:";
    
    // Create new session on page load
    fetch('/api/new-session')
        .then(res => res.json())
        .then(data => {
            sessionCode = data.code;
            document.getElementById('sessionCode').textContent = sessionCode;
            socket.emit('admin_join', { code: sessionCode });
            
            // Start heartbeat system
            startHeartbeat();
            
            // Load saved prompt for this session
            loadSessionPrompt();
        })
        .catch(err => {
            console.error('Failed to create session:', err);
            showErrorToast('Failed to create session. Please refresh the page.');
        });
    
    // Prompt Editor Functions
    function togglePromptEditor() {
        const editor = document.getElementById('promptEditor');
        const chevron = document.getElementById('promptChevron');
        
        if (editor.classList.contains('hidden')) {
            editor.classList.remove('hidden');
            chevron.classList.add('rotate-180');
        } else {
            editor.classList.add('hidden');
            chevron.classList.remove('rotate-180');
        }
    }

    function collapsePromptEditor() {
        const editor = document.getElementById('promptEditor');
        const chevron = document.getElementById('promptChevron');
        if (editor && !editor.classList.contains('hidden')) {
            editor.classList.add('hidden');
        }
        if (chevron) {
            chevron.classList.remove('rotate-180');
        }
    }

    function removeQueryParams(...keys) {
        const url = new URL(window.location.href);
        keys.forEach(key => url.searchParams.delete(key));
        const newSearch = url.searchParams.toString();
        const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`;
        window.history.replaceState({}, document.title, newUrl);
    }

    function applyPromptFromQuery() {
        if (!pendingPromptFromQuery) return;
        document.getElementById('promptText').value = pendingPromptFromQuery;
        collapsePromptEditor();
        showPromptFeedback('Prompt loaded from prompt library', 'success');
        removeQueryParams('prompt', 'mode');
        pendingPromptFromQuery = null;
    }
    
    function resetToDefaultPrompt() {
        document.getElementById('promptText').value = DEFAULT_PROMPT;
        showPromptFeedback('Prompt reset to default', 'info');
        collapsePromptEditor();
    }
    
    async function savePrompt() {
        const promptText = document.getElementById('promptText').value.trim();
        
        if (!promptText) {
            showPromptFeedback('Please enter a prompt before saving', 'error');
            return;
        }
        
        try {
            // Emit to server so it can use the latest text immediately without DB
            socket.emit('prompt_update', { sessionCode, prompt: promptText });
            const response = await fetch(`/api/session/${sessionCode}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptText })
            });
            
            if (response.ok) {
                showPromptFeedback('Prompt saved successfully! It will be used for all new summaries.', 'success');
                collapsePromptEditor();
            } else {
                const error = await response.json();
                showPromptFeedback(`Failed to save prompt: ${error.error || error.message || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving prompt:', err);
            showPromptFeedback('Error saving prompt. Please try again.', 'error');
        }
    }
    
    async function testPrompt() {
        const promptText = document.getElementById('promptText').value.trim();
        
        if (!promptText) {
            showPromptFeedback('Please enter a prompt before testing', 'error');
            return;
        }
        
        // Sample classroom discussion text for testing
        const sampleText = "Student A: I think renewable energy is really important for our future. Student B: Yeah, but what about the costs? Solar panels are expensive. Student C: True, but they save money in the long run. Teacher: Great points! What about government incentives? Student A: Oh right, there are tax credits that help reduce the initial cost. Student B: That makes it more affordable then. Student C: Plus think about the environmental benefits - reduced carbon emissions, cleaner air. Teacher: Excellent discussion on the economic and environmental aspects of renewable energy.";
        
        try {
            showPromptFeedback('Testing prompt... This may take a few seconds.', 'info');
            
            const response = await fetch('/api/test-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: sampleText,
                    customPrompt: promptText 
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showPromptFeedback(`Test successful! Sample output: "${result.summary}"`, 'success');
            } else {
                showPromptFeedback(`Test failed: ${result.error}`, 'error');
            }
        } catch (err) {
            console.error('Error testing prompt:', err);
            showPromptFeedback('Error testing prompt. Please try again.', 'error');
        }
    }
    
    async function loadSessionPrompt() {
        try {
            const response = await fetch(`/api/session/${sessionCode}/prompt`);
            if (response.ok) {
                const data = await response.json();
                if (data.prompt) {
                    document.getElementById('promptText').value = data.prompt;
                }
            }
        } catch (err) {
            console.log('No saved prompt found, using default');
        } finally {
            if (pendingPromptFromQuery) {
                applyPromptFromQuery();
            }
        }
    }
    
    function showPromptFeedback(message, type) {
        const feedback = document.getElementById('promptFeedback');
        const colors = {
            success: 'bg-green-50 border-green-200 text-green-800',
            error: 'bg-red-50 border-red-200 text-red-800',
            info: 'bg-blue-50 border-blue-200 text-blue-800'
        };
        
        feedback.className = `p-4 rounded-lg border ${colors[type]}`;
        feedback.textContent = message;
        feedback.classList.remove('hidden');
        
        // Auto-hide after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                feedback.classList.add('hidden');
            }, 5000);
        }
    }

    // ----- Prompt Library -----
    async function loadPromptLibrary() {
        try {
            const res = await fetch('/api/prompt-library');
            promptLibrary = res.ok ? await res.json() : [];
        } catch (err) {
            console.error('Failed to load prompt library:', err);
            promptLibrary = [];
        }

        const list = document.getElementById('promptList');
        list.innerHTML = '';
        promptLibrary.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = 'border px-3 py-2 rounded flex justify-between items-center';
            li.innerHTML = `
                <span class="flex-1 mr-2">${item.name}</span>
                <div class="space-x-2 text-sm">
                    <button onclick="usePrompt(${idx})" class="text-blue-600">Use</button>
                    <button onclick="editPrompt(${idx})" class="text-yellow-600">Edit</button>
                    <button onclick="deletePrompt(${idx})" class="text-red-600">Delete</button>
                </div>`;
            list.appendChild(li);
        });
    }

    async function addPromptToLibrary() {
        const nameInput = document.getElementById('newPromptName');
        const text = document.getElementById('promptText').value.trim();
        const name = nameInput.value.trim();
        if (!name || !text) return;
        try {
            const res = await fetch('/api/prompt-library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, text })
            });
            if (res.ok) {
                nameInput.value = '';
                showPromptFeedback('Prompt saved to library', 'success');
                await loadPromptLibrary();
            } else {
                showPromptFeedback('Failed to save prompt', 'error');
            }
        } catch (err) {
            console.error('Failed to save prompt:', err);
            showPromptFeedback('Failed to save prompt', 'error');
        }
    }

    function usePrompt(index) {
        if (promptLibrary[index]) {
            document.getElementById('promptText').value = promptLibrary[index].text;
            collapsePromptEditor();
            showPromptFeedback('Prompt loaded from library', 'success');
        }
    }

    async function editPrompt(index) {
        const item = promptLibrary[index];
        if (!item) return;
        const newName = prompt('Edit prompt name', item.name);
        if (newName !== null) {
            try {
                await fetch(`/api/prompt-library/${item._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                await loadPromptLibrary();
            } catch (err) {
                console.error('Failed to update prompt:', err);
            }
        }
    }

    async function deletePrompt(index) {
        const item = promptLibrary[index];
        if (!item) return;
        try {
            await fetch(`/api/prompt-library/${item._id}`, { method: 'DELETE' });
            await loadPromptLibrary();
        } catch (err) {
            console.error('Failed to delete prompt:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', loadPromptLibrary);
    
    function showTemporaryMessage(message, type) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
        
        const colors = {
            success: 'bg-green-50 border-green-200 text-green-800 border',
            error: 'bg-red-50 border-red-200 text-red-800 border',
            info: 'bg-blue-50 border-blue-200 text-blue-800 border'
        };
        
        notification.className += ` ${colors[type]}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Auto-hide after 4 seconds
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    // Format timestamp
    function formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    
    // Format duration
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Format summary text with proper bullet points and line breaks
    function formatSummaryText(text) {
        if (!text) return '';
        
        return text
            // Replace bullet point markers with HTML
            .replace(/^[-•·*]\s+/gm, '<li>')
            .replace(/^\d+\.\s+/gm, '<li>')
            // Wrap lines that start with <li> in a ul
            .split('\n')
            .map(line => {
                line = line.trim();
                if (line.startsWith('<li>')) {
                    return line + '</li>';
                }
                return line;
            })
            .join('\n')
            // Group consecutive <li> items into <ul>
            .replace(/(<li>.*?<\/li>\n?)+/gs, match => `<ul class="list-disc list-inside space-y-1 mb-3">${match}</ul>`)
            // Replace double line breaks with paragraphs
            .replace(/\n\n+/g, '</p><p class="mb-3">')
            // Wrap in paragraph if not already wrapped
            .replace(/^(?!<[pu])/gm, '<p class="mb-3">')
            .replace(/(?<!>)$/gm, '</p>')
            // Clean up empty paragraphs
            .replace(/<p class="mb-3"><\/p>/g, '')
            .replace(/^<p class="mb-3">/, '')
            .replace(/<\/p>$/, '');
    }

    // Toggle transcript expansion
    function toggleTranscripts(groupNumber) {
        const transcriptDiv = document.getElementById(`transcripts-${groupNumber}`);
        const toggleBtn = document.getElementById(`toggle-${groupNumber}`);
        
        if (transcriptDiv.classList.contains('expanded')) {
            transcriptDiv.classList.remove('expanded');
            toggleBtn.innerHTML = `
                <svg class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
                <span class="ml-2">Show Full Transcript</span>
            `;
        } else {
            transcriptDiv.classList.add('expanded');
            toggleBtn.innerHTML = `
                <svg class="w-4 h-4 transition-transform duration-200 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
                <span class="ml-2">Show Less</span>
            `;
        }
    }
    
    // Update or create group element
    function updateGroup(groupNumber, data) {
        // Hide empty state and show grid
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('groupsGrid').classList.remove('hidden');
        
        let groupEl = document.getElementById(`group-${groupNumber}`);
        if (!groupEl) {
            groupEl = document.createElement('div');
            groupEl.id = `group-${groupNumber}`;
            groupEl.className = 'group-card animate-fade-in';
            document.getElementById('groupsGrid').appendChild(groupEl);
        }
        
        // Update group data
        const groupData = groups.get(groupNumber) || {
            transcripts: [],
            summary: null,
            stats: {},
            lastUpdate: Date.now(),
            cumulativeTranscript: null,
            uploadErrors: 0 // Track upload errors
        };
        
        // Handle existing transcripts (when loading from database)
        if (data.existingTranscripts && data.existingTranscripts.length > 0) {
            groupData.transcripts = data.existingTranscripts;
        } else if (data.latestTranscript) {
            // Handle new transcript (real-time updates)
            groupData.transcripts.push({
                text: data.latestTranscript,
                timestamp: Date.now(),
                duration: data.transcriptDuration || 0,
                wordCount: data.transcriptWordCount || 0
            });
            if (groupData.transcripts.length > 10) {
                groupData.transcripts = groupData.transcripts.slice(-10); // Keep last 10
            }
        }
        
        // Store cumulative transcript if provided
        if (data.cumulativeTranscript) {
            groupData.cumulativeTranscript = data.cumulativeTranscript;
        }
        
        if (data.summary) {
            groupData.summary = {
                text: data.summary,
                timestamp: Date.now()
            };
        }
        if (data.stats) {
            groupData.stats = data.stats;
        }
        
        // Handle upload errors
        if (data.uploadError) {
            groupData.uploadErrors++;
            showErrorToast(`Group ${groupNumber}: ${data.uploadError}`);
        }
        
        groups.set(groupNumber, groupData);
        
        // Update UI
        groupEl.innerHTML = `
            <div class="group-card-content bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-xl">
                <!-- Group Header -->
                <div class="bg-white text-black p-6 border border-slate-200 rounded-xl shadow-sm">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <span class="text-lg font-bold">${groupNumber}</span>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold">Group ${groupNumber}</h3>
                                <p class="text-black/70 text-sm">${groupData.stats.totalSegments || 0} segments</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            ${data.isActive ? 
                                '<div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div><span class="text-sm font-medium">Active</span>' :
                                '<div class="w-3 h-3 bg-gray-400 rounded-full"></div><span class="text-sm">Waiting</span>'
                            }
                            ${groupData.uploadErrors > 0 ? 
                                `<div class="w-3 h-3 bg-red-400 rounded-full animate-pulse ml-2"></div><span class="text-xs text-red-200">${groupData.uploadErrors} errors</span>` :
                                ''
                            }
                        </div>
                    </div>
                </div>

                <!-- Summary Section -->
                <div class="group-card-body p-6 border-b border-gray-100">
                    <div class="flex items-center mb-3">
                        <div class="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center mr-3">
                            <svg class="w-4 h-4 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                        </div>
                        <h4 class="font-semibold text-gray-900">Live Summary</h4>
                        ${groupData.summary ? `<span class="ml-auto text-xs text-gray-500">${formatTime(groupData.summary.timestamp)}</span>` : ''}
                    </div>
                    ${groupData.summary ? `
                        <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-l-4 border-purple-400">
                            <div class="text-gray-800 leading-relaxed prose prose-sm max-w-none">
                                ${formatSummaryText(groupData.summary.text)}
                            </div>
                        </div>
                    ` : `
                        <div class="bg-gray-50 rounded-lg p-4 text-center">
                            <svg class="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                            </svg>
                            <p class="text-gray-500 text-sm">No summary available yet</p>
                        </div>
                    `}

                    <!-- Transcript Section -->
                    <div class="mt-6">
                        <button 
                            id="toggle-${groupNumber}"
                            onclick="toggleTranscripts(${groupNumber})"
                            class="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors duration-200"
                        >
                            <svg class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                            <span class="ml-2 font-medium">Show Full Transcript</span>
                        </button>
                        
                        <div id="transcripts-${groupNumber}" class="transcript-expand space-y-3">
                            ${(() => {
                                const transcripts = groupData.transcripts || [];
                                const latestTranscript = transcripts.length ? transcripts[transcripts.length - 1] : null;
                                const previousTranscripts = transcripts.length > 1 ? transcripts.slice(0, -1).reverse() : [];
                                
                                let html = '';
                                
                                // Show loading state if no data yet
                                if (transcripts.length === 0 && !data.isActive) {
                                    html += `
                                        <div class="text-center py-8 text-gray-500">
                                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                                            <p class="text-sm">Loading transcripts...</p>
                                        </div>
                                    `;
                                    return html;
                                }
                                
                                // Show cumulative conversation if available (like student interface)
                                if (groupData.cumulativeTranscript && latestTranscript) {
                                    html += `
                                        <div class="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400 mb-4">
                                            <div class="flex items-center mb-2">
                                                <span class="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded uppercase tracking-wide">Full Conversation</span>
                                                <span class="ml-2 text-xs text-gray-500">${formatTime(latestTranscript.timestamp)}</span>
                                            </div>
                                            <div class="text-gray-800 mb-3 leading-relaxed">${groupData.cumulativeTranscript}</div>
                                            <div class="text-xs text-gray-500 border-t pt-2 mt-2">
                                                <span class="font-medium">Latest chunk:</span> "${latestTranscript.text}"
                                            </div>
                                        </div>
                                    `;
                                } else if (latestTranscript) {
                                    // Fallback to individual transcript display if no cumulative text
                                    html += `
                                        <div class="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400 mb-4">
                                            <div class="flex items-center mb-2">
                                                <span class="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded uppercase tracking-wide">Latest Transcript</span>
                                                <span class="ml-2 text-xs text-gray-500">${latestTranscript.duration ? `${latestTranscript.duration.toFixed(1)}s` : 'Unknown duration'}</span>
                                            </div>
                                            <div class="text-gray-800 mb-2 font-medium leading-relaxed">${latestTranscript.text}</div>
                                            <div class="flex items-center justify-between text-xs text-gray-500">
                                                <span>${formatTime(latestTranscript.timestamp)}</span>
                                                ${latestTranscript.wordCount ? `<span>${latestTranscript.wordCount} words</span>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }
                                
                                // Show previous transcripts below
                                if (previousTranscripts.length > 0) {
                                    html += `
                                        <h5 class="text-xs font-semibold text-gray-500 mb-2">Previous Transcripts</h5>
                                        <div class="space-y-2">
                                            ${previousTranscripts.map(transcript => `
                                                <div class="bg-gray-50 rounded p-3 text-sm">
                                                    <div class="text-gray-800 mb-1">${transcript.text}</div>
                                                    <div class="text-xs text-gray-500">
                                                        ${formatTime(transcript.timestamp)} • 
                                                        ${transcript.wordCount} words • 
                                                        ${transcript.duration ? transcript.duration.toFixed(1) + 's' : 'No duration'}
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `;
                                }
                                
                                // Show empty state if no transcripts
                                if (!latestTranscript && previousTranscripts.length === 0 && data.isActive) {
                                    html += `
                                        <div class="text-center py-8 text-gray-500">
                                            <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                                            </svg>
                                            <p>No transcripts yet</p>
                                        </div>
                                    `;
                                }
                                
                                return html;
                            })()}
                        </div>
                    </div>
                </div>

                <!-- Stats Footer -->
                <div class="bg-gray-50 px-6 py-4 grid grid-cols-3 gap-4 text-center">
                    <div class="flex flex-col items-center">
                        <div class="text-lg font-bold text-indigo-600">${groupData.stats.totalWords || 0}</div>
                        <div class="text-xs text-gray-500 uppercase tracking-wide">Words</div>
                    </div>
                    <div class="flex flex-col items-center">
                        <div class="text-lg font-bold text-green-600">${formatDuration(groupData.stats.totalDuration)}</div>
                        <div class="text-xs text-gray-500 uppercase tracking-wide">Duration</div>
                    </div>
                    <div class="flex flex-col items-center">
                        <div class="text-lg font-bold text-purple-600">${groupData.stats.totalSegments || 0}</div>
                        <div class="text-xs text-gray-500 uppercase tracking-wide">Segments</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Socket event handlers
    socket.on('student_joined', ({ group, socketId }) => {
        console.log(`Student joined group ${group}`);
        updateGroup(group, { isActive: true });
        
        // Fetch existing data for this group
        fetch(`/api/transcripts/${sessionCode}/${group}`)
            .then(async res => {
                if (!res.ok) return { transcripts: [], summary: null, stats: {} };
                return res.json();
            })
            .then(data => {
                // Format existing transcripts with proper structure
                const formattedTranscripts = data.transcripts.map(t => ({
                    text: t.text,
                    timestamp: new Date(t.created_at).getTime(),
                    duration: t.duration_seconds || 0,
                    wordCount: t.word_count || 0
                }));
                
                updateGroup(group, {
                    latestTranscript: data.transcripts[0]?.text,
                    transcriptDuration: data.transcripts[0]?.duration_seconds || 0,
                    transcriptWordCount: data.transcripts[0]?.word_count || 0,
                    summary: data.summary?.text,
                    stats: data.stats,
                    isActive: true,
                    existingTranscripts: formattedTranscripts
                });
            })
            .catch(err => {
                console.error('Failed to fetch group data:', err);
                updateGroup(group, { 
                    isActive: true, 
                    uploadError: 'Failed to load existing data' 
                });
            });
    });
    
    socket.on('admin_update', (data) => {
        console.log('Received admin update:', data);
        updateGroup(data.group, {
            latestTranscript: data.latestTranscript,
            cumulativeTranscript: data.cumulativeTranscript,
            summary: data.summary,
            stats: data.stats,
            isActive: true
        });
        
        // Add subtle animation to show update
        const groupEl = document.getElementById(`group-${data.group}`);
        if (groupEl) {
            groupEl.classList.add('animate-bounce-subtle');
            setTimeout(() => groupEl.classList.remove('animate-bounce-subtle'), 1000);
            
            // Add a brief highlight to the latest transcript
            const latestTranscriptEl = groupEl.querySelector('.bg-blue-50');
            if (latestTranscriptEl) {
                latestTranscriptEl.classList.add('ring-2', 'ring-blue-300');
                setTimeout(() => {
                    latestTranscriptEl.classList.remove('ring-2', 'ring-blue-300');
                }, 2000);
            }
        }
    });
    
    // Handle upload errors
    socket.on('upload_error', (data) => {
        console.error('Upload error received:', data);
        updateGroup(data.group, { 
            uploadError: data.error,
            isActive: true
        });
    });

    socket.on('session_reset', () => {
        console.log('Session reset received');
        resetUI();
    });
    
    // Heartbeat and connection event handlers
    socket.on('admin_heartbeat_ack', () => {
        lastHeartbeatTime = Date.now();
        console.log('💓 Admin heartbeat acknowledged');
    });
    
    socket.on('connect', () => {
        console.log('🔌 Admin socket connected');
        updateConnectionStatus(true);
        lastHeartbeatTime = Date.now();
        
        // Rejoin current session if we have one
        if (sessionCode) {
            socket.emit('admin_join', { code: sessionCode });
            console.log(`🔄 Rejoining session: ${sessionCode}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Admin socket disconnected');
        updateConnectionStatus(false);
    });
    
    // Initialize prompt library on page load
    document.addEventListener('DOMContentLoaded', () => {
        loadPromptLibrary();
        
        // Add form submission handler for create prompt modal
        document.getElementById('createPromptForm').addEventListener('submit', handleCreatePromptSubmit);

        // Wire up start/stop recording controls (summary mode)
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const intervalInput = document.getElementById('intervalInput');
        updateRecordingButtons(false);

        startBtn.addEventListener('click', async () => {
            if (!sessionCode) {
                console.warn('No sessionCode yet');
                return;
            }
            if (startBtn.disabled) return;
            try {
                startBtn.disabled = true;
                stopBtn.disabled = true;
                const seconds = parseInt(intervalInput.value) || 30;
                const intervalMs = seconds * 1000;
                const res = await fetch(`/api/session/${sessionCode}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interval: intervalMs })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                updateRecordingButtons(true);
                intervalInput.disabled = true;
                recordingStart = Date.now();
                if (elapsedInterval) clearInterval(elapsedInterval);
                elapsedInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
                    const m = Math.floor(elapsed / 60);
                    const s = elapsed % 60;
                    document.getElementById('timeElapsed').textContent = `${m}:${s.toString().padStart(2,'0')}`;
                }, 1000);
            } catch (e) {
                console.error('Failed to start session:', e);
                updateRecordingButtons(false);
                intervalInput.disabled = false;
            }
        });

        stopBtn.addEventListener('click', async () => {
            if (!sessionCode) return;
            if (stopBtn.disabled) return;
            try {
                stopBtn.disabled = true;
                const res = await fetch(`/api/session/${sessionCode}/stop`, { method: 'POST' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                // UI state
                if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
                document.getElementById('timeElapsed').textContent = '0:00';
                intervalInput.disabled = false;
                updateRecordingButtons(false);
            } catch (e) {
                console.error('Failed to stop session:', e);
                updateRecordingButtons(true);
            }
        });

        /* ===== DEV ONLY: Button to trigger simulated disconnects for testing =====
           Usage (in browser console):
           // All students in this session for 5s
           socket.emit('dev_simulate_disconnect', { sessionCode, target: 'all', durationMs: 5000 });
           // Only group 1 for 8s
           socket.emit('dev_simulate_disconnect', { sessionCode, target: 'group', group: 1, durationMs: 8000 });
           Requires server env: ALLOW_DEV_TEST=true
        */
        window.devSimDisconnectAll = (ms=5000) => socket.emit('dev_simulate_disconnect', { sessionCode, target: 'all', durationMs: ms });
        window.devSimDisconnectGroup = (grp=1, ms=5000) => socket.emit('dev_simulate_disconnect', { sessionCode, target: 'group', group: grp, durationMs: ms });
        /* ===== END DEV ONLY ===== */

        // DEV temporary disconnect test removed
    });
    
    // ===================
    // PROMPT MANAGEMENT
    // ===================
    
    let currentPrompts = [];
    let availableCategories = [];
    
    // Load prompt library from API
    async function loadPromptLibrary() {
        try {
            const response = await fetch('/api/prompts?mode=summary&limit=50');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            currentPrompts = data.prompts;
            availableCategories = data.filters.categories;
            
            updateCategoryFilter();
            displayPromptLibrary(data.prompts);
            
        } catch (err) {
            console.error('❌ Failed to load prompt library:', err);
            document.getElementById('promptLibraryGrid').innerHTML = `
                <div class="flex items-center justify-center py-8 text-red-500 text-sm col-span-full">
                    <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                    Failed to load prompts: ${err.message}
                </div>
            `;
            lucide.createIcons();
        }
    }
    
    // Refresh prompt library
    function refreshPromptLibrary() {
        document.getElementById('promptLibraryGrid').innerHTML = `
            <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                <i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i>
                Refreshing prompts...
            </div>
        `;
        lucide.createIcons();
        loadPromptLibrary();
    }
    
    // Update category filter options
    function updateCategoryFilter() {
        const categoryFilter = document.getElementById('promptCategoryFilter');
        const currentValue = categoryFilter.value;
        
        // Clear existing options (except "All Categories")
        while (categoryFilter.children.length > 1) {
            categoryFilter.removeChild(categoryFilter.lastChild);
        }
        
        // Add category options
        availableCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        
        // Restore selection
        categoryFilter.value = currentValue;
    }
    
    // Display prompt library
    function displayPromptLibrary(prompts) {
        const grid = document.getElementById('promptLibraryGrid');
        
        if (prompts.length === 0) {
            grid.innerHTML = `
                <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                    <i data-lucide="file-text" class="w-4 h-4 mr-2"></i>
                    No prompts found
                </div>
            `;
            lucide.createIcons();
            return;
        }
        
        const promptsHtml = prompts.map(prompt => `
            <div class="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200" onclick="loadPrompt('${prompt._id}')">
                <div class="flex items-start justify-between mb-2">
                    <h5 class="text-sm font-medium text-gray-900 truncate flex-1 mr-2">${prompt.title}</h5>
                    <div class="flex items-center space-x-1 flex-shrink-0">
                        ${prompt.isPublic ? '<i data-lucide="globe" class="w-3 h-3 text-green-500" title="Public"></i>' : '<i data-lucide="lock" class="w-3 h-3 text-gray-400" title="Private"></i>'}
                        <button onclick="event.stopPropagation(); editPrompt('${prompt._id}')" class="text-blue-500 hover:text-blue-700" title="Edit">
                            <i data-lucide="edit" class="w-3 h-3"></i>
                        </button>
                        <button onclick="event.stopPropagation(); deletePrompt('${prompt._id}')" class="text-red-500 hover:text-red-700" title="Delete">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
                <p class="text-xs text-gray-600 mb-2 line-clamp-2">${prompt.description || 'No description'}</p>
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-800">
                            ${prompt.category}
                        </span>
                        ${prompt.tags && prompt.tags.length > 0 ? `<span class="text-xs text-gray-500">+${prompt.tags.length} tags</span>` : ''}
                    </div>
                    <div class="text-xs text-gray-500">
                        ${prompt.usage_count || 0} uses
                    </div>
                </div>
            </div>
        `).join('');
        
        grid.innerHTML = promptsHtml;
        lucide.createIcons();
    }
    
    // Filter prompts
    function filterPrompts() {
        const search = document.getElementById('promptSearch').value.toLowerCase();
        const category = document.getElementById('promptCategoryFilter').value;
        
        let filteredPrompts = currentPrompts.filter(prompt => {
            const matchesSearch = !search || 
                prompt.title.toLowerCase().includes(search) ||
                (prompt.description && prompt.description.toLowerCase().includes(search)) ||
                prompt.content.toLowerCase().includes(search) ||
                (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(search)));
            
            const matchesCategory = !category || prompt.category === category;
            
            return matchesSearch && matchesCategory;
        });
        
        displayPromptLibrary(filteredPrompts);
    }
    
    // Load a prompt into the current editor
    async function loadPrompt(promptId) {
        try {
            const response = await fetch(`/api/prompts/${promptId}/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionCode: sessionCode || 'web-interface' })
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            document.getElementById('promptText').value = data.prompt.content;
            
            showPromptFeedback(`✅ Loaded prompt: "${data.prompt.title}"`, 'success');
            
        } catch (err) {
            console.error('❌ Failed to load prompt:', err);
            showPromptFeedback(`❌ Failed to load prompt: ${err.message}`, 'error');
        }
    }
    
    // Open create prompt modal
    function openCreatePromptModal() {
        document.getElementById('createPromptModalTitle').textContent = 'Create New Prompt';
        document.getElementById('createPromptSubmitText').textContent = 'Create Prompt';
        document.getElementById('createPromptForm').reset();
        document.getElementById('editPromptId').value = '';
        document.getElementById('newPromptMode').value = 'summary';
        document.getElementById('createPromptModal').classList.remove('hidden');
    }
    
    // Close create prompt modal
    function closeCreatePromptModal() {
        document.getElementById('createPromptModal').classList.add('hidden');
    }
    
    // Edit prompt
    async function editPrompt(promptId) {
        try {
            const response = await fetch(`/api/prompts/${promptId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const prompt = data.prompt;
            
            document.getElementById('createPromptModalTitle').textContent = 'Edit Prompt';
            document.getElementById('createPromptSubmitText').textContent = 'Update Prompt';
            document.getElementById('editPromptId').value = prompt._id;
            document.getElementById('newPromptTitle').value = prompt.title;
            document.getElementById('newPromptDescription').value = prompt.description || '';
            document.getElementById('newPromptContent').value = prompt.content;
            document.getElementById('newPromptCategory').value = prompt.category;
            document.getElementById('newPromptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
            document.getElementById('newPromptVisibility').value = prompt.isPublic.toString();
            document.getElementById('newPromptAuthor').value = prompt.authorName || '';
            document.getElementById('newPromptMode').value = prompt.mode;
            
            document.getElementById('createPromptModal').classList.remove('hidden');
            
        } catch (err) {
            console.error('❌ Failed to load prompt for editing:', err);
            alert(`Failed to load prompt: ${err.message}`);
        }
    }
    
    // Delete prompt
    async function deletePrompt(promptId) {
        const prompt = currentPrompts.find(p => p._id === promptId);
        if (!prompt) return;
        
        if (!confirm(`Are you sure you want to delete "${prompt.title}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/prompts/${promptId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            showPromptFeedback(`✅ Deleted prompt: "${prompt.title}"`, 'success');
            refreshPromptLibrary();
            
        } catch (err) {
            console.error('❌ Failed to delete prompt:', err);
            showPromptFeedback(`❌ Failed to delete prompt: ${err.message}`, 'error');
        }
    }
    
    // Handle create/edit prompt form submission
    async function handleCreatePromptSubmit(e) {
        e.preventDefault();
        
        const promptId = document.getElementById('editPromptId').value;
        const isEdit = Boolean(promptId);
        
        const formData = {
            title: document.getElementById('newPromptTitle').value,
            description: document.getElementById('newPromptDescription').value,
            content: document.getElementById('newPromptContent').value,
            category: document.getElementById('newPromptCategory').value,
            mode: document.getElementById('newPromptMode').value,
            tags: document.getElementById('newPromptTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
            isPublic: document.getElementById('newPromptVisibility').value === 'true',
            authorName: document.getElementById('newPromptAuthor').value
        };
        
        try {
            const url = isEdit ? `/api/prompts/${promptId}` : '/api/prompts';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            
            showPromptFeedback(`✅ ${isEdit ? 'Updated' : 'Created'} prompt: "${formData.title}"`, 'success');
            closeCreatePromptModal();
            refreshPromptLibrary();
            
        } catch (err) {
            console.error('❌ Failed to save prompt:', err);
            alert(`Failed to save prompt: ${err.message}`);
        }
    }
    
    // Save current prompt as new
    function saveCurrentPrompt() {
        const currentPromptText = document.getElementById('promptText').value;
        if (!currentPromptText.trim()) {
            alert('Please enter a prompt first');
            return;
        }
        
        document.getElementById('newPromptContent').value = currentPromptText;
        document.getElementById('newPromptTitle').value = '';
        document.getElementById('newPromptDescription').value = '';
        openCreatePromptModal();
    }
    
    // Show prompt feedback
    function showPromptFeedback(message, type = 'info') {
        const feedback = document.getElementById('promptFeedback');
        const bgColor = type === 'success' ? 'bg-green-100 text-green-800' : 
                       type === 'error' ? 'bg-red-100 text-red-800' : 
                       'bg-blue-100 text-blue-800';
        
        feedback.className = `p-4 rounded-lg ${bgColor}`;
        feedback.textContent = message;
        feedback.classList.remove('hidden');
        
        setTimeout(() => {
            feedback.classList.add('hidden');
        }, 5000);
    }
    
    // Close modal on outside click
    document.getElementById('createPromptModal').addEventListener('click', (e) => {
        if (e.target.id === 'createPromptModal') {
            closeCreatePromptModal();
        }
    });
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('createPromptModal').classList.contains('hidden')) {
            closeCreatePromptModal();
        }
    });

    // QR modal helpers
    function openQrModal() {
        const codeEl = document.getElementById('sessionCode');
        const code = (codeEl?.textContent || '').trim();
        if (!code) return;
        const url = `${window.location.origin}/student.html?code=${encodeURIComponent(code)}`;
        const container = document.getElementById('qrCodeContainer');
        const linkEl = document.getElementById('qrLink');
        if (container) {
            container.innerHTML = '';
            try { new QRCode(container, { text: url, width: 220, height: 220 }); } catch (_) {}
        }
        if (linkEl) linkEl.textContent = url;
        const modal = document.getElementById('qrModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        try { if (window.lucide) window.lucide.createIcons(); } catch (_) {}
    }

    function closeQrModal() {
        const modal = document.getElementById('qrModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }