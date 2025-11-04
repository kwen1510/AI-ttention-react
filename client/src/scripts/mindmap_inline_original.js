// Dynamic API base URL - works in both development and production
        const API_BASE_URL = (() => {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return 'http://localhost:10000';
            }
            // In production, always use HTTPS and current host
            return `https://${window.location.host}`;
        })();
        
        console.log('🌐 API Base URL:', API_BASE_URL);
        
        let currentSession = null;
        let currentMindmapData = null;
        let chatHistory = [];
        let isRecording = false;
        let mediaRecorder = null;
        let audioChunks = [];
        let recognition = null;
        let sessionStartedAt = null;
        let sessionActiveStartMs = null;
        let sessionAccumulatedMs = 0;
        let durationTimer = null;
        let stream = null;
        let chunkInterval = 20000; // Default 20 seconds
        let recordingTimeout = null;
        let initialTextCollapsed = true;
        const mindmapQueryParams = new URLSearchParams(window.location.search);
        let pendingMindmapPromptFromQuery = mindmapQueryParams.get('prompt');
        let pendingMindmapTopicFromQuery = mindmapQueryParams.get('topic');

        // Mindmap editor elements
        const mindmapSidebarMode = document.getElementById('mindmapSidebarMode');
        const mindmapSidebarHint = document.getElementById('mindmapSidebarHint');
        const mindmapSidebarSelected = document.getElementById('mindmapSidebarSelected');
        const mindmapSidebarNodeLabel = document.getElementById('mindmapSidebarNodeLabel');
        const mindmapSidebarContext = document.getElementById('mindmapSidebarContext');
        const mindmapSidebarActions = document.getElementById('mindmapSidebarActions');
        const mindmapSidebarExamples = document.getElementById('mindmapSidebarExamples');
        const mindmapExampleCountInput = document.getElementById('mindmapExampleCount');
        const mindmapGenerateExamplesBtn = document.getElementById('mindmapGenerateExamplesBtn');
        const mindmapDeleteNodeBtn = document.getElementById('mindmapDeleteNodeBtn');
        const mindmapLayoutRightBtn = document.getElementById('mindmapLayoutRightBtn');
        const mindmapLayoutBothBtn = document.getElementById('mindmapLayoutBothBtn');
        const resumeRecordingBtn = document.getElementById('resumeRecordingBtn');
        const stopRecordingBtn = document.getElementById('stopRecordingMainBtn');

        let mindmapEditorInitialized = false;
        let mindmapLayoutMode = 'right';
        let mindmapSelectedNodePath = null;
        let mindmapSvgSelection = null;
        let mindmapZoomBehavior = null;
        let mindmapCurrentZoomTransform = null;
        let mindmapLastFitTransform = null;

        function generateMindmapNodeId() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }

        function ensureMindmapNodeIds(node) {
            if (!node || typeof node !== 'object') return;
            if (!node.id) {
                node.id = generateMindmapNodeId();
            }
            if (Array.isArray(node.children)) {
                node.children.forEach(child => ensureMindmapNodeIds(child));
            } else {
                node.children = [];
            }
        }

        function getMindmapNodeKey(node) {
            if (!node) return null;
            if (node.id) return `id:${node.id}`;
            const normalized = normalizeNodeName(node.name);
            return normalized ? `name:${normalized}` : null;
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
            setupEventListeners();
        });

        function setupEventListeners() {
            document.getElementById('generateBtn').addEventListener('click', generateInitialMindmap);
            document.getElementById('clearBtn').addEventListener('click', clearAll);
            document.getElementById('startRecordingBtn').addEventListener('click', () => startAutoRecording(false));
            if (stopRecordingBtn) stopRecordingBtn.addEventListener('click', stopRecording);
            if (resumeRecordingBtn) resumeRecordingBtn.addEventListener('click', () => startAutoRecording(true));
            document.getElementById('toggleChatBtn').addEventListener('click', toggleChatPanel);
            document.getElementById('hideChatBtn').addEventListener('click', hideChatPanel);
            document.getElementById('recenterBtn').addEventListener('click', recenterMindmap);
            document.getElementById('resetSessionBtn').addEventListener('click', resetSession);
            document.getElementById('saveSessionBtn').addEventListener('click', saveSession);
            document.getElementById('intervalInput').addEventListener('change', updateInterval);
            // Initialize interval input to default 20s on first load
            const ii = document.getElementById('intervalInput');
            if (ii) { ii.value = '20'; updateInterval(); }

            const toggleInitialTextBtn = document.getElementById('initialTextToggleBtn');
            if (toggleInitialTextBtn) {
                toggleInitialTextBtn.addEventListener('click', () => {
                    setInitialTextCollapsed(!initialTextCollapsed);
                });
            }

            // Collapse initial text by default unless prefilled
            const initialTextInput = document.getElementById('initialTextInput');
            const shouldCollapse = !(initialTextInput && initialTextInput.value.trim().length > 0);
            setInitialTextCollapsed(shouldCollapse);

            initializeMindmapEditor();
            updateRecordingButtons();
            applyMindmapParamsFromQuery();
            updateStartTimeDisplay();
            updateDurationDisplay();
        }

        function updateRecordingButtons() {
            const startBtn = document.getElementById('startRecordingBtn');
            if (!startBtn) return;

            if (!currentSession) {
                startBtn.classList.remove('hidden');
                if (resumeRecordingBtn) resumeRecordingBtn.classList.add('hidden');
            } else {
                startBtn.classList.add('hidden');
                if (resumeRecordingBtn) {
                    if (isRecording) {
                        resumeRecordingBtn.classList.add('hidden');
                    } else {
                        resumeRecordingBtn.classList.remove('hidden');
                    }
                }
            }

            if (stopRecordingBtn) {
                stopRecordingBtn.classList.toggle('hidden', !isRecording);
            }
        }

        function setInitialTextCollapsed(collapsed) {
            const wrapper = document.getElementById('initialTextWrapper');
            const toggleBtn = document.getElementById('initialTextToggleBtn');
            const toggleText = document.getElementById('initialTextToggleText');
            initialTextCollapsed = !!collapsed;

            if (!wrapper || !toggleBtn || !toggleText) return;

            if (initialTextCollapsed) {
                wrapper.classList.add('hidden');
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleText.textContent = 'Add initial text';
            } else {
                wrapper.classList.remove('hidden');
                toggleBtn.setAttribute('aria-expanded', 'true');
                toggleText.textContent = 'Hide initial text';
            }
        }

        function applyMindmapParamsFromQuery() {
            if (!pendingMindmapPromptFromQuery && !pendingMindmapTopicFromQuery) return;

            const topicInput = document.getElementById('mainTopicInput');
            const initialTextInput = document.getElementById('initialTextInput');

            if (pendingMindmapTopicFromQuery && topicInput) {
                topicInput.value = pendingMindmapTopicFromQuery;
            }

            if (pendingMindmapPromptFromQuery && initialTextInput) {
                initialTextInput.value = pendingMindmapPromptFromQuery;
                setInitialTextCollapsed(false);
            }

            if (pendingMindmapPromptFromQuery || pendingMindmapTopicFromQuery) {
                showMindmapToast('Prompt loaded from prompt library', 'success');
                const url = new URL(window.location.href);
                url.searchParams.delete('prompt');
                url.searchParams.delete('topic');
                url.searchParams.delete('mode');
                const newSearch = url.searchParams.toString();
                history.replaceState({}, document.title, `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`);
            }

            pendingMindmapPromptFromQuery = null;
            pendingMindmapTopicFromQuery = null;
        }

        function updateInterval() {
            const intervalInput = document.getElementById('intervalInput');
            const currentIntervalDisplay = document.getElementById('currentInterval');
            
            if (intervalInput) {
                const intervalSeconds = parseInt(intervalInput.value) || 10;
                chunkInterval = intervalSeconds * 1000;
                if (currentIntervalDisplay) {
                    currentIntervalDisplay.textContent = intervalSeconds;
                }
            }
        }

        function updateStatus(message, type = 'info') {
            const statusEl = document.getElementById('uploadStatus');
            if (statusEl) {
                statusEl.textContent = message;
                statusEl.className = type === 'error' ? 'text-red-600' : 
                                   type === 'success' ? 'text-green-600' : 
                                   type === 'processing' ? 'text-blue-600' : 'text-gray-600';
            }
        }

        async function startAutoRecording(isResume = false) {
            if (isRecording) {
                updateStatus('Recording already in progress', 'info');
                return;
            }

            const topicInput = document.getElementById('mainTopicInput');
            let mainTopic = topicInput ? topicInput.value.trim() : '';

            if (!currentSession && !mainTopic) {
                showError('Please enter a main topic before starting to record.');
                return;
            }

            if (currentSession && !mainTopic) {
                mainTopic = currentSession.mainTopic;
            }

            try {
                updateInterval();

                if (!currentSession) {
                    await createMindmapSession(mainTopic);
                } else if (topicInput && !topicInput.value) {
                    topicInput.value = currentSession.mainTopic;
                }

                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: 16000,
                        echoCancellation: true,
                        noiseSuppression: true
                    }
                });

                isRecording = true;

                const setupSection = document.getElementById('setupSection');
                const interfaceSection = document.getElementById('mindmapInterface');
                const statusBanner = document.getElementById('recordingStatus');
                const intervalInput = document.getElementById('intervalInput');

                if (setupSection) setupSection.classList.add('hidden');
                if (interfaceSection) interfaceSection.classList.remove('hidden');
                if (statusBanner) statusBanner.classList.remove('hidden');
                if (intervalInput) intervalInput.disabled = true;

                updateRecordingButtons();
                startDurationTimer({ resume: isResume });

                startRecordingCycle();
                updateStatus(isResume ? 'Recording resumed' : 'Recording started', 'success');

                console.log(
                    `🎤 ${isResume ? 'Resumed' : 'Started'} auto-recording for topic: ${mainTopic} with ${chunkInterval / 1000}s intervals`
                );

            } catch (error) {
                console.error('❌ Failed to start auto-recording:', error);
                showError('Failed to start recording: ' + error.message);
                isRecording = false;

                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    stream = null;
                }

                updateRecordingButtons();
            }
        }

        async function startRecordingCycle() {
            if (!isRecording || !stream) return;
            
            try {
                console.log(`🎬 Starting new recording cycle (${chunkInterval}ms)`);
                
                // Use proper WebM/Opus format
                const options = { mimeType: 'audio/webm;codecs=opus' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options.mimeType = 'audio/webm';
                }
                
                mediaRecorder = new MediaRecorder(stream, options);
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        console.log(`📦 Received audio chunk: ${event.data.size} bytes`);
                        uploadChunk(event.data);
                    }
                };
                
                mediaRecorder.onerror = (event) => {
                    console.error("❌ MediaRecorder error:", event.error);
                    updateStatus("Recording error", "error");
                };
                
                mediaRecorder.onstop = () => {
                    console.log(`⏹️ Recording cycle stopped`);
                    
                    // If still recording, start the next cycle
                    if (isRecording) {
                        setTimeout(() => {
                            startRecordingCycle();
                        }, 100); // Brief pause between cycles
                    }
                };
                
                // Start recording
                mediaRecorder.start();
                
                // Stop recording after the specified interval
                recordingTimeout = setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        console.log(`⏰ Stopping recording after ${chunkInterval}ms`);
                        mediaRecorder.stop();
                    }
                }, chunkInterval);
                
            } catch (err) {
                console.error("❌ Failed to start recording cycle:", err);
                updateStatus("Recording cycle failed", "error");
            }
        }

        async function uploadChunk(blob) {
            const maxRetries = 3;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                try {
                    const formData = new FormData();
                    formData.append('file', blob, `chunk_${Date.now()}.webm`);
                    formData.append('sessionCode', currentSession.code);
                    formData.append('mode', 'mindmap'); // Indicate this is for mindmap processing
                    
                    console.log(`📤 Uploading chunk (attempt ${retryCount + 1}/${maxRetries}): ${blob.size} bytes`);
                    
                    updateStatus(`Uploading audio... (${retryCount + 1}/${maxRetries})`, "processing");
                    
                    // Add timeout to prevent hanging uploads
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                    
                    const response = await fetch(`${API_BASE_URL}/api/transcribe-mindmap-chunk`, {
                        method: 'POST',
                        body: formData,
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Upload failed: ${response.status} ${errorText}`);
                    }
                    
                    const result = await response.json();
                    console.log("✅ Chunk uploaded and processed:", result);
                    
                    // Update mindmap if we got new data
                    if (result.success && result.mindmapData) {
                        currentMindmapData = mergeMindmapTrees(result.mindmapData, currentMindmapData);
                        ensureMindmapNodeIds(currentMindmapData);
                        renderMindmap(currentMindmapData);
                        
                        // Always add to chat (even if hidden) - users can see it when they expand
                        if (result.transcript) {
                            addChatMessage('user', result.transcript);
                            if (result.message) {
                                addChatMessage('ai', result.message, result.rawAiResponse);
                            }
                        }
                        
                        updateStatus("Academic content added", "success");
                    } else if (result.success && result.filtered) {
                        // Content was filtered out as non-academic
                        updateStatus("Content filtered (non-academic)", "info");
                        
                        // Always add to chat to show what was filtered (even when hidden)
                        if (result.transcript) {
                            addChatMessage('user', result.transcript);
                            addChatMessage('ai', '🔍 ' + (result.message || 'Content filtered: no academic value detected'), result.rawAiResponse);
                        }
                    } else if (result.transcript && result.transcript.trim()) {
                        updateStatus("Transcribed (no changes)", "info");
                    } else {
                        updateStatus("No speech detected", "info");
                    }
                    
                    // Success - exit retry loop
                    return;
                    
                } catch (err) {
                    console.error(`❌ Upload attempt ${retryCount + 1} failed:`, err);
                    retryCount++;
                    
                    if (retryCount < maxRetries) {
                        // Wait before retrying (exponential backoff)
                        const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
                        updateStatus(`Upload failed, retrying in ${delay/1000}s...`, "error");
                        
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        // All retries failed
                        console.error("❌ All upload attempts failed:", err);
                        updateStatus(`Upload failed: ${err.message}`, "error");
                    }
                }
            }
        }

        function stopRecording() {
            if (!isRecording) return;
            isRecording = false;
            
            if (recordingTimeout) {
                clearTimeout(recordingTimeout);
                recordingTimeout = null;
            }
            
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
            
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            
            const statusBanner = document.getElementById('recordingStatus');
            if (statusBanner) statusBanner.classList.add('hidden');
            
            const intervalInput = document.getElementById('intervalInput');
            if (intervalInput) intervalInput.disabled = false;
            
            updateRecordingButtons();
            stopDurationTimer();
            updateStatus('Recording paused', 'info');
            console.log('🎤 Paused auto-recording');
        }

        function updateStartTimeDisplay() {
            const sessionStartTimeEl = document.getElementById('sessionStartTime');
            if (sessionStartTimeEl) {
                sessionStartTimeEl.textContent = sessionStartedAt
                    ? sessionStartedAt.toLocaleTimeString()
                    : '-';
            }
        }

        function getSessionDurationSeconds() {
            const activeMs = sessionActiveStartMs ? Date.now() - sessionActiveStartMs : 0;
            const totalMs = sessionAccumulatedMs + activeMs;
            return Math.max(0, Math.floor(totalMs / 1000));
        }

        function updateDurationDisplay() {
            const sessionDurationEl = document.getElementById('sessionDuration');
            if (!sessionDurationEl) return;
            const durationSeconds = getSessionDurationSeconds();
            const minutes = Math.floor(durationSeconds / 60);
            const seconds = durationSeconds % 60;
            sessionDurationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        function startDurationTimer({ resume = false } = {}) {
            if (!sessionStartedAt) {
                sessionStartedAt = new Date();
                updateStartTimeDisplay();
            } else if (!resume) {
                // Reset accumulated timer when starting fresh without resume
                sessionAccumulatedMs = 0;
                updateStartTimeDisplay();
            }

            if (durationTimer) {
                clearInterval(durationTimer);
            }

            sessionActiveStartMs = Date.now();
            updateDurationDisplay();
            durationTimer = setInterval(updateDurationDisplay, 1000);
        }

        function stopDurationTimer({ reset = false } = {}) {
            if (durationTimer) {
                clearInterval(durationTimer);
                durationTimer = null;
            }
            if (sessionActiveStartMs) {
                sessionAccumulatedMs += Date.now() - sessionActiveStartMs;
                sessionActiveStartMs = null;
            }
            if (reset) {
                sessionAccumulatedMs = 0;
                sessionStartedAt = null;
                updateStartTimeDisplay();
            }
            updateDurationDisplay();
        }

        async function createMindmapSession(mainTopic) {
            const sessionCode = 'MINDMAP-' + Math.floor(Math.random() * 10000);
            const sessionResponse = await fetch(`${API_BASE_URL}/api/mindmap/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionCode, 
                    mainTopic, 
                    interval: 30000 
                })
            });

            if (!sessionResponse.ok) {
                const err = await sessionResponse.json().catch(() => ({}));
                throw new Error(err?.error || err?.message || 'Failed to create session');
            }

            currentSession = { 
                code: sessionCode, 
                mainTopic,
                startTime: new Date(),
                nodeCount: 0,
                speechCount: 0
            };
            sessionStartedAt = new Date();
            sessionAccumulatedMs = 0;
            sessionActiveStartMs = null;
            updateStartTimeDisplay();
            updateDurationDisplay();
            
            // Safe DOM updates with null checks
            const sessionCodeEl = document.getElementById('sessionCode');
            if (sessionCodeEl) sessionCodeEl.textContent = sessionCode;
            
            const currentTopicEl = document.getElementById('currentTopic');
            if (currentTopicEl) currentTopicEl.textContent = mainTopic;
            
            const sessionInfoBar = document.getElementById('sessionInfoBar');
            if (sessionInfoBar) sessionInfoBar.classList.remove('hidden');
            
            // Start duration timer
            startDurationTimer();
            
            // Initialize mindmap with main topic as root
            currentMindmapData = {
                id: generateMindmapNodeId(),
                name: mainTopic,
                children: []
            };
            ensureMindmapNodeIds(currentMindmapData);
            mindmapLayoutMode = 'right';
            mindmapSelectedNodePath = null;
            
            // Render initial mindmap with topic as root
            renderMindmap(currentMindmapData);
            
            // Enable chat
            const chatInput = document.getElementById('chatInput');
            const sendBtn = document.getElementById('sendBtn');
            if (chatInput) chatInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            
            updateRecordingButtons();
            console.log('✅ Created mindmap session:', sessionCode, 'with topic:', mainTopic);
        }

        function recenterMindmap() {
            const container = document.getElementById('mindmapContainer');
            const vis = container ? container.__mindmapVisualization : null;
            if (vis && typeof vis.fitToView === 'function') {
                vis.fitToView(true);
            } else if (currentMindmapData) {
                renderMindmap(currentMindmapData);
            }
        }

        function resetSession() {
            const confirmed = window.confirm('Restart this mindmap session? The page will refresh and any current progress will be lost.');
            if (!confirmed) return;
            window.location.reload();
        }

        async function saveSession() {
            if (!currentSession || !currentMindmapData) {
                showError('No active session to save.');
                return;
            }

            try {
                // Calculate session duration
                const duration = getSessionDurationSeconds();
                
                // Count nodes in mindmap
                const nodeCount = countNodes(currentMindmapData);
                
                // Prepare session metadata
                const sessionMetadata = {
                    sessionCode: currentSession.code,
                    mainTopic: currentSession.mainTopic,
                    startTime: sessionStartedAt?.toISOString() || new Date().toISOString(),
                    endTime: new Date().toISOString(),
                    duration: duration,
                    durationFormatted: formatDuration(duration),
                    nodeCount: nodeCount,
                    speechInputs: currentSession.speechCount || 0,
                    mindmapData: currentMindmapData,
                    chatHistory: chatHistory,
                    version: "1.0",
                    savedAt: new Date().toISOString()
                };

                // Save to backend database
                const saveResponse = await fetch(`${API_BASE_URL}/api/mindmap/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sessionMetadata)
                });

                if (saveResponse.ok) {
                    // Also download as JSON file
                    const jsonData = JSON.stringify(sessionMetadata, null, 2);
                    const blob = new Blob([jsonData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `mindmap_${currentSession.mainTopic.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    // Show success message
                    addChatMessage('ai', `✅ Session saved successfully! Duration: ${formatDuration(duration)}, Nodes: ${nodeCount}`, null);
                } else {
                    throw new Error('Failed to save to server');
                }

            } catch (error) {
                console.error('❌ Error saving session:', error);
                
                // Fallback: just download the file
                const fallbackDuration = getSessionDurationSeconds();
                const sessionMetadata = {
                    sessionCode: currentSession.code,
                    mainTopic: currentSession.mainTopic,
                    startTime: sessionStartedAt?.toISOString() || new Date().toISOString(),
                    duration: fallbackDuration,
                    mindmapData: currentMindmapData,
                    chatHistory: chatHistory,
                    savedAt: new Date().toISOString(),
                    note: "Saved locally due to server error"
                };

                const jsonData = JSON.stringify(sessionMetadata, null, 2);
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mindmap_${currentSession.mainTopic.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showError('Session saved locally, but could not sync with server: ' + error.message);
            }
        }

        function countNodes(node) {
            if (!node) return 0;
            let count = 1; // Count current node
            if (node.children) {
                node.children.forEach(child => {
                    count += countNodes(child);
                });
            }
            return count;
        }

        function formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }

        async function processSpeechText(text) {
            if (!text || !currentSession) {
                return;
            }

            try {
                console.log('🧠 Processing speech:', text);
                
                // Increment speech count
                currentSession.speechCount = (currentSession.speechCount || 0) + 1;
                
                // Show processing in chat (always, even if hidden)
                addChatMessage('user', text);
                var thinkingId = addChatMessage('ai', 'Processing speech and updating mindmap...', null, true);

                let response, result;

                // If this is the first speech input, generate initial mindmap
                if (!currentMindmapData || currentMindmapData.children.length === 0) {
                    response = await fetch(`${API_BASE_URL}/api/mindmap/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            sessionCode: currentSession.code, 
                            text: text 
                        })
                    });
                } else {
                    // Expand existing mindmap
                    response = await fetch(`${API_BASE_URL}/api/mindmap/expand`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            sessionCode: currentSession.code, 
                            text: text 
                        })
                    });
                }

                result = await response.json();
                
                // Remove thinking indicator (always)
                const thinkingEl = document.getElementById(thinkingId);
                if (thinkingEl) thinkingEl.remove();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to process speech');
                }

                // Update current mindmap data
                currentMindmapData = mergeMindmapTrees(result.data, currentMindmapData);
                ensureMindmapNodeIds(currentMindmapData);

                // Re-render mindmap
                renderMindmap(currentMindmapData);

                // Always add AI response to chat (even if hidden)
                addChatMessage('ai', result.message || 'Mindmap updated successfully!', result.rawAiResponse);

                console.log('✅ Successfully processed speech and updated mindmap');

            } catch (error) {
                console.error('❌ Error processing speech:', error);
                // Always add error message to chat
                addChatMessage('ai', 'Sorry, I encountered an error while processing your speech: ' + error.message, null);
            }
        }

        function toggleChatPanel() {
            const chatPanel = document.getElementById('chatPanel');
            const toggleBtn = document.getElementById('toggleChatBtn');
            
            if (chatPanel.classList.contains('hidden')) {
                chatPanel.classList.remove('hidden');
                toggleBtn.innerHTML = '<i data-lucide="message-circle" class="w-4 h-4 mr-2"></i>Hide AI Chat';
            } else {
                chatPanel.classList.add('hidden');
                toggleBtn.innerHTML = '<i data-lucide="message-circle" class="w-4 h-4 mr-2"></i>Show AI Chat';
            }
            lucide.createIcons();
        }

        function hideChatPanel() {
            const chatPanel = document.getElementById('chatPanel');
            const toggleBtn = document.getElementById('toggleChatBtn');
            
            chatPanel.classList.add('hidden');
            toggleBtn.innerHTML = '<i data-lucide="message-circle" class="w-4 h-4 mr-2"></i>Show AI Chat';
            lucide.createIcons();
        }

        function clearAll() {
            // Stop recording if active
            if (isRecording) {
                stopRecording();
            }
            
            // Stop duration timer
            stopDurationTimer({ reset: true });
            
            document.getElementById('mainTopicInput').value = '';
            document.getElementById('initialTextInput').value = '';
            setInitialTextCollapsed(true);
            document.getElementById('setupSection').classList.remove('hidden');
            document.getElementById('mindmapInterface').classList.add('hidden');
            const statusBanner = document.getElementById('recordingStatus');
            if (statusBanner) statusBanner.classList.add('hidden');
            document.getElementById('chatPanel').classList.add('hidden');
            document.getElementById('sessionInfoBar').classList.add('hidden');

            const intervalInput = document.getElementById('intervalInput');
            if (intervalInput) {
                intervalInput.disabled = false;
                intervalInput.value = '20';
            }
            updateInterval();
            
            // Reset chat
            document.getElementById('chatMessages').innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i data-lucide="message-square-plus" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <p class="text-sm">AI processing logs will appear here when you speak!</p>
                </div>
            `;
            
            // Reset button text
            document.getElementById('toggleChatBtn').innerHTML = '<i data-lucide="message-circle" class="w-4 h-4 mr-2"></i>Show AI Chat';
            
            // Reset session data
            currentSession = null;
            currentMindmapData = null;
            chatHistory = [];
            selectedMindmapPromptId = null;
            highlightMindmapPrompt(null);
            
            // Reset recording state
            stream = null;
            recordingTimeout = null;
            
            document.getElementById('chatInput').disabled = true;
            document.getElementById('sendBtn').disabled = true;
            updateStatus('Ready', 'info');
            lucide.createIcons();

            mindmapSelectedNodePath = null;
            clearMindmapSelection();
            updateRecordingButtons();
        }

        async function generateInitialMindmap() {
            const mainTopic = document.getElementById('mainTopicInput').value.trim();
            const initialTextField = document.getElementById('initialTextInput');
            const initialText = initialTextField ? initialTextField.value.trim() : '';
            const generateBtn = document.getElementById('generateBtn');
            const loadingIndicator = document.getElementById('loadingIndicator');
            const errorMessage = document.getElementById('errorMessage');

            if (!mainTopic) {
                showError('Please enter a main topic.');
                return;
            }

            try {
                // Show loading state
                generateBtn.disabled = true;
                loadingIndicator.classList.remove('hidden');
                errorMessage.classList.add('hidden');

                // Create session
                const sessionCode = 'MINDMAP-' + Math.floor(Math.random() * 10000);
                const sessionResponse = await fetch(`${API_BASE_URL}/api/mindmap/session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sessionCode, 
                        mainTopic, 
                        interval: 30000 
                    })
                });

                if (!sessionResponse.ok) {
                    const err = await sessionResponse.json().catch(() => ({}));
                    throw new Error(err?.error || err?.message || 'Failed to create session');
                }

                let initialMindmap = null;
                const initialMessages = [];

                const seedText = initialText || `MAIN TOPIC: ${mainTopic}

Create a mindmap outline for this topic with 3-5 major branches and brief supporting details for each branch.`;

                const generateResponse = await fetch(`${API_BASE_URL}/api/mindmap/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sessionCode, 
                        text: seedText 
                    })
                });

                const result = await generateResponse.json();
                if (!generateResponse.ok) {
                    throw new Error(result.error || 'Failed to generate mindmap');
                }

                initialMindmap = result.data;
                ensureMindmapNodeIds(initialMindmap);
                if (initialText) {
                    initialMessages.push({ role: 'user', text: initialText });
                }
                initialMessages.push({ 
                    role: 'ai', 
                    text: initialText 
                        ? 'Initial mindmap generated! You can now add more information using the chat below.' 
                        : 'Mindmap seeded with starter branches. Add transcript snippets or use the mic to enrich it further.'
                });

                currentSession = { code: sessionCode, mainTopic };
                sessionStartedAt = new Date();
                sessionAccumulatedMs = 0;
                sessionActiveStartMs = null;
                updateStartTimeDisplay();
                updateDurationDisplay();
                currentMindmapData = initialMindmap;
                ensureMindmapNodeIds(currentMindmapData);
                document.getElementById('sessionCode').textContent = sessionCode;
                updateRecordingButtons();

                document.getElementById('setupSection').classList.add('hidden');
                document.getElementById('mindmapInterface').classList.remove('hidden');

                setTimeout(() => {
                    renderMindmap(initialMindmap);
                }, 100);

                document.getElementById('chatInput').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.innerHTML = '';
                initialMessages.forEach(msg => addChatMessage(msg.role, msg.text));

                updateStatus(initialText ? 'Initial mindmap generated' : 'Mindmap ready to record', 'success');

            } catch (error) {
                console.error('Error generating mindmap:', error);
                showError('Failed to generate mindmap: ' + error.message);
            } finally {
                generateBtn.disabled = false;
                loadingIndicator.classList.add('hidden');
            }
        }

        async function addToMindmap() {
            const chatInput = document.getElementById('chatInput');
            const sendBtn = document.getElementById('sendBtn');
            const text = chatInput.value.trim();

            if (!text || !currentSession) {
                return;
            }

            try {
                // Disable input during processing
                sendBtn.disabled = true;
                chatInput.disabled = true;

                // Add user message to chat
                addChatMessage('user', text);

                // Show thinking indicator
                const thinkingId = addChatMessage('ai', 'Analyzing and updating mindmap...', null, true);

                // Send to API
                const response = await fetch(`${API_BASE_URL}/api/mindmap/expand`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sessionCode: currentSession.code, 
                        text: text 
                    })
                });

                const result = await response.json();
                
                // Remove thinking indicator
                document.getElementById(thinkingId).remove();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to expand mindmap');
                }

                // Update current mindmap data
                currentMindmapData = mergeMindmapTrees(result.data, currentMindmapData);
                ensureMindmapNodeIds(currentMindmapData);

                // Re-render mindmap
                renderMindmap(currentMindmapData);

                // Add AI response to chat with collapsible raw output
                addChatMessage('ai', result.message, result.rawAiResponse);

                // Clear input
                chatInput.value = '';

            } catch (error) {
                console.error('Error expanding mindmap:', error);
                addChatMessage('ai', 'Sorry, I encountered an error while updating the mindmap: ' + error.message, null);
            } finally {
                sendBtn.disabled = false;
                chatInput.disabled = false;
                chatInput.focus();
            }
        }

        function addChatMessage(type, content, rawResponse = null, isTemporary = false) {
            const chatMessages = document.getElementById('chatMessages');
            const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            const messageEl = document.createElement('div');
            messageEl.id = messageId;
            messageEl.className = `chat-message ${type}`;
            
            let html = `<div>${content}</div>`;
            
            // Add collapsible raw response if provided
            if (rawResponse && type === 'ai') {
                const collapsibleId = 'collapse-' + messageId;
                html += `
                    <div class="collapsible-response">
                        <div class="collapsible-header" onclick="toggleCollapsible('${collapsibleId}')">
                            <span>🤖 Raw AI Response</span>
                            <i data-lucide="chevron-down" class="w-4 h-4 ml-auto transition-transform" id="chevron-${collapsibleId}"></i>
                        </div>
                        <div class="collapsible-content" id="${collapsibleId}">
                            ${escapeHtml(rawResponse)}
                        </div>
                    </div>
                `;
            }
            
            messageEl.innerHTML = html;
            chatMessages.appendChild(messageEl);
            
            // Re-initialize icons
            lucide.createIcons();
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageId;
        }

        function toggleCollapsible(id) {
            const content = document.getElementById(id);
            const chevron = document.getElementById('chevron-' + id);
            
            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                chevron.style.transform = 'rotate(0deg)';
            } else {
                content.classList.add('expanded');
                chevron.style.transform = 'rotate(180deg)';
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/\n/g, '<br>');
        }

        function showFullText(text, event) {
            // Remove any existing tooltip
            d3.selectAll('.text-tooltip').remove();
            
            // Create tooltip
            const tooltip = d3.select('body')
                .append('div')
                .attr('class', 'text-tooltip')
                .style('position', 'absolute')
                .style('background', 'rgba(0, 0, 0, 0.9)')
                .style('color', 'white')
                .style('padding', '12px 16px')
                .style('border-radius', '8px')
                .style('font-size', '14px')
                .style('max-width', '300px')
                .style('word-wrap', 'break-word')
                .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.3)')
                .style('z-index', '1000')
                .style('pointer-events', 'none')
                .style('opacity', 0)
                .text(text);
            
            // Position tooltip
            const x = event ? event.pageX : 0;
            const y = event ? event.pageY : 0;
            
            tooltip
                .style('left', (x + 10) + 'px')
                .style('top', (y - 10) + 'px')
                .transition()
                .duration(200)
                .style('opacity', 1);
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                tooltip.transition()
                    .duration(300)
                    .style('opacity', 0)
                    .remove();
            }, 5000);
            
            // Hide on click anywhere
            d3.select('body').on('click.tooltip', function() {
                tooltip.remove();
                d3.select('body').on('click.tooltip', null);
            });
        }

        let currentMindmapVis = null;

        function buildMindmapGraph(tree) {
            const nodes = [];
            const links = [];
            let counter = 0;

            function traverse(node, depth = 0, parentId = null) {
                const id = node.id || `mn-${counter++}`;
                const label = node.name || node.label || 'Untitled';
                let type = node.type || 'main';
                if (depth === 0) type = 'root';
                else if (depth === 1) type = 'main';
                else if (depth === 2) type = 'sub';
                else type = 'example';

                const nodeEntry = { id, label, type, depth };
                nodes.push(nodeEntry);

                if (parentId) {
                    links.push({ source: parentId, target: id });
                }

                const children = Array.isArray(node.children) ? node.children : [];
                children.forEach(child => traverse(child, depth + 1, id));
            }

            traverse(tree, 0, null);
            return { nodes, links };
        }

        
        function initializeMindmapEditor() {
            if (mindmapEditorInitialized) return;
            mindmapEditorInitialized = true;

            if (mindmapGenerateExamplesBtn) {
                mindmapGenerateExamplesBtn.addEventListener('click', handleMindmapGenerateExamples);
            }
            if (mindmapDeleteNodeBtn) {
                mindmapDeleteNodeBtn.addEventListener('click', handleMindmapDeleteNode);
            }
            if (mindmapLayoutRightBtn && mindmapLayoutBothBtn) {
                mindmapLayoutRightBtn.addEventListener('click', () => setMindmapLayoutMode('right'));
                mindmapLayoutBothBtn.addEventListener('click', () => setMindmapLayoutMode('both'));
                updateMindmapLayoutToggle();
            }

            clearMindmapSelection();
        }

        function setMindmapLayoutMode(mode) {
            if (!['right', 'both'].includes(mode)) return;
            if (mindmapLayoutMode === mode) return;
            mindmapLayoutMode = mode;
            updateMindmapLayoutToggle();
            if (currentMindmapData) {
                renderMindmap(currentMindmapData);
            }
        }

        function updateMindmapLayoutToggle() {
            if (mindmapLayoutRightBtn) {
                const isActive = mindmapLayoutMode === 'right';
                mindmapLayoutRightBtn.classList.toggle('accent', isActive);
                mindmapLayoutRightBtn.classList.toggle('neutral', !isActive);
                mindmapLayoutRightBtn.setAttribute('aria-pressed', String(isActive));
            }
            if (mindmapLayoutBothBtn) {
                const isActive = mindmapLayoutMode === 'both';
                mindmapLayoutBothBtn.classList.toggle('accent', isActive);
                mindmapLayoutBothBtn.classList.toggle('neutral', !isActive);
                mindmapLayoutBothBtn.setAttribute('aria-pressed', String(isActive));
            }
            if (mindmapSidebarMode) {
                mindmapSidebarMode.textContent = `Mode: ${mindmapLayoutMode === 'both' ? 'both sides' : 'right only'}`;
            }
        }

        function setMindmapSidebarDisabled(disabled) {
            if (!mindmapSidebarActions) return;
            if (disabled) {
                mindmapSidebarActions.classList.add('opacity-50', 'pointer-events-none');
            } else {
                mindmapSidebarActions.classList.remove('opacity-50', 'pointer-events-none');
            }
        }

        function normalizeMindmapLabel(text) {
            if (typeof text !== 'string') return '';
            let cleaned = text.trim();
            cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');
            cleaned = cleaned.replace(/^\d+[\s\.\)\-:]*\s*/, '');
            cleaned = cleaned.replace(/^[\-*•]+\s*/, '');
            cleaned = cleaned.replace(/\s+/g, ' ');
            return cleaned.trim();
        }

        function assignPathsToMindmap(node, pathSegments = []) {
            if (!node) return;
            const fullPath = pathSegments.length ? `root.${pathSegments.join('.')}` : 'root';
            node._path = fullPath;
            (node.children || []).forEach((child, idx) => assignPathsToMindmap(child, [...pathSegments, idx]));
        }

        function assignBranchesToMindmap(node, branch = 1) {
            if (!node) return;
            node._branch = branch;
            (node.children || []).forEach((child, idx) => {
                const childBranch = mindmapLayoutMode === 'both'
                    ? (node === currentMindmapData ? (idx % 2 === 0 ? 1 : -1) : branch)
                    : 1;
                assignBranchesToMindmap(child, childBranch);
            });
        }

        function getMindmapContextPath(pathStr) {
            if (!currentMindmapData) return [];
            const names = [];
            let node = currentMindmapData;
            if (!node) return names;
            if (node.name) {
                names.push(node.name);
            }
            if (!pathStr || pathStr === 'root') {
                return names;
            }
            const segments = pathStr.split('.').slice(1).map(Number);
            for (const idx of segments) {
                if (!node.children || !node.children[idx]) break;
                node = node.children[idx];
                if (node.name) {
                    names.push(node.name);
                }
            }
            return names;
        }

        function normalizeNodeName(name) {
            return (name || '').trim().toLowerCase();
        }

        function deepCloneNode(node) {
            if (typeof structuredClone === 'function') {
                return structuredClone(node);
            }
            return JSON.parse(JSON.stringify(node));
        }

        function mergeMindmapTrees(serverNode, localNode) {
            if (!serverNode && !localNode) return null;
            if (!serverNode) {
                const localClone = deepCloneNode(localNode);
                ensureMindmapNodeIds(localClone);
                return localClone;
            }
            if (!localNode) {
                const serverClone = deepCloneNode(serverNode);
                ensureMindmapNodeIds(serverClone);
                return serverClone;
            }

            const primary = deepCloneNode(serverNode);
            const secondary = deepCloneNode(localNode);

            ensureMindmapNodeIds(primary);
            ensureMindmapNodeIds(secondary);

            const merged = { ...primary };

            if (primary.id && secondary.id && primary.id === secondary.id) {
                merged.name = secondary.name || primary.name;
                merged.type = secondary.type || primary.type;
                if (secondary._offset) {
                    merged._offset = { ...primary._offset, ...secondary._offset };
                }
            } else if (!primary.id && secondary.id) {
                merged.id = secondary.id;
            }

            const serverChildren = Array.isArray(primary.children) ? primary.children : [];
            const localChildren = Array.isArray(secondary.children) ? secondary.children : [];

            const localMap = new Map();
            localChildren.forEach((child, index) => {
                const key = getMindmapNodeKey(child) || `fallback:${index}`;
                if (!localMap.has(key)) {
                    localMap.set(key, []);
                }
                localMap.get(key).push(child);
            });

            const mergedChildren = [];

            serverChildren.forEach((child, index) => {
                const key = getMindmapNodeKey(child) || `server:${index}`;
                let matched = null;
                if (localMap.has(key)) {
                    const bucket = localMap.get(key);
                    matched = bucket.shift();
                    if (bucket.length === 0) {
                        localMap.delete(key);
                    }
                }
                mergedChildren.push(mergeMindmapTrees(child, matched));
            });

            localMap.forEach(bucket => {
                bucket.forEach(child => {
                    mergedChildren.push(mergeMindmapTrees(null, child));
                });
            });

            merged.children = mergedChildren;

            return merged;
        }

        async function syncMindmapState(reason = 'manual_update', metadata = {}) {
            if (!currentSession || !currentMindmapData) return null;
            try {
                ensureMindmapNodeIds(currentMindmapData);
                const response = await fetch(`${API_BASE_URL}/api/mindmap/manual-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionCode: currentSession.code,
                        mainTopic: currentSession.mainTopic,
                        mindmapData: currentMindmapData,
                        reason,
                        metadata
                    })
                });

                const text = await response.text();
                let payload = {};
                if (text) {
                    try {
                        payload = JSON.parse(text);
                    } catch (_) {
                        payload = {};
                    }
                }

                if (!response.ok) {
                    throw new Error(payload?.error || response.statusText);
                }

                return payload;
            } catch (error) {
                console.error('❌ Failed to sync mindmap update:', error);
                updateStatus('Manual update saved locally; sync failed', 'error');
                return null;
            }
        }

        function getMindmapNodeByPath(pathStr) {
            if (!pathStr || pathStr === 'root') return currentMindmapData;
            const segments = pathStr.split('.').slice(1).map(Number);
            let node = currentMindmapData;
            for (const idx of segments) {
                if (!node || !node.children || !node.children[idx]) return null;
                node = node.children[idx];
            }
            return node;
        }

        function clearMindmapSelection(options = {}) {
            const { preserveExamples = false } = options;
            mindmapSelectedNodePath = null;
            if (mindmapSidebarHint) mindmapSidebarHint.classList.remove('hidden');
            if (mindmapSidebarSelected) mindmapSidebarSelected.classList.add('hidden');
            if (mindmapSidebarContext) mindmapSidebarContext.textContent = '';
            if (mindmapSidebarExamples && !preserveExamples) {
                mindmapSidebarExamples.innerHTML = '<p class="text-xs text-slate-500">Generated examples will appear here.</p>';
            }
            setMindmapSidebarDisabled(true);
            if (mindmapSvgSelection) {
                mindmapSvgSelection.selectAll('.mindmap-node circle').classed('node-selected', false);
            }
        }

        function updateMindmapSidebar(node) {
            if (!node) return;
            if (mindmapSidebarHint) mindmapSidebarHint.classList.add('hidden');
            if (mindmapSidebarSelected) mindmapSidebarSelected.classList.remove('hidden');
            if (mindmapSidebarNodeLabel) mindmapSidebarNodeLabel.textContent = node.name || 'Untitled node';
            if (mindmapSidebarContext) {
                const strand = getMindmapContextPath(node._path);
                mindmapSidebarContext.textContent = strand.length
                    ? `AI context: ${strand.join(' › ')}`
                    : 'AI context: root topic';
            }
            if (mindmapSidebarExamples) {
                mindmapSidebarExamples.innerHTML = '<p class="text-xs text-slate-500">Use “Generate examples” to explore ideas.</p>';
            }
            setMindmapSidebarDisabled(false);
        }

        function displayMindmapExamples(items, headerText) {
            if (!mindmapSidebarExamples) return;
            const safeItems = (items || []).map(normalizeMindmapLabel).filter(Boolean);
            const header = headerText ? `<p class="text-xs font-semibold text-slate-600 mb-2">${headerText}</p>` : '';
            const body = safeItems.length
                ? safeItems.map(item => `<div class="text-xs text-slate-600">• ${item}</div>`).join('')
                : '<p class="text-xs text-slate-500">No examples generated.</p>';
            mindmapSidebarExamples.innerHTML = header + body;
        }

        function ensureMindmapSelectionStillExists() {
            if (!mindmapSelectedNodePath) {
                clearMindmapSelection();
                return;
            }
            const node = getMindmapNodeByPath(mindmapSelectedNodePath);
            if (!node) {
                clearMindmapSelection();
            } else {
                updateMindmapSidebar(node);
                if (mindmapSvgSelection) {
                    mindmapSvgSelection.selectAll('.mindmap-node circle').classed('node-selected', false);
                    mindmapSvgSelection.selectAll('.mindmap-node')
                        .filter(d => d.data && d.data._path === mindmapSelectedNodePath)
                        .select('circle')
                        .classed('node-selected', true);
                }
            }
        }

        function focusMindmapNode(hierarchyNode) {
            if (!hierarchyNode || !hierarchyNode.data) return;
            mindmapSelectedNodePath = hierarchyNode.data._path;
            updateMindmapSidebar(hierarchyNode.data);
            if (mindmapSvgSelection) {
                mindmapSvgSelection.selectAll('.mindmap-node circle').classed('node-selected', false);
                mindmapSvgSelection.selectAll('.mindmap-node')
                    .filter(d => d.data && d.data._path === mindmapSelectedNodePath)
                    .select('circle')
                    .classed('node-selected', true);
            }
        }

        async function handleMindmapGenerateExamples() {
            if (!mindmapSelectedNodePath || !currentMindmapData) return;
            const node = getMindmapNodeByPath(mindmapSelectedNodePath);
            if (!node) return;
            const count = parseInt(mindmapExampleCountInput?.value, 10) || 2;
            const strand = getMindmapContextPath(mindmapSelectedNodePath);
            if (mindmapGenerateExamplesBtn) {
                mindmapGenerateExamplesBtn.disabled = true;
                mindmapGenerateExamplesBtn.textContent = '⚡ Generating...';
            }
            try {
                const examples = await generateExamplesWithOpenAI(node.name, count, strand);
                const sanitized = (Array.isArray(examples) ? examples : [])
                    .map(normalizeMindmapLabel)
                    .filter(Boolean);
                if (!sanitized.length) {
                    throw new Error('No examples generated');
                }
                node.children = Array.isArray(node.children) ? node.children : [];
                sanitized.forEach(example => node.children.push({ id: generateMindmapNodeId(), name: example, children: [] }));
                ensureMindmapNodeIds(node);
                ensureMindmapNodeIds(currentMindmapData);
                mindmapSelectedNodePath = null;
                renderMindmap(currentMindmapData);
                displayMindmapExamples(sanitized, `Added ${sanitized.length} example${sanitized.length === 1 ? '' : 's'}`);
                const syncResult = await syncMindmapState('node_examples', {
                    parent: node.name,
                    added: sanitized
                });
                if (syncResult) {
                    updateStatus(`Added ${sanitized.length} example${sanitized.length === 1 ? '' : 's'} to mindmap`, 'success');
                }
                clearMindmapSelection({ preserveExamples: true });
            } catch (error) {
                console.error('Error generating examples:', error);
                if (mindmapSidebarExamples) {
                    mindmapSidebarExamples.innerHTML = '<p class="text-xs text-rose-500">Error generating examples. Please try again.</p>';
                }
            } finally {
                if (mindmapGenerateExamplesBtn) {
                    mindmapGenerateExamplesBtn.disabled = false;
                    mindmapGenerateExamplesBtn.textContent = '⚡ Generate examples';
                }
            }
        }

        async function handleMindmapDeleteNode() {
            if (!mindmapSelectedNodePath || mindmapSelectedNodePath === 'root' || !currentMindmapData) return;
            const parts = mindmapSelectedNodePath.split('.');
            const parentPath = parts.slice(0, -1).join('.');
            const parent = getMindmapNodeByPath(parentPath);
            if (!parent || !parent.children) return;
            const index = parseInt(parts[parts.length - 1], 10);
            if (Number.isNaN(index)) return;
            const [removedNode] = parent.children.splice(index, 1);
            mindmapSelectedNodePath = null;
            renderMindmap(currentMindmapData);
            clearMindmapSelection();
            const syncResult = await syncMindmapState('node_removed', {
                removed: removedNode?.name || null,
                parent: parent?.name || null
            });
            if (syncResult) {
                updateStatus('Node removed from mindmap', 'info');
            }
        }

        async function generateExamplesWithOpenAI(topic, count = 2, strand = []) {
            const response = await fetch('/api/generate-examples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, count, strand })
            });
            if (!response.ok) {
                throw new Error('Failed to generate examples');
            }
            const result = await response.json();
            if (!Array.isArray(result)) {
                throw new Error('Unexpected response format');
            }
            return result;
        }

        function loadMindmapExample() {
            currentMindmapData = {
                id: generateMindmapNodeId(),
                name: 'Why is Educational Technology Important?',
                children: [
                    {
                        id: generateMindmapNodeId(),
                        name: 'Accessibility and Inclusion',
                        children: [
                            {
                                id: generateMindmapNodeId(),
                                name: 'Assistive technologies',
                                children: [
                                    { id: generateMindmapNodeId(), name: 'Screen readers and text-to-speech', children: [] },
                                    { id: generateMindmapNodeId(), name: 'Voice recognition software', children: [] },
                                    { id: generateMindmapNodeId(), name: 'Adaptive keyboards and mice', children: [] }
                                ]
                            },
                            {
                                id: generateMindmapNodeId(),
                                name: 'Universal design for learning',
                                children: [
                                    { id: generateMindmapNodeId(), name: 'Multiple representation formats', children: [] },
                                    { id: generateMindmapNodeId(), name: 'Flexible engagement options', children: [] },
                                    { id: generateMindmapNodeId(), name: 'Customizable learning environments', children: [] }
                                ]
                            }
                        ]
                    },
                    {
                        id: generateMindmapNodeId(),
                        name: 'Enhanced Learning Experience',
                        children: [
                            { id: generateMindmapNodeId(), name: 'Interactive multimedia content', children: [] },
                            { id: generateMindmapNodeId(), name: 'Gamified lessons', children: [] }
                        ]
                    }
                ]
            };
            ensureMindmapNodeIds(currentMindmapData);
            mindmapSelectedNodePath = null;
            renderMindmap(currentMindmapData);
        }

        function resetMindmapStructure() {
            const rootName = currentMindmapData?.name || document.getElementById('currentTopic')?.textContent || 'Lesson Topic';
            currentMindmapData = { id: generateMindmapNodeId(), name: rootName, children: [] };
            ensureMindmapNodeIds(currentMindmapData);
            mindmapSelectedNodePath = null;
            renderMindmap(currentMindmapData);
        }

        function renderMindmap(data) {
    if (!data) {
        console.error('No data to render');
        return;
    }

    ensureMindmapNodeIds(data);

    const container = document.getElementById('mindmapContainer');
    if (!container) return;

    assignPathsToMindmap(data);
    assignBranchesToMindmap(data, 1);
    updateMindmapLayoutToggle();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;
    const horizontalMargin = mindmapLayoutMode === 'both' ? 150 : 190;
    const verticalOffset = 100;
    const verticalSpacing = 80;
    const horizontalSpacing = mindmapLayoutMode === 'both' ? 240 : 280;

    container.innerHTML = '';

    mindmapSvgSelection = d3.select(container)
        .append('svg')
        .attr('class', 'mindmap-svg')
        .attr('width', width)
        .attr('height', height);

    const svg = mindmapSvgSelection;
    const g = svg.append('g').attr('class', 'mindmap-tree');

    const treeLayout = d3.tree()
        .nodeSize([verticalSpacing, horizontalSpacing])
        .separation((a, b) => (a.parent === b.parent ? 1.8 : 2.4));

    const root = d3.hierarchy(data);
    treeLayout(root);

    root.descendants().forEach(node => {
        node._offset = node._offset || { x: 0, y: 0 };
    });

    function nodeCoords(node) {
        const offset = node._offset || { x: 0, y: 0 };
        if (mindmapLayoutMode === 'both') {
            const branch = node.data._branch || 1;
            if (node.depth === 0) {
                return {
                    x: width / 2 + offset.x,
                    y: node.x + verticalOffset + offset.y
                };
            }
            return {
                x: width / 2 + branch * (node.y + horizontalMargin) + offset.x,
                y: node.x + verticalOffset + offset.y
            };
        }
        return {
            x: node.y + horizontalMargin + offset.x,
            y: node.x + verticalOffset + offset.y
        };
    }

    const typeColor = {
        root: '#2563eb',
        main: '#3b82f6',
        sub: '#0ea5e9',
        example: '#f97316'
    };

    function resolveType(node) {
        if (node.depth === 0) return 'root';
        if (node.depth === 1) return 'main';
        if (node.depth === 2) return 'sub';
        return 'example';
    }

    function linkPath(link) {
        const source = nodeCoords(link.source);
        const target = nodeCoords(link.target);
        const midX = (source.x + target.x) / 2;
        return `M${source.x},${source.y}C${midX},${source.y} ${midX},${target.y} ${target.x},${target.y}`;
    }

    const link = g.append('g')
        .selectAll('path')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'mindmap-link')
        .attr('d', linkPath);

    const node = g.append('g')
        .selectAll('g')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'mindmap-node')
        .attr('transform', d => {
            const { x, y } = nodeCoords(d);
            return `translate(${x},${y})`;
        });

    node.append('circle')
        .attr('r', d => {
            if (d.depth === 0) return 18;
            if (d.depth === 1) return 14;
            if (d.depth === 2) return 12;
            return 10;
        })
        .attr('fill', d => typeColor[resolveType(d)] || '#6366f1')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2);

            const labelGroup = node.append('g').attr('class', 'mindmap-label-group');

            labelGroup.each(function(d) {
                const words = (d.data.name || '').split(/\s+/).filter(Boolean);
                const maxChars = d.depth === 0 ? 20 : 24;
                const lines = [];
                let current = [];
                words.forEach(word => {
                    const nextLine = [...current, word].join(' ');
                    if (nextLine.length > maxChars) {
                        if (current.length) lines.push(current.join(' '));
                        current = [word];
                    } else {
                        current.push(word);
                    }
                });
                if (current.length) lines.push(current.join(' '));
                if (lines.length === 0) lines.push('');

                const text = d3.select(this)
                    .append('text')
                    .attr('font-weight', d.depth === 0 ? '600' : '500')
                    .attr('font-size', d.depth === 0 ? '14px' : '12px')
                    .attr('text-anchor', d.depth === 0 ? 'middle' : 'start');

                const lineHeight = 18;
                const startX = d.depth === 0 ? 0 : 32;
                const startY = d.depth === 0
                    ? -(lines.length * lineHeight) - 28
                    : -((lines.length - 1) / 2) * lineHeight;

                lines.forEach((line, index) => {
                    text.append('tspan')
                        .attr('x', startX)
                        .attr('y', startY + index * lineHeight)
                        .text(line);
                });
            });

    labelGroup.on('click', function(event, d) {
        event.stopPropagation();
        focusMindmapNode(d);
        showFullText(d.data.name, event);
    });

    const drag = d3.drag()
        .on('start', function(event, d) {
            d3.select(this).classed('dragging', true);
            d._dragPrev = { x: event.x, y: event.y };
            d._offset = d._offset || { x: 0, y: 0 };
        })
        .on('drag', function(event, d) {
            const prev = d._dragPrev || { x: event.x, y: event.y };
            const dx = event.x - prev.x;
            const dy = event.y - prev.y;
            d._dragPrev = { x: event.x, y: event.y };
            d._offset.x += dx;
            d._offset.y += dy;

            const { x, y } = nodeCoords(d);
            d3.select(this).attr('transform', `translate(${x},${y})`);
            link.attr('d', linkPath);
        })
        .on('end', function() {
            d3.select(this).classed('dragging', false);
        });

    node.call(drag);

    node.on('click', function(event, d) {
        event.stopPropagation();
        focusMindmapNode(d);
    });

    svg.on('click', () => {
        clearMindmapSelection();
    });

    if (mindmapSelectedNodePath) {
        ensureMindmapSelectionStillExists();
    } else if (mindmapSvgSelection) {
        mindmapSvgSelection.selectAll('.mindmap-node circle').classed('node-selected', false);
    }

    mindmapZoomBehavior = d3.zoom()
        .scaleExtent([0.5, 2.2])
        .on('zoom', (event) => {
            mindmapCurrentZoomTransform = event.transform;
            g.attr('transform', event.transform);
        });

    svg.call(mindmapZoomBehavior);

    function computeContentBounds() {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        g.selectAll('.mindmap-node').each(function(d) {
            const p = nodeCoords(d);
            const r = (d.depth === 0) ? 18 : (d.depth === 1 ? 14 : (d.depth === 2 ? 12 : 10));
            minX = Math.min(minX, p.x - r);
            maxX = Math.max(maxX, p.x + r);
            minY = Math.min(minY, p.y - r);
            maxY = Math.max(maxY, p.y + r);

            const label = d3.select(this).select('text');
            if (!label.empty()) {
                try {
                    const bbox = label.node().getBBox();
                    minX = Math.min(minX, p.x + bbox.x);
                    maxX = Math.max(maxX, p.x + bbox.x + bbox.width);
                    minY = Math.min(minY, p.y + bbox.y);
                    maxY = Math.max(maxY, p.y + bbox.y + bbox.height);
                } catch (_) {
                    // ignore measurement errors
                }
            }

            // Also include drag offsets if any (already applied in nodeCoords)
        });

        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
            return null;
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        };
    }

    const fitToView = (animate = true) => {
        const bounds = computeContentBounds();
        if (!bounds) return;

        const PADDING = 140;
        const targetW = Math.max(50, width - PADDING * 2);
        const targetH = Math.max(50, height - PADDING * 2);

        let scale = Math.min(targetW / bounds.width, targetH / bounds.height);
        scale = Math.max(0.5, Math.min(1.2, scale));

        const centerX = bounds.minX + bounds.width / 2;
        const centerY = bounds.minY + bounds.height / 2;
        const translateX = width / 2 - scale * centerX;
        const translateY = height / 2 - scale * centerY;
        const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

        if (animate) {
            svg.transition().duration(600).call(mindmapZoomBehavior.transform, transform);
        } else {
            svg.call(mindmapZoomBehavior.transform, transform);
        }
        mindmapLastFitTransform = transform;
        mindmapCurrentZoomTransform = transform;
    };

    const applyInitialView = () => {
        if (mindmapCurrentZoomTransform) {
            svg.call(mindmapZoomBehavior.transform, mindmapCurrentZoomTransform);
        } else {
            setTimeout(() => fitToView(true), 60);
        }
    };

    applyInitialView();

    currentMindmapVis = { fitToView };
    container.__mindmapVisualization = currentMindmapVis;
}

function showError(message) {
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
        }

        function setupSpeechRecognition() {
            if ('webkitSpeechRecognition' in window) {
                recognition = new webkitSpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                
                recognition.onstart = function() {
                    console.log('🎤 Speech recognition started');
                };
                
                recognition.onresult = function(event) {
                    console.log('🎤 Speech recognition result received');
                    const transcript = event.results[event.results.length - 1][0].transcript;
                    console.log('📝 Transcript:', transcript);
                    processSpeechText(transcript.trim());
                };
                
                recognition.onerror = function(event) {
                    console.error('🎤 Speech recognition error:', event.error);
                    showError('Speech recognition error: ' + event.error);
                };
                
                recognition.onend = function() {
                    console.log('🎤 Speech recognition ended');
                    if (isRecording) {
                        // Restart recognition if we're still supposed to be recording
                        setTimeout(() => {
                            if (isRecording) {
                                recognition.start();
                            }
                        }, 100);
                    }
                };
            } else if ('SpeechRecognition' in window) {
                recognition = new SpeechRecognition();
                // Same setup as above...
            } else {
                console.warn('Speech recognition not supported');
            }
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            if (currentMindmapData) {
                clearTimeout(window.resizeTimeout);
                window.resizeTimeout = setTimeout(() => {
                    renderMindmap(currentMindmapData);
                }, 250);
            }
        });
        
        // ===================
        // MINDMAP PROMPT MANAGEMENT
        // ===================
        
        let currentMindmapPrompts = [];
        let selectedMindmapPromptId = null;
        let availableMindmapCategories = [];
        let mindmapPromptSectionOpen = false;
        
        // Toggle mindmap prompt section
        function toggleMindmapPromptSection() {
            const editor = document.getElementById('mindmapPromptEditor');
            const chevron = document.getElementById('mindmapPromptChevron');
            
            mindmapPromptSectionOpen = !mindmapPromptSectionOpen;
            
            if (mindmapPromptSectionOpen) {
                editor.classList.remove('hidden');
                chevron.style.transform = 'rotate(180deg)';
            } else {
                editor.classList.add('hidden');
                chevron.style.transform = 'rotate(0deg)';
            }
        }
        
        // Load mindmap prompt library from API
        async function loadMindmapPromptLibrary() {
            try {
                const response = await fetch('/api/prompts?mode=mindmap&limit=50');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                currentMindmapPrompts = data.prompts;
                availableMindmapCategories = data.filters.categories;
                
                updateMindmapCategoryFilter();
                displayMindmapPromptLibrary(data.prompts);
                
            } catch (err) {
                console.error('❌ Failed to load mindmap prompt library:', err);
                document.getElementById('mindmapPromptLibraryGrid').innerHTML = `
                    <div class="flex items-center justify-center py-8 text-red-500 text-sm col-span-full">
                        <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                        Failed to load prompts: ${err.message}
                    </div>
                `;
                lucide.createIcons();
            }
        }
        
        // Refresh mindmap prompt library
        function refreshMindmapPrompts() {
            document.getElementById('mindmapPromptLibraryGrid').innerHTML = `
                <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                    <i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i>
                    Refreshing prompts...
                </div>
            `;
            lucide.createIcons();
            loadMindmapPromptLibrary();
        }
        
        // Update mindmap category filter options
        function updateMindmapCategoryFilter() {
            const categoryFilter = document.getElementById('mindmapPromptCategoryFilter');
            const currentValue = categoryFilter.value;
            
            // Clear existing options (except "All Categories")
            while (categoryFilter.children.length > 1) {
                categoryFilter.removeChild(categoryFilter.lastChild);
            }
            
            // Add category options
            availableMindmapCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            });
            
            // Restore selection
            categoryFilter.value = currentValue;
        }
        
        function showMindmapToast(message, type = 'info') {
            const container = document.getElementById('mindmapToastContainer');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `mindmap-toast ${type === 'error' ? 'error' : ''}`;
            toast.textContent = message;
            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.add('visible');
            });

            setTimeout(() => {
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 250);
            }, 2600);
        }

        function highlightMindmapPrompt(promptId) {
            const cards = document.querySelectorAll('[data-mindmap-prompt-id]');
            cards.forEach(card => {
                const isSelected = card.getAttribute('data-mindmap-prompt-id') === promptId;
                card.classList.toggle('selected', isSelected);
            });
        }

        // Display mindmap prompt library
        function displayMindmapPromptLibrary(prompts) {
            const grid = document.getElementById('mindmapPromptLibraryGrid');
            
            if (prompts.length === 0) {
                grid.innerHTML = `
                    <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                        <i data-lucide="file-text" class="w-4 h-4 mr-2"></i>
                        No mindmap prompts found
                    </div>
                `;
                lucide.createIcons();
                return;
            }
            
            const promptsHtml = prompts.map(prompt => `
                <div class="mindmap-prompt-card ${selectedMindmapPromptId === prompt._id ? 'selected' : ''}" data-mindmap-prompt-id="${prompt._id}" onclick="loadMindmapPrompt('${prompt._id}')">
                    <div class="flex items-start justify-between mb-2">
                        <h5 class="text-sm font-medium text-gray-900 truncate flex-1 mr-2">${prompt.title}</h5>
                        <div class="flex items-center space-x-1 flex-shrink-0">
                            ${prompt.isPublic ? '<i data-lucide="globe" class="w-3 h-3 text-green-500" title="Public"></i>' : '<i data-lucide="lock" class="w-3 h-3 text-gray-400" title="Private"></i>'}
                            <button onclick="event.stopPropagation(); editMindmapPrompt('${prompt._id}')" class="text-blue-500 hover:text-blue-700" title="Edit">
                                <i data-lucide="edit" class="w-3 h-3"></i>
                            </button>
                            <button onclick="event.stopPropagation(); deleteMindmapPrompt('${prompt._id}')" class="text-red-500 hover:text-red-700" title="Delete">
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
            highlightMindmapPrompt(selectedMindmapPromptId);
        }
        
        // Filter mindmap prompts
        function filterMindmapPrompts() {
            const search = document.getElementById('mindmapPromptSearch').value.toLowerCase();
            const category = document.getElementById('mindmapPromptCategoryFilter').value;
            
            let filteredPrompts = currentMindmapPrompts.filter(prompt => {
                const matchesSearch = !search || 
                    prompt.title.toLowerCase().includes(search) ||
                    (prompt.description && prompt.description.toLowerCase().includes(search)) ||
                    prompt.content.toLowerCase().includes(search) ||
                    (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(search)));
                
                const matchesCategory = !category || prompt.category === category;
                
                return matchesSearch && matchesCategory;
            });
            
            displayMindmapPromptLibrary(filteredPrompts);
        }
        
        // Load a mindmap prompt (for future use when mindmap prompts are implemented)
        async function loadMindmapPrompt(promptId) {
            try {
                const response = await fetch(`/api/prompts/${promptId}/use`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionCode: 'mindmap-interface' })
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                const prompt = data.prompt;

                if (prompt?.content) {
                    const textarea = document.getElementById('initialTextInput');
                    if (textarea) {
                        textarea.value = prompt.content;
                    }
                }

                if (prompt?.title) {
                    const topicInput = document.getElementById('mainTopicInput');
                    if (topicInput && !topicInput.value) {
                        topicInput.value = prompt.title;
                    }
                }

                selectedMindmapPromptId = promptId;
                highlightMindmapPrompt(promptId);

                showMindmapToast(`Loaded prompt: ${prompt.title}`, 'success');
                console.log('Mindmap prompt loaded:', prompt);
                
            } catch (err) {
                console.error('❌ Failed to load mindmap prompt:', err);
                showMindmapToast(`Failed to load prompt: ${err.message}`, 'error');
            }
        }
        
        // Placeholder functions for mindmap prompt management
        function openCreateMindmapPromptModal() {
            alert('Mindmap prompt creation will be available in a future update!');
        }
        
        function editMindmapPrompt(promptId) {
            alert('Mindmap prompt editing will be available in a future update!');
        }
        
        function deleteMindmapPrompt(promptId) {
            alert('Mindmap prompt deletion will be available in a future update!');
        }
        
        // Show the mindmap prompt section when mindmap interface is loaded
        function showMindmapPromptSection() {
            document.getElementById('mindmapPromptSection').classList.remove('hidden');
        }
        
        // Initialize mindmap prompt library when needed
        function initializeMindmapPrompts() {
            if (currentMindmapPrompts.length === 0) {
                loadMindmapPromptLibrary();
            }
            showMindmapPromptSection();
        }
        
        // Integrate with existing mindmap initialization
        const originalShowMindmapInterface = window.showMindmapInterface || function() {};
        window.showMindmapInterface = function() {
            originalShowMindmapInterface();
            setTimeout(() => {
                initializeMindmapPrompts();
            }, 500);
        };
        
        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            // Load mindmap prompts in the background
            setTimeout(loadMindmapPromptLibrary, 1000);
        });

        // QR modal helpers
        function openQrModal() {
            const codeEl = document.getElementById('sessionCode');
            const code = (codeEl?.textContent || '').trim();
            if (!code) return;
            const url = `${window.location.origin}/student.html?code=${encodeURIComponent(code)}`;
            const container = document.getElementById('qrCodeContainer');
            const linkEl = document.getElementById('qrLink');
            if (container) { container.innerHTML = ''; try { new QRCode(container, { text: url, width: 220, height: 220 }); } catch(_){} }
            if (linkEl) linkEl.textContent = url;
            const modal = document.getElementById('qrModal');
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
            try { if (window.lucide) window.lucide.createIcons(); } catch (_) {}
        }
        function closeQrModal() {
            const modal = document.getElementById('qrModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }