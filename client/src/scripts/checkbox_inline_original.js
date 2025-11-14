// Global variables
        // Use window.socket to avoid "already declared" errors when switching tabs
        if (window.socket) {
            try { window.socket.disconnect(); } catch (e) {}
        }
        window.socket = io();
        const socket = window.socket;
        let sessionCode = null;
        let isRecording = false;
        let groups = new Map();
        let currentCriteria = [];
        let currentScenario = "";
        let currentStrictness = 2; // Default to moderate (1=lenient, 2=moderate, 3=strict)
let criteriaSavedOnce = false; // Track if criteria were saved at least once
let elapsedInterval = null;
let recordingStart = null;
// Query params will be read fresh each time applyCriteriaFromQuery is called
let scenarioFromQuery = null;
let criteriaFromQuery = null;
let strictnessFromQuery = null;

const START_HTML_IDLE = `
    <i data-lucide="play" class="w-4 h-4 sm:w-5 sm:h-5 mr-2"></i>
    <span class="hidden sm:inline">Start Recording</span>
    <span class="sm:hidden">Start</span>
`;

const START_HTML_RECORDING = `
    <i data-lucide="mic" class="w-4 h-4 sm:w-5 sm:h-5 mr-2"></i>
    <span class="hidden sm:inline">Recording...</span>
    <span class="sm:hidden">Rec</span>
`;

const START_HTML_SPINNER = `
    <svg class="animate-spin w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span class="hidden sm:inline">Starting...</span>
    <span class="sm:hidden">...</span>
`;

const STOP_HTML_READY = `
    <i data-lucide="square" class="w-4 h-4 sm:w-5 sm:h-5 mr-2"></i>
    <span class="hidden sm:inline">Stop Recording</span>
    <span class="sm:hidden">Stop</span>
`;

const STOP_HTML_SPINNER = `
    <svg class="animate-spin w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span class="hidden sm:inline">Stopping...</span>
    <span class="sm:hidden">...</span>
`;

const startActiveClasses = ['bg-green-500', 'hover:bg-green-600', 'text-white', 'border-green-600'];
const startInactiveClasses = ['bg-gray-300', 'hover:bg-gray-300', 'text-gray-500', 'border-gray-300'];
const stopActiveClasses = ['bg-red-500', 'hover:bg-red-600', 'text-white', 'border-red-600'];
const stopInactiveClasses = ['bg-gray-300', 'hover:bg-gray-400', 'text-black', 'border-slate-300'];

function updateRecordingButtons(state) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (!startBtn || !stopBtn) return;

    const applyClasses = (element, add, remove) => {
        remove.forEach(cls => element.classList.remove(cls));
        add.forEach(cls => element.classList.add(cls));
    };

    if (state) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        applyClasses(startBtn, startInactiveClasses, startActiveClasses);
        applyClasses(stopBtn, stopActiveClasses, stopInactiveClasses);
        startBtn.innerHTML = START_HTML_RECORDING;
        stopBtn.innerHTML = STOP_HTML_READY;
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        applyClasses(startBtn, startActiveClasses, startInactiveClasses);
        applyClasses(stopBtn, stopInactiveClasses, stopActiveClasses);
        startBtn.innerHTML = START_HTML_IDLE;
        stopBtn.innerHTML = STOP_HTML_READY;
    }

    startBtn.classList.toggle('cursor-not-allowed', startBtn.disabled);
    stopBtn.classList.toggle('cursor-not-allowed', stopBtn.disabled);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load a checkbox prompt into the current editor - MUST be global for onclick handlers
window.loadCheckboxPrompt = async function(promptId) {
    console.log('🔍 loadCheckboxPrompt called with promptId:', promptId);
    try {
        const response = await fetch(`/api/prompts/${promptId}/use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionCode: sessionCode || 'web-interface' })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const prompt = data.prompt;

        // Parse the content to separate scenario and criteria
        const lines = prompt.content.split('\n').filter(line => line.trim());

        // Extract scenario from first line if formatted as "Scenario: ..."
        let scenario = '';
        let criteria = [];
        if (lines.length > 0 && /^\s*scenario\s*:/i.test(lines[0])) {
            scenario = lines[0].replace(/^\s*scenario\s*:\s*/i, '').trim();
            criteria = lines.slice(1);
        } else {
            // Fallbacks
            if (prompt.scenario && typeof prompt.scenario === 'string') {
                scenario = prompt.scenario.trim();
                criteria = lines;
            } else {
                criteria = lines; // legacy prompts: all lines are criteria
            }
        }

        // Load into the form
        const scenarioInput = document.getElementById('scenarioInput');
        const criteriaInput = document.getElementById('criteriaInput');

        console.log('📝 Setting input values:', {
            scenarioInput: !!scenarioInput,
            criteriaInput: !!criteriaInput,
            scenario,
            criteriaCount: criteria.length
        });

        if (scenarioInput) scenarioInput.value = scenario;
        if (criteriaInput) criteriaInput.value = criteria.join('\n');

        console.log('✅ Values set. Criteria input value:', criteriaInput?.value?.substring(0, 100));

        // Manually trigger the update by clicking the "Update Criteria" button if it exists
        const updateButton = document.querySelector('button[onclick*="updateCriteria"]');
        if (updateButton) {
            console.log('🔘 Found and clicking Update Criteria button');
            updateButton.click();
        } else {
            console.log('⚠️ Update Criteria button not found');
        }

    } catch (err) {
        console.error('❌ Failed to load checkbox prompt:', err);
        alert(`Failed to load prompt: ${err.message}`);
    }
}

console.log('✅ Checkbox script: window.loadCheckboxPrompt defined =', typeof window.loadCheckboxPrompt);

        // Update strictness label and description
        function updateStrictnessLabel(value) {
            const label = document.getElementById('strictnessLabel');
            const description = document.getElementById('strictnessDescription');
            currentStrictness = parseInt(value);
            
            switch(currentStrictness) {
                case 1:
                    label.textContent = 'Lenient';
                    label.className = 'text-sm font-medium text-green-600';
                    description.innerHTML = '<strong>Lenient:</strong> Accepts partial understanding and conceptual grasp. Good for open discussions.';
                    break;
                case 2:
                    label.textContent = 'Moderate';
                    label.className = 'text-sm font-medium text-blue-600';
                    description.innerHTML = '<strong>Moderate:</strong> Balanced evaluation requiring both concept and key details.';
                    break;
                case 3:
                    label.textContent = 'Strict';
                    label.className = 'text-sm font-medium text-red-600';
                    description.innerHTML = '<strong>Strict:</strong> Requires precise, complete answers with all rubric details. Best for assessments.';
                    break;
            }
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            // Only run if we're on the checkbox dashboard (check for checkbox-specific elements)
            const sessionCodeEl = document.getElementById('sessionCode');
            if (!sessionCodeEl) {
                console.log('Checkbox script: Not on checkbox dashboard, skipping initialization');
                return;
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            updateRecordingButtons(false);
            // Do NOT auto-load test data; only use teacher inputs or selected templates
            createSession(); // Create session automatically like admin.html
        });

        // Create new session automatically
        async function createSession() {
            try {
                const response = await fetch('/api/new-session');
                const data = await response.json();
                sessionCode = data.code;
                document.getElementById('sessionCode').textContent = sessionCode;
                socket.emit('admin_join', { code: sessionCode });
                console.log('📋 Checkbox mode session created:', sessionCode);
                
                // Clear any existing data to start fresh
                groups.clear();
                currentCriteria = [];
                currentScenario = "";

                // Load existing session data if available
                await loadExistingSessionData();
                applyCriteriaFromQuery();
            } catch (err) {
                console.error('Failed to create session:', err);
                showError('Failed to create session. Please refresh the page.');
            }
        }

        // Helper function to save criteria to backend without UI feedback
        async function saveCriteriaToBackend() {
            try {
                // First cleanup any old data for this session
                await fetch(`/api/cleanup/${sessionCode}`, { method: 'POST' });
                
                const response = await fetch('/api/checkbox/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionCode: sessionCode,
                        criteria: currentCriteria,
                        scenario: currentScenario || "Academic discussion session",
                        interval: parseInt(document.getElementById('intervalInput').value) * 1000,
                        strictness: currentStrictness // Add strictness level
                    })
                });

                if (response.ok) {
                    console.log('📋 Criteria auto-saved to backend:', currentCriteria.length, 'items with strictness:', currentStrictness);
                    criteriaSavedOnce = true;
                } else {
                    console.warn('📋 Failed to auto-save criteria:', response.status);
                }
            } catch (err) {
                console.warn('📋 Error auto-saving criteria:', err);
            }
        }

        // Load existing session data including checkbox progress
        async function loadExistingSessionData() {
            try {
                console.log('📋 Loading existing session data for:', sessionCode);
                
                const response = await fetch(`/api/checkbox/${sessionCode}`);
                if (response.ok) {
                    const data = await response.json();
                    console.log('📋 Existing session data loaded:', data);
                    
                    if (data.success && data.criteriaWithProgress) {
                        // Update current criteria with existing progress
                        currentCriteria = data.criteriaWithProgress.map((item, index) => ({
                            id: index,
                            description: item.description,
                            completed: item.completed,
                            quote: item.quote || item.evidence
                        }));
                        
                        console.log('📋 Loaded existing criteria with progress:', currentCriteria.length, 'items');
                        
                        // If we have scenario data, update the UI
                        if (data.scenario) {
                            currentScenario = data.scenario;
                            document.getElementById('scenarioInput').value = data.scenario;
                        }
                        
                        // Update criteria input to show loaded criteria
                        const criteriaText = data.criteriaWithProgress.map(c => c.description).join('\n');
                        document.getElementById('criteriaInput').value = criteriaText;
                        
                        // Show feedback about loaded data
                        const completedCount = currentCriteria.filter(c => c.completed).length;
                        if (completedCount > 0) {
                            showFeedback(`✅ Loaded existing session with ${completedCount}/${currentCriteria.length} criteria already completed`, 'success');
                        }
                    }
                } else if (response.status === 404) {
                    console.log('📋 No existing checkbox session found - this is normal for new sessions');
                } else {
                    console.warn('📋 Failed to load existing session data:', response.status);
                }
            } catch (err) {
                console.warn('📋 Error loading existing session data (this is normal for new sessions):', err.message);
            }
        }

        // Removed setupHardcodedCriteria (no test utilities in production)

        // (Test data loader removed for production)

        // Toggle criteria editor
        function toggleCriteriaEditor() {
            const editor = document.getElementById('criteriaEditor');
            const chevron = document.getElementById('criteriaChevron');
            
            if (editor.classList.contains('hidden')) {
                editor.classList.remove('hidden');
                chevron.classList.add('rotate-180');
            } else {
                editor.classList.add('hidden');
                chevron.classList.remove('rotate-180');
            }
        }

        function collapseCriteriaEditor() {
            const editor = document.getElementById('criteriaEditor');
            const chevron = document.getElementById('criteriaChevron');
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

        function applyCriteriaFromQuery() {
            // Read query params fresh each time (important for React Router client-side nav)
            const checkboxQueryParams = new URLSearchParams(window.location.search);
            scenarioFromQuery = checkboxQueryParams.get('scenario');
            criteriaFromQuery = checkboxQueryParams.get('criteria');
            strictnessFromQuery = checkboxQueryParams.get('strictness');

            console.log('🔍 applyCriteriaFromQuery called with:', {
                url: window.location.href,
                scenarioFromQuery,
                criteriaFromQuery: criteriaFromQuery?.substring(0, 100),
                strictnessFromQuery
            });

            if (!scenarioFromQuery && !criteriaFromQuery && !strictnessFromQuery) {
                console.log('⚠️ No query params to apply');
                return;
            }

            const scenarioEl = document.getElementById('scenarioInput');
            const criteriaEl = document.getElementById('criteriaInput');
            const strictnessEl = document.getElementById('strictnessSlider');

            console.log('📝 Found elements:', {
                scenarioEl: !!scenarioEl,
                criteriaEl: !!criteriaEl,
                strictnessEl: !!strictnessEl
            });

            if (scenarioFromQuery && scenarioEl) {
                scenarioEl.value = scenarioFromQuery;
                currentScenario = scenarioFromQuery;
                console.log('✅ Set scenario:', scenarioFromQuery);
            }

            if (criteriaFromQuery && criteriaEl) {
                criteriaEl.value = criteriaFromQuery;
                console.log('✅ Set criteria, calling updateCriteria()');
                updateCriteria();
            } else if (scenarioFromQuery) {
                console.log('✅ Only scenario, calling updateDisplay()');
                updateDisplay();
            }

            const strictnessVal = Number(strictnessFromQuery);
            if (strictnessEl && Number.isFinite(strictnessVal) && strictnessVal >= 1 && strictnessVal <= 3) {
                strictnessEl.value = strictnessVal;
                updateStrictnessLabel(strictnessVal);
                console.log('✅ Set strictness:', strictnessVal);
            }

            collapseCriteriaEditor();
            showFeedback('Criteria loaded from prompt library', 'success');
            removeQueryParams('scenario', 'criteria', 'strictness', 'mode');
            scenarioFromQuery = null;
            criteriaFromQuery = null;
            strictnessFromQuery = null;
            console.log('✅ applyCriteriaFromQuery completed');
        }

        // Clear criteria
        function clearCriteria() {
            document.getElementById('scenarioInput').value = '';
            document.getElementById('criteriaInput').value = '';
            currentCriteria = [];
            currentScenario = "";
            showFeedback('Criteria cleared', 'info');
        }

        // Save and apply criteria
        async function saveCriteria() {
            const scenario = document.getElementById('scenarioInput').value.trim();
            const criteriaText = document.getElementById('criteriaInput').value.trim();
            
            if (!criteriaText) {
                showFeedback('Please enter at least one criterion', 'error');
                return;
            }

            // Parse criteria with rubrics in parentheses format: "Description (Rubric)"
            const criteriaLines = criteriaText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            currentCriteria = criteriaLines.map((line, index) => {
                const trimmedLine = line.trim();
                
                // Extract description and rubric using regex
                const match = trimmedLine.match(/^(.+?)\s*\((.+)\)\s*$/);
                
                if (match) {
                    // Format: "Description (Rubric)"
                    return {
                id: index,
                        description: match[1].trim(),
                        rubric: match[2].trim(),
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                } else {
                    // Fallback: treat entire line as description
                    return {
                        id: index,
                        description: trimmedLine,
                        rubric: "No specific rubric provided",
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                }
            });
            currentScenario = scenario;

            // Update the display to show parsed criteria
            updateDisplay();

            // Save to backend
            try {
                const response = await fetch('/api/checkbox/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionCode: sessionCode,
                        criteria: currentCriteria,
                        scenario: scenario,
                        interval: parseInt(document.getElementById('intervalInput').value) * 1000,
                        strictness: currentStrictness // Add strictness level
                    })
                });

                if (response.ok) {
                    showFeedback(`Criteria saved successfully! ${currentCriteria.length} criteria ready (Strictness: ${['', 'Lenient', 'Moderate', 'Strict'][currentStrictness]}).`, 'success');
                    console.log('📋 Criteria saved:', currentCriteria.length, 'items with rubrics, strictness:', currentStrictness);
                    criteriaSavedOnce = true;
                    collapseCriteriaEditor();
                } else {
                    showFeedback('Failed to save criteria', 'error');
                }
            } catch (err) {
                console.error('Error saving criteria:', err);
                showFeedback('Error saving criteria', 'error');
            }
        }

        // Helper: build payload for fast OpenAI calls
        function getCurrentCheckboxConfig() {
            return {
                scenario: currentScenario || document.getElementById('scenarioInput').value.trim(),
                criteria: currentCriteria && currentCriteria.length > 0
                    ? currentCriteria.map(c => ({ description: c.description, rubric: c.rubric || '' }))
                    : (document.getElementById('criteriaInput').value.trim().split('\n')
                        .map(line => line.trim()).filter(Boolean).map((line) => {
                            const m = line.match(/^(.+?)\s*\((.+)\)\s*$/);
                            return m ? { description: m[1].trim(), rubric: m[2].trim() } : { description: line, rubric: '' };
                        }))
            };
        }

        // Show feedback message
        function showFeedback(message, type) {
            const feedback = document.getElementById('criteriaFeedback');
            const colors = {
                success: 'bg-green-50 border-green-200 text-green-800',
                error: 'bg-red-50 border-red-200 text-red-800',
                info: 'bg-blue-50 border-blue-200 text-blue-800'
            };
            
            feedback.className = `p-4 rounded-lg border ${colors[type]}`;
            feedback.textContent = message;
            feedback.classList.remove('hidden');
            
            if (type !== 'error') {
                setTimeout(() => {
                    feedback.classList.add('hidden');
                }, 3000);
            }
        }

        // Alias used by the prompt modal flows
        function showCriteriaFeedback(message, type) {
            return showFeedback(message, type);
        }

        // Show error message
        function showError(message) {
            showFeedback(message, 'error');
        }

        // Update group with checkbox data
        function updateGroup(groupNumber, data) {
            // Hide empty state and show grid
            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('groupsGrid').classList.remove('hidden');
            
            let groupEl = document.getElementById(`group-${groupNumber}`);
            if (!groupEl) {
                groupEl = document.createElement('div');
                groupEl.id = `group-${groupNumber}`;
                groupEl.className = 'animate-fade-in';
                document.getElementById('groupsGrid').appendChild(groupEl);
            }
            
            // Update group data - initialize with existing progress if available
            const groupData = groups.get(groupNumber) || {
                transcripts: [],
                checkboxes: currentCriteria.length > 0 ? currentCriteria.map(c => ({
                    id: c.id,
                    description: c.description,
                    rubric: c.rubric,
                    completed: c.completed || false,
                    quote: c.quote || null,
                    status: c.status || 'grey'
                })) : [], // Use currentCriteria if available, otherwise empty array
                stats: {},
                isReleased: false
            };

            if (typeof data.isReleased === 'boolean') {
                groupData.isReleased = data.isReleased;
            }
            
            // Handle new transcript data - improved handling
            if (data.latestTranscript) {
                console.log('📝 Adding transcript to group', groupNumber, ':', data.latestTranscript);
                
                // Check if this transcript is already added (avoid duplicates)
                const isDuplicate = groupData.transcripts.some(t => 
                    t.text === data.latestTranscript && 
                    Math.abs(t.timestamp - Date.now()) < 5000 // Within 5 seconds
                );
                
                if (!isDuplicate) {
                groupData.transcripts.push({
                    text: data.latestTranscript,
                        timestamp: Date.now(),
                        duration: data.transcriptDuration || 0,
                        wordCount: data.transcriptWordCount || 0
                    });
                    
                    // Do not trim; keep full history so "Show All" truly shows all
                    
                console.log('📚 Group', groupNumber, 'now has', groupData.transcripts.length, 'transcript segments');
            } else {
                    console.log('🔄 Skipping duplicate transcript for group', groupNumber);
                }
            }
            
            // Handle existing transcripts data (when loading from database)
            if (data.existingTranscripts && data.existingTranscripts.length > 0) {
                console.log('📂 Loading existing transcripts for group', groupNumber, ':', data.existingTranscripts.length, 'segments');
                groupData.transcripts = data.existingTranscripts;
            }

            // Handle checkbox updates from AI processing
            if (data.checkboxUpdates) {
                console.log('🔄 Processing', data.checkboxUpdates.length, 'checkbox updates');
                console.log('🔄 Current checkboxes before update:', groupData.checkboxes.map(c => ({id: c.id, completed: c.completed, status: c.status})));
                
                data.checkboxUpdates.forEach(update => {
                    console.log('🔄 Looking for checkbox with id:', update.criteriaId, 'in checkboxes:', groupData.checkboxes.map(c => c.id));
                    const checkbox = groupData.checkboxes.find(c => c.id === update.criteriaId);
                    if (checkbox) {
                        console.log('✅ Found checkbox, updating:', checkbox.id, 'to completed:', update.completed, 'status:', update.status);
                        // Only update if not already completed with correct status (preserve original correct answers)
                        if (!checkbox.completed || checkbox.status !== 'green') {
                        checkbox.completed = update.completed;
                        checkbox.quote = update.quote;
                            checkbox.status = update.status || 'grey'; // green, red, or grey
                        } else {
                            console.log('📋 Checkbox', checkbox.id, 'already completed correctly - preserving green status and quote:', checkbox.quote);
                        }
                    } else {
                        console.warn('❌ Could not find checkbox with id:', update.criteriaId);
                    }
                });
                
                console.log('🔄 Current checkboxes after update:', groupData.checkboxes.map(c => ({id: c.id, completed: c.completed, status: c.status})));
            }
            
            // Assign rebuilt, ordered, de-duplicated list
            groupData.checkboxes = (groupData.checkboxes || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
            groups.set(groupNumber, groupData);
            
            // Update UI
            const completedCount = groupData.checkboxes.filter(c => c.completed).length;
            const totalCount = groupData.checkboxes.length;
            const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isReleased = Boolean(groupData.isReleased);
            const releaseButtonClasses = `${isReleased ? 'bg-green-500 hover:bg-green-600 text-white border border-green-600' : 'bg-white hover:bg-slate-50 text-black border border-slate-200'} px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1`;
            const releaseButtonIcon = isReleased ? 'check' : 'send';
            const releaseButtonLabel = isReleased ? 'Checklist Released' : 'Release Checklist';
            const releaseButtonTitle = isReleased ? 'Students are currently viewing this checklist. Click to re-release if you made changes.' : 'Send current checklist progress to students';

            groupEl.innerHTML = `
                <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-xl">
                    <!-- Group Header -->
                        <div class="p-4 sm:p-6 bg-gray-100 text-black border-t border-gray-200">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg">
                                    ${groupNumber}
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold">Group ${groupNumber}</h3>
                                    <p class="text-sm opacity-90">${completedCount}/${totalCount} criteria completed</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-3">
                                 <button 
                                     data-release-button="${groupNumber}"
                                     onclick="releaseChecklistToGroup(${groupNumber})" 
                                     class="${releaseButtonClasses}"
                                     title="${releaseButtonTitle}"
                                 >
                                     <i data-lucide="${releaseButtonIcon}" class="w-3 h-3"></i>
                                     <span>${releaseButtonLabel}</span>
                                 </button>
                            </div>
                        </div>
                        <div class="mt-3">
                            <div class="flex items-center justify-between text-sm mb-2">
                                <span>Progress</span>
                                <span>${completionRate}%</span>
                            </div>
                            <div class="w-full bg-white/20 rounded-full h-2">
                                <div 
                                    class="bg-white h-2 rounded-full transition-all duration-300" 
                                    style="width: ${completionRate}%"
                                ></div>
                            </div>
                        </div>
                    </div>

                    <!-- Checkbox List -->
                    <div class="p-6">
                        <div class="space-y-3">
                            ${groupData.checkboxes.map((checkbox, index) => {
                                // Determine colors based on status
                                let bgColor, borderColor, checkColor, textColor;
                                switch(checkbox.status || 'grey') {
                                    case 'green':
                                        bgColor = 'bg-green-50';
                                        borderColor = 'border-green-200';
                                        checkColor = 'text-green-600';
                                        textColor = 'text-green-800';
                                        break;
                                    case 'red':
                                        bgColor = 'bg-red-50';
                                        borderColor = 'border-red-200';
                                        checkColor = 'text-red-600';
                                        textColor = 'text-red-800';
                                        break;
                                    default: // grey
                                        bgColor = 'bg-gray-50';
                                        borderColor = 'border-gray-200';
                                        checkColor = 'text-gray-400';
                                        textColor = 'text-gray-700';
                                }
                                
                                return `
                                    <div class="flex items-start space-x-3 p-3 ${bgColor} ${borderColor} border rounded-lg">
                                    <div class="flex-shrink-0 mt-1">
                                            ${checkbox.completed ? 
                                                `<i data-lucide="check-circle" class="w-5 h-5 ${checkColor}"></i>` : 
                                                `<i data-lucide="circle" class="w-5 h-5 ${checkColor}"></i>`
                                            }
                                    </div>
                                    <div class="flex-1 min-w-0">
                                            <div class="text-sm font-medium ${textColor} mb-1">
                                                ${checkbox.description}
                                            </div>
                                            <div class="text-xs text-gray-600 italic mb-2">
                                                Rubric: ${checkbox.rubric}
                                            </div>
                                            ${checkbox.quote ? `
                                                <div class="text-xs ${textColor} bg-white bg-opacity-50 rounded px-2 py-1 border-l-2 ${checkbox.status === 'green' ? 'border-green-400' : checkbox.status === 'red' ? 'border-red-400' : 'border-gray-400'}">
                                                "${checkbox.quote}"
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                        
                        ${groupData.transcripts.length > 0 ? `
                            <div class="mt-6 pt-4 border-t border-gray-100">
                                <div class="flex items-center justify-between mb-3">
                                    <h4 class="text-sm font-medium text-gray-700">Discussion Transcripts (${groupData.transcripts.length})</h4>
                                    <button onclick="toggleTranscripts(${groupNumber})" id="toggleTranscripts-${groupNumber}" class="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors flex items-center">
                                        <i data-lucide="chevron-down" class="w-3 h-3 mr-1"></i>
                                        Show All
                                    </button>
                                </div>
                                
                                <!-- Latest transcript preview -->
                                <div class="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-xs font-medium text-blue-700">Latest (${new Date(groupData.transcripts[groupData.transcripts.length - 1].timestamp).toLocaleTimeString()})</span>
                                        <span class="text-xs text-blue-600">Segment ${groupData.transcripts.length}</span>
                                    </div>
                                    <div class="text-gray-800 whitespace-pre-wrap break-words">
                                        ${groupData.transcripts[groupData.transcripts.length - 1].text}
                                    </div>
                                </div>
                                
                                <!-- Full transcript (collapsible, concatenated) -->
                                <div id="allTranscripts-${groupNumber}" class="hidden">
                                    <div class="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-xs font-medium text-gray-600">Full Transcript</span>
                                            <span class="text-xs text-gray-500">${groupData.transcripts.length} segments combined</span>
                                        </div>
                                        <div class="text-gray-800 whitespace-pre-wrap break-words">${groupData.transcripts.map(t => t.text).join(' ')}</div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;

            // Re-initialize Lucide icons
            lucide.createIcons();
        }

        // Socket event handlers (similar to admin.html)
        socket.on('student_joined', ({ group, socketId }) => {
            console.log(`✅ Student joined group ${group}`);
            updateGroup(group, { isActive: true });
            
            // Fetch existing transcript data for this group
            fetch(`/api/transcripts/${sessionCode}/${group}`)
                .then(async res => {
                    if (!res.ok) return { transcripts: [], summary: null, stats: {} };
                    return res.json();
                })
                .then(data => {
                    console.log('📂 Fetched existing data for group', group, ':', data);
                    
                    // Format existing transcripts with proper structure
                    const formattedTranscripts = data.transcripts.map(t => ({
                        text: t.text,
                        timestamp: new Date(t.created_at).getTime(),
                        duration: t.duration_seconds || 0,
                        wordCount: t.word_count || 0
                    }));
                    
                    console.log('📂 Formatted', formattedTranscripts.length, 'existing transcripts for group', group);
                    
                    updateGroup(group, {
                        existingTranscripts: formattedTranscripts,
                        stats: data.stats,
                        isActive: true
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

        // ===== Heartbeat support (admin-side for checkbox dashboard) =====
        let heartbeatInterval = null;
        let connectionCheckInterval = null;
        let lastHeartbeatTime = Date.now();
        let isConnectionHealthy = null;
        function startHeartbeat() {
            // Send heartbeat every 10 seconds
            heartbeatInterval = setInterval(() => {
                if (socket.connected && sessionCode) {
                    socket.emit('admin_heartbeat', { sessionCode });
                    console.log('💓 Admin heartbeat sent (checkbox)');
                }
            }, 10000);
            
            // Check connection status every 3 seconds with 25s tolerance
            connectionCheckInterval = setInterval(() => {
                const now = Date.now();
                const timeSinceLastHeartbeat = now - lastHeartbeatTime;
                const connected = timeSinceLastHeartbeat <= 25000;
                updateConnectionStatus(connected);
            }, 3000);
        }
        // Minimal connection status updater for checkbox header
        function updateConnectionStatus(connected, force = false) {
            if (!force && connected === isConnectionHealthy) return;
            isConnectionHealthy = connected;

            const dot = document.getElementById('connectionDot');
            const text = document.getElementById('connectionText');
            const pill = document.getElementById('connectionStatus');

            if (connected) {
                if (dot) dot.className = 'w-2 h-2 bg-green-500 rounded-full animate-ping-slow';
                if (text) {
                    text.textContent = 'Connected';
                    text.className = 'text-xs md:text-sm font-medium text-green-700';
                }
                if (pill) {
                    pill.className = 'flex items-center justify-center space-x-2 bg-green-50 px-3 py-2 rounded-full min-h-touch border border-green-200';
                }
            } else {
                if (dot) dot.className = 'w-2 h-2 bg-rose-500 rounded-full animate-pulse';
                if (text) {
                    text.textContent = 'Disconnected';
                    text.className = 'text-xs md:text-sm font-medium text-rose-700';
                }
                if (pill) {
                    pill.className = 'flex items-center justify-center space-x-2 bg-rose-50 px-3 py-2 rounded-full min-h-touch border border-rose-200';
                }
            }
        }
        // Track heartbeat acks
        socket.on('admin_heartbeat_ack', () => {
            lastHeartbeatTime = Date.now();
        });
        // Start heartbeats on load
        document.addEventListener('DOMContentLoaded', () => {
            // Only run if we're on the checkbox dashboard
            if (!document.getElementById('sessionCode')) {
                return;
            }
            startHeartbeat();
        });

        // Listen for checklist state updates (includes real-time progress)
        socket.on('checklist_state', (data) => {
            console.log('📋 Received checklist state update for group', data.groupNumber);
            console.log('📋 Criteria updates:', data.criteria?.length || 0, 'items');
            
            // Get existing group data or create new
            const groupData = groups.get(data.groupNumber) || {
                transcripts: [],
                checkboxes: [],
                stats: {},
                isActive: false
            };
            
            // Build a map of existing checkboxes by id for quick lookup
            const existingById = new Map((groupData.checkboxes || []).map(c => [c.id, c]));
            
            // Use the server's criteria array as the source of truth for order
            const incoming = Array.isArray(data.criteria) ? [...data.criteria] : [];
            // Ensure stable order by id (in case backend sends unsorted)
            incoming.sort((a, b) => Number(a.id) - Number(b.id));
            
            // Rebuild the checkbox list to avoid duplicates and preserve order
            const merged = incoming.map(item => {
                const id = Number(item.id);
                const dbId = item.dbId;
                const prev = existingById.get(id);
                if (prev && prev.status === 'green' && item.status !== 'green') {
                    // Preserve GREEN status and quote from previous state
                    return {
                        ...item,
                        id,
                        dbId,
                        status: 'green',
                        completed: true,
                        quote: prev.quote
                    };
                }
                // Otherwise, trust the server-provided state
                return { ...item, id, dbId };
            });
            
            // Assign rebuilt, ordered, de-duplicated list
            groupData.checkboxes = merged.sort((a, b) => Number(a.id) - Number(b.id));
            if (typeof data.isReleased === 'boolean') {
                groupData.isReleased = data.isReleased;
            }
            groups.set(data.groupNumber, groupData);
            
            // Re-render the group display with the merged data
            updateGroup(data.groupNumber, {
                checkboxUpdates: groupData.checkboxes.map(c => ({
                    criteriaId: c.id,
                    completed: c.completed,
                    quote: c.quote,
                    status: c.status
                })),
                isReleased: groupData.isReleased
            });
        });

        socket.on('admin_update', (data) => {
            console.log('📋 Received checkbox update:', data);
            console.log('📋 Update for group:', data.group);
            console.log('📋 Latest transcript:', data.latestTranscript ? data.latestTranscript : 'None');
            console.log('📋 Checkbox updates received:', data.checkboxUpdates);
            
            // Ensure we always pass transcript data to updateGroup
            const groupData = groups.get(data.group) || { transcripts: [], checkboxes: [] };
            const byDbId = new Map(groupData.checkboxes.map(c => [c.dbId, c]));
            const byIndex = new Map(groupData.checkboxes.map(c => [c.id, c]));
            const safeUpdates = (data.checkboxUpdates || []).map(u => {
                const target = (u.criteriaDbId && byDbId.get(u.criteriaDbId)) || byIndex.get(u.criteriaId);
                if (!target) return u; // fallback
                return { ...u, criteriaId: target.id };
            });
            updateGroup(data.group, {
                latestTranscript: data.latestTranscript,
                checkboxUpdates: safeUpdates,
                isActive: true
            });
        });

        socket.on('connect', () => {
            console.log('🔌 Checkbox admin connected');
            lastHeartbeatTime = Date.now();
            updateConnectionStatus(true, true);
            if (sessionCode) {
                socket.emit('admin_join', { code: sessionCode });
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('🔌 Checkbox admin disconnected:', reason);
            updateConnectionStatus(false, true);
        });

        socket.io.on('reconnect', (attempt) => {
            console.log('🔄 Checkbox admin reconnected after', attempt, 'attempts');
            lastHeartbeatTime = Date.now();
            updateConnectionStatus(true, true);
        });

        // Recording controls (improved responsiveness)
        document.getElementById('startBtn').addEventListener('click', async () => {
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const intervalInput = document.getElementById('intervalInput');
            const scenarioEl = document.getElementById('scenarioInput');
            const criteriaEl = document.getElementById('criteriaInput');
            
            // Prevent multiple clicks
            if (startBtn.disabled || isRecording) {
                console.log('🚫 Start button already processing or recording active');
                return;
            }

            // Validate scenario and criteria presence before starting
            const scenarioText = (scenarioEl?.value || '').trim();
            const criteriaLines = (criteriaEl?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
            let missing = [];
            if (!scenarioText) missing.push('scenario');
            if (criteriaLines.length === 0) missing.push('at least one criterion');
            if (missing.length > 0) {
                // Expand criteria editor for the user
                const editor = document.getElementById('criteriaEditor');
                const chevron = document.getElementById('criteriaChevron');
                if (editor && editor.classList.contains('hidden')) {
                    editor.classList.remove('hidden');
                    if (chevron) chevron.classList.add('rotate-180');
                }
                // Highlight missing fields
                if (!scenarioText && scenarioEl) scenarioEl.classList.add('ring-2','ring-red-400','border-red-400');
                if (criteriaLines.length === 0 && criteriaEl) criteriaEl.classList.add('ring-2','ring-red-400','border-red-400');
                showFeedback(`Please set the ${missing.join(' and ')} before starting. You can type them or pick a prompt from the library.`, 'error');
                return;
            }
            // Clear any previous highlight
            scenarioEl?.classList.remove('ring-2','ring-red-400','border-red-400');
            criteriaEl?.classList.remove('ring-2','ring-red-400','border-red-400');
            
            // Ensure in-memory structures are populated from current inputs
            if (currentCriteria.length === 0 || currentScenario !== scenarioText) {
                updateCriteria();
            }
            
            // Immediate UI feedback - disable button and show loading
            startBtn.disabled = true;
            startBtn.innerHTML = START_HTML_SPINNER;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            try {
                console.log('🎬 Start Recording button clicked');
                
                // Step 1: Ensure criteria are loaded, but don't block recording start
                showFeedback('📋 Preparing criteria...', 'info');
                if (currentCriteria.length === 0) {
                    console.log('📋 No criteria found. Will start recording immediately and save criteria when available.');
                } else {
                    console.log('📋 Using criteria:', currentCriteria.length, 'items');
                }

                // Step 2: Start the recording session IMMEDIATELY (no waiting on criteria save)
                showFeedback('▶️ Starting recording session...', 'info');
                console.log('▶️ Starting recording session...');
                const intervalSeconds = parseInt(intervalInput.value) || 30;
                const intervalMs = intervalSeconds * 1000;
                
                const response = await fetch(`/api/session/${sessionCode}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interval: intervalMs })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Start session failed:', response.status, errorText);
                    throw new Error(`Failed to start recording: HTTP ${response.status}`);
                }
                
                console.log('✅ Recording session started successfully');
                
                updateRecordingButtons(true);
                intervalInput.disabled = true;

                // Start elapsed timer
                recordingStart = Date.now();
                if (elapsedInterval) {
                    clearInterval(elapsedInterval);
                }
                elapsedInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
                    const m = Math.floor(elapsed / 60);
                    const s = elapsed % 60;
                    document.getElementById('timeElapsed').textContent = `${m}:${s.toString().padStart(2,'0')}`;
                }, 1000);

                isRecording = true;
                showFeedback(`✅ Recording started! Session: ${sessionCode} | ${currentCriteria.length} criteria active | Students can now join and discuss.`, 'success');
                
                // Step 3: Save criteria IN THE BACKGROUND so start feels instant
                if (!criteriaSavedOnce && currentCriteria.length > 0) {
                    (async () => {
                        try {
                            console.log('💾 Saving criteria to backend (background)...');
                            const bgRes = await fetch('/api/checkbox/session', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    sessionCode: sessionCode,
                                    criteria: currentCriteria,
                                    scenario: currentScenario || 'Chemistry discussion session',
                                    interval: intervalMs,
                                    strictness: currentStrictness
                                })
                            });
                            if (bgRes.ok) {
                                criteriaSavedOnce = true;
                                console.log('✅ Criteria saved (background)');
                            } else {
                                const text = await bgRes.text();
                                console.warn('⚠️ Criteria save failed (background):', text);
                            }
                        } catch (e) {
                            console.warn('⚠️ Criteria background save error:', e);
                        }
                    })();
                }

                // Re-create icons after updating button HTML
                lucide.createIcons();
                
            } catch (err) {
                console.error('❌ Failed to start session:', err);
                showError(`Failed to start recording: ${err.message}`);
                
                // Reset UI on error
                updateRecordingButtons(false);
                intervalInput.disabled = false;
                isRecording = false;
            }
        });
        
        document.getElementById('stopBtn').addEventListener('click', async () => {
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const intervalInput = document.getElementById('intervalInput');
            
            // Prevent multiple clicks
            if (stopBtn.disabled || !isRecording) {
                console.log('🚫 Stop button already processing or not recording');
                return;
            }
            
            // Immediate UI feedback
            stopBtn.disabled = true;
            stopBtn.innerHTML = STOP_HTML_SPINNER;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            try {
                showFeedback('⏹️ Stopping recording...', 'info');
                
                const response = await fetch(`/api/session/${sessionCode}/stop`, { method: 'POST' });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Update UI for stopped state
                updateRecordingButtons(false);
                intervalInput.disabled = false;

                // Stop elapsed timer
                if (elapsedInterval) {
                    clearInterval(elapsedInterval);
                    elapsedInterval = null;
                }
                document.getElementById('timeElapsed').textContent = '0:00';
                isRecording = false;
                
                showFeedback('⏹️ Recording stopped successfully!', 'success');
                
            } catch (err) {
                console.error('❌ Failed to stop session:', err);
                showError(`Failed to stop recording: ${err.message}`);
                
                updateRecordingButtons(true);
            }
        });

        

        // Toggle transcripts display (replaces modal)
        function toggleTranscripts(groupNumber) {
            const allTranscriptsDiv = document.getElementById(`allTranscripts-${groupNumber}`);
            const toggleButton = document.getElementById(`toggleTranscripts-${groupNumber}`);
            
            if (allTranscriptsDiv.classList.contains('hidden')) {
                // Show all transcripts
                allTranscriptsDiv.classList.remove('hidden');
                toggleButton.innerHTML = `
                    <i data-lucide="chevron-up" class="w-3 h-3 mr-1"></i>
                    Hide All
                `;
            } else {
                // Hide all transcripts
                allTranscriptsDiv.classList.add('hidden');
                toggleButton.innerHTML = `
                    <i data-lucide="chevron-down" class="w-3 h-3 mr-1"></i>
                    Show All
                `;
            }
            
            // Re-initialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        // Initialize checkbox prompt library on page load with timeout fallback
        document.addEventListener('DOMContentLoaded', () => {
            // Only run if we're on the checkbox dashboard
            const libraryGrid = document.getElementById('checkboxPromptLibraryGrid');
            if (!libraryGrid) {
                return;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            (async () => {
                try {
                    await loadCheckboxPromptLibrary(controller.signal);
                } catch (e) {
                    if (e?.name === 'AbortError') {
                        console.debug('Checkbox prompt library request aborted.');
                        return;
                    }
                    const grid = document.getElementById('checkboxPromptLibraryGrid');
                    if (grid) {
                        grid.innerHTML = `
                            <div class="flex items-center justify-center py-8 text-red-500 text-sm col-span-full">
                                <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                                Failed to load prompts: ${e.message}
                                <button class="ml-3 underline" onclick="refreshCheckboxPrompts()">Retry</button>
                            </div>`;
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    }
                } finally {
                    clearTimeout(timeout);
                }
            })();
        });
        
        // ===================
        // CHECKBOX PROMPT MANAGEMENT
        // ===================
        
        let currentCheckboxPrompts = [];
        let availableCheckboxCategories = [];
        
        // Load checkbox prompt library from API
        async function loadCheckboxPromptLibrary(signal) {
            try {
                const response = await fetch('/api/prompts?mode=checkbox&limit=50', { signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                currentCheckboxPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                availableCheckboxCategories = Array.isArray(data?.filters?.categories) ? data.filters.categories : [];
                
                updateCheckboxCategoryFilter();
                displayCheckboxPromptLibrary(data.prompts);
                
            } catch (err) {
                if (err?.name === 'AbortError') {
                    console.debug('Checkbox prompt library fetch aborted.');
                    return;
                }
                console.error('❌ Failed to load checkbox prompt library:', err);
                const grid = document.getElementById('checkboxPromptLibraryGrid');
                if (grid) {
                    grid.innerHTML = `
                        <div class="flex items-center justify-center py-8 text-red-500 text-sm col-span-full">
                            <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                            Failed to load prompts: ${err.message}
                            <button class="ml-3 underline" onclick="refreshCheckboxPrompts()">Retry</button>
                        </div>
                    `;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            }
        }
        
        // Refresh checkbox prompt library
        function refreshCheckboxPrompts() {
            const grid = document.getElementById('checkboxPromptLibraryGrid');
            if (grid) {
                grid.innerHTML = `
                    <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                        <i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i>
                        Refreshing prompts...
                    </div>
                `;
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
            loadCheckboxPromptLibrary();
        }
        
        // Update checkbox category filter options
        function updateCheckboxCategoryFilter() {
            const categoryFilter = document.getElementById('checkboxPromptCategoryFilter');
            if (!categoryFilter) return;
            const currentValue = categoryFilter.value;
            
            // Clear existing options (except "All Categories")
            while (categoryFilter.children.length > 1) {
                categoryFilter.removeChild(categoryFilter.lastChild);
            }
            
            // Add category options
            availableCheckboxCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            });
            
            // Restore selection
            categoryFilter.value = currentValue;
        }
        
        // Display checkbox prompt library
        function displayCheckboxPromptLibrary(prompts) {
            const grid = document.getElementById('checkboxPromptLibraryGrid');
            if (!grid) return;
            
            if (prompts.length === 0) {
                grid.innerHTML = `
                    <div class="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                        <i data-lucide="file-text" class="w-4 h-4 mr-2"></i>
                        No checkbox prompts found
                    </div>
                `;
                lucide.createIcons();
                    return;
                }
                
            const promptsHtml = prompts.map(prompt => {
                // Parse the prompt content to get scenario and criteria
                const lines = prompt.content.split('\n').filter(line => line.trim());
                const isScenarioHeader = lines.length > 0 && /^\s*scenario\s*:/i.test(lines[0]);
                const criteriaCount = isScenarioHeader ? Math.max(0, lines.length - 1) : lines.length;
                
                    return `
                    <div class="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200" onclick="console.log('📍 Div clicked'); window.loadCheckboxPrompt('${prompt._id}')">
                        <div class="flex items-start justify-between mb-2">
                            <h5 class="text-sm font-medium text-gray-900 truncate flex-1 mr-2">${prompt.title}</h5>
                            <div class="flex items-center space-x-1 flex-shrink-0">
                                ${prompt.isPublic ? '<i data-lucide="globe" class="w-3 h-3 text-green-500" title="Public"></i>' : '<i data-lucide="lock" class="w-3 h-3 text-gray-400" title="Private"></i>'}
                                <button onclick="event.stopPropagation(); editCheckboxPrompt('${prompt._id}')" class="text-blue-500 hover:text-blue-700" title="Edit">
                                    <i data-lucide="edit" class="w-3 h-3"></i>
                                </button>
                                <button onclick="event.stopPropagation(); deleteCheckboxPrompt('${prompt._id}')" class="text-red-500 hover:text-red-700" title="Delete">
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
                                <span class="text-xs text-gray-500">${criteriaCount} criteria</span>
                            </div>
                            <div class="text-xs text-gray-500">
                                ${prompt.usage_count || 0} uses
                            </div>
                            </div>
                        </div>
                    `;
                }).join('');
                
            grid.innerHTML = promptsHtml;
            lucide.createIcons();
        }
        
        // Filter checkbox prompts
        function filterCheckboxPrompts() {
            const search = document.getElementById('checkboxPromptSearch').value.toLowerCase();
            const category = document.getElementById('checkboxPromptCategoryFilter').value;
            
            let filteredPrompts = currentCheckboxPrompts.filter(prompt => {
                const matchesSearch = !search || 
                    prompt.title.toLowerCase().includes(search) ||
                    (prompt.description && prompt.description.toLowerCase().includes(search)) ||
                    prompt.content.toLowerCase().includes(search) ||
                    (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(search)));
                
                const matchesCategory = !category || prompt.category === category;
                
                return matchesSearch && matchesCategory;
            });
            
            displayCheckboxPromptLibrary(filteredPrompts);
        }
        
        // Load checkbox prompt function has been moved to the top of the file for global availability
        
        // Open create checkbox prompt modal
        function openCreateCheckboxPromptModal() {
            document.getElementById('createCheckboxPromptModalTitle').textContent = 'Create New Checkbox Prompt';
            document.getElementById('createCheckboxPromptSubmitText').textContent = 'Create Prompt';
            document.getElementById('createCheckboxPromptForm').reset();
            document.getElementById('editCheckboxPromptId').value = '';
            document.getElementById('newCheckboxPromptMode').value = 'checkbox';
            
            // Pre-fill with current form data if available
            const currentScenario = document.getElementById('scenarioInput').value;
            const currentCriteria = document.getElementById('criteriaInput').value;
            
            if (currentScenario) {
                document.getElementById('newCheckboxPromptScenario').value = currentScenario;
            }
            if (currentCriteria) {
                document.getElementById('newCheckboxPromptContent').value = currentCriteria;
            }
            
            document.getElementById('createCheckboxPromptModal').classList.remove('hidden');
        }
        
        // Close create checkbox prompt modal
        function closeCreateCheckboxPromptModal() {
            document.getElementById('createCheckboxPromptModal').classList.add('hidden');
        }

        // QR modal helpers
        window.openQrModal = function openQrModal() {
            const codeEl = document.getElementById('sessionCode');
            const code = (codeEl?.textContent || '').trim();
            if (!code) return;
            const url = `${window.location.origin}/student?code=${encodeURIComponent(code)}`;
            const container = document.getElementById('qrCodeContainer');
            const linkEl = document.getElementById('qrLink');
            if (container) {
                container.innerHTML = '';
                try { new QRCode(container, { text: url, width: 220, height: 220 }); } catch (_) {}
            }
            if (linkEl) linkEl.textContent = url;
            const modal = document.getElementById('qrModal');
            if (modal) modal.classList.remove('hidden');
        }

        window.closeQrModal = function closeQrModal() {
            const modal = document.getElementById('qrModal');
            if (modal) modal.classList.add('hidden');
        }

        // Edit checkbox prompt
        async function editCheckboxPrompt(promptId) {
            try {
                const response = await fetch(`/api/prompts/${promptId}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                const prompt = data.prompt;
                
                document.getElementById('createCheckboxPromptModalTitle').textContent = 'Edit Checkbox Prompt';
                document.getElementById('createCheckboxPromptSubmitText').textContent = 'Update Prompt';
                document.getElementById('editCheckboxPromptId').value = prompt._id;
                document.getElementById('newCheckboxPromptTitle').value = prompt.title;
                document.getElementById('newCheckboxPromptDescription').value = prompt.description || '';
                // Derive scenario/content from stored prompt. Prefer explicit scenario field; if missing, parse from content header
                (function populateScenarioAndContent() {
                    let scenarioVal = (prompt.scenario || '').trim();
                    let contentVal = (prompt.content || '').trim();
                    if (!scenarioVal && contentVal) {
                        const lines = contentVal.split('\n').filter(l => l.trim().length > 0);
                        if (lines.length > 0 && /^\s*scenario\s*:/i.test(lines[0])) {
                            scenarioVal = lines[0].replace(/^\s*scenario\s*:\s*/i, '').trim();
                            contentVal = lines.slice(1).join('\n');
                        }
                    }
                    document.getElementById('newCheckboxPromptScenario').value = scenarioVal;
                    document.getElementById('newCheckboxPromptContent').value = contentVal;
                })();
                document.getElementById('newCheckboxPromptCategory').value = prompt.category;
                document.getElementById('newCheckboxPromptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
                document.getElementById('newCheckboxPromptVisibility').value = prompt.isPublic.toString();
                document.getElementById('newCheckboxPromptAuthor').value = prompt.authorName || '';
                document.getElementById('newCheckboxPromptMode').value = prompt.mode;
                
                document.getElementById('createCheckboxPromptModal').classList.remove('hidden');
                
            } catch (err) {
                console.error('❌ Failed to load checkbox prompt for editing:', err);
                alert(`Failed to load prompt: ${err.message}`);
            }
        }
        
        // Delete checkbox prompt
        async function deleteCheckboxPrompt(promptId) {
            const prompt = currentCheckboxPrompts.find(p => p._id === promptId);
            if (!prompt) return;
            
            if (!confirm(`Are you sure you want to delete "${prompt.title}"? This action cannot be undone.`)) {
                return;
            }
            
            try {
                const response = await fetch(`/api/prompts/${promptId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                showCriteriaFeedback(`✅ Deleted checkbox prompt: "${prompt.title}"`, 'success');
                refreshCheckboxPrompts();
                
            } catch (err) {
                console.error('❌ Failed to delete checkbox prompt:', err);
                showCriteriaFeedback(`❌ Failed to delete prompt: ${err.message}`, 'error');
            }
        }
        
        // Handle create/edit checkbox prompt form submission
        async function handleCreateCheckboxPromptSubmit(e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            
            const promptId = document.getElementById('editCheckboxPromptId').value;
            const isEdit = Boolean(promptId);
            
            const formData = {
                title: document.getElementById('newCheckboxPromptTitle').value,
                description: document.getElementById('newCheckboxPromptDescription').value,
                // Persist scenario explicitly AND redundantly as first line of content for compatibility
                scenario: document.getElementById('newCheckboxPromptScenario').value,
                content: (() => {
                    const sc = document.getElementById('newCheckboxPromptScenario').value.trim();
                    const body = document.getElementById('newCheckboxPromptContent').value.trim();
                    if (sc) return `Scenario: ${sc}\n${body}`;
                    return body;
                })(),
                category: document.getElementById('newCheckboxPromptCategory').value,
                mode: document.getElementById('newCheckboxPromptMode').value,
                tags: document.getElementById('newCheckboxPromptTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
                isPublic: document.getElementById('newCheckboxPromptVisibility').value === 'true',
                authorName: document.getElementById('newCheckboxPromptAuthor').value
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
                showCriteriaFeedback(`✅ ${isEdit ? 'Updated' : 'Created'} checkbox prompt: "${formData.title}"`, 'success');
                closeCreateCheckboxPromptModal();
                refreshCheckboxPrompts();
                return false;
            } catch (err) {
                console.error('❌ Failed to save checkbox prompt:', err);
                alert(`Failed to save prompt: ${err.message}`);
                return false;
            }
        }
        
        // Close modal on outside click (if modal exists)
        const checkboxPromptModal = document.getElementById('createCheckboxPromptModal');
        if (checkboxPromptModal) {
            checkboxPromptModal.addEventListener('click', (e) => {
                if (e.target.id === 'createCheckboxPromptModal') {
                    closeCreateCheckboxPromptModal();
                }
            });

            // ESC key to close checkbox prompt modal
            document.addEventListener('keydown', (e) => {
                const modal = document.getElementById('createCheckboxPromptModal');
                if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                    closeCreateCheckboxPromptModal();
                }
            });
        }

        // Default checkbox criteria - empty, will be populated by teacher input
        const defaultCriteria = [];

        function updateCriteria() {
            const criteriaText = document.getElementById('criteriaInput').value.trim();
            const scenarioText = document.getElementById('scenarioInput').value.trim();
            
            if (!criteriaText) {
                showError('Please enter at least one criterion.');
                return;
            }
            
            const criteriaLines = criteriaText.split('\n').filter(line => line.trim());
            
            // Parse criteria with rubrics in parentheses format: "Description (Rubric)"
            currentCriteria = criteriaLines.map((line, index) => {
                const trimmedLine = line.trim();
                
                // Extract description and rubric using regex
                const match = trimmedLine.match(/^(.+?)\s*\((.+)\)\s*$/);
                
                if (match) {
                    // Format: "Description (Rubric)"
                    return {
                        id: index,
                        description: match[1].trim(),
                        rubric: match[2].trim(),
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                } else {
                    // Fallback: treat entire line as description
                    return {
                        id: index,
                        description: trimmedLine,
                        rubric: "No specific rubric provided",
                        completed: false,
                        quote: null,
                        status: 'grey'
                    };
                }
            });
            
            currentScenario = scenarioText;
            
            updateDisplay();
            console.log('✅ Updated criteria:', currentCriteria.length, 'items');
            console.log('✅ Updated scenario:', currentScenario);
        }

        // Release checklist to students
        async function releaseChecklistToGroup(groupNumber) {
            if (!sessionCode) {
                alert('No active session. Please start recording first.');
                return;
            }

            const normalizedGroup = Number(groupNumber);
            const groupData = groups.get(normalizedGroup);
            if (!groupData) {
                console.warn('⚠️ No cached group data found; initializing from current criteria.');
                groups.set(normalizedGroup, {
                    transcripts: [],
                    checkboxes: currentCriteria.map(c => ({
                        id: c.id,
                        description: c.description,
                        rubric: c.rubric,
                        completed: c.completed || false,
                        quote: c.quote || null,
                        status: c.status || 'grey'
                    })),
                    stats: {},
                    isActive: true
                });
            }
            let safeGroupData = groups.get(normalizedGroup);
            if (!safeGroupData || !Array.isArray(safeGroupData.checkboxes) || safeGroupData.checkboxes.length === 0) {
                console.warn('⚠️ Group has no checkboxes yet; building from currentCriteria as fallback.');
                safeGroupData = {
                    transcripts: [],
                    checkboxes: currentCriteria.map(c => ({
                        id: c.id,
                        description: c.description,
                        rubric: c.rubric,
                        completed: c.completed || false,
                        quote: c.quote || null,
                        status: c.status || 'grey'
                    })),
                    stats: {},
                    isActive: true
                };
                groups.set(normalizedGroup, safeGroupData);
            }

            try {
                // Debug log to see what we're sending
                console.log('📤 Preparing to release checklist for group', normalizedGroup);
                console.log('📤 Group data checkboxes:', safeGroupData.checkboxes);
                
                // Send checklist data to students - USE THE ACTUAL STATUS, don't recalculate
                const checklistData = {
                    sessionCode: sessionCode,
                    groupNumber: normalizedGroup,
                    criteria: safeGroupData.checkboxes.map(c => {
                        // Use the actual status that was set by the AI, don't recalculate
                        const actualStatus = c.status === 'green' ? 'green' : (c.status || 'grey');
                        
                        console.log(`📤 Criterion ${c.id}: status=${actualStatus}, completed=${c.completed}, quote="${c.quote}"`);
                        
                        return {
                            id: c.id,
                            description: c.description,
                            rubric: c.rubric,
                            status: actualStatus,  // Preserve GREEN
                            completed: actualStatus === 'green' ? true : (c.completed || false),
                            quote: (c.quote && c.quote !== 'null') ? c.quote : null
                        };
                    }),
                    scenario: currentScenario,
                    timestamp: Date.now()
                };

                console.log('📤 Final checklist data to send:', checklistData);
                console.log('📤 Status breakdown:', checklistData.criteria.map(c => `${c.id}: ${c.status}`));

                // Emit to students
                socket.emit('release_checklist', checklistData);

                safeGroupData.isReleased = true;
                groups.set(normalizedGroup, safeGroupData);
                updateGroup(normalizedGroup, { isReleased: true });
                showFeedback(`✅ Checklist released to Group ${normalizedGroup}`, 'success');

                console.log('📤 Released checklist to group', normalizedGroup, ':', checklistData);

            } catch (error) {
                console.error('❌ Error releasing checklist:', error);
                alert('Failed to release checklist. Please try again.');
            }
        }

        // Update display to show parsed criteria
        function updateDisplay() {
            const criteriaPreview = document.getElementById('criteriaPreview');
            if (!criteriaPreview) {
                // Create criteria preview element if it doesn't exist
                const previewDiv = document.createElement('div');
                previewDiv.id = 'criteriaPreview';
                previewDiv.className = 'mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg';
                
                const criteriaEditor = document.querySelector('.space-y-6');
                if (criteriaEditor) {
                    criteriaEditor.appendChild(previewDiv);
                }
            }
            
            if (currentCriteria.length > 0) {
                document.getElementById('criteriaPreview').innerHTML = `
                    <h4 class="text-sm font-semibold text-gray-700 mb-3">📋 Parsed Criteria (${currentCriteria.length})</h4>
                    <div class="space-y-2">
                        ${currentCriteria.map((criterion, index) => `
                            <div class="flex items-start space-x-3 p-2 bg-white rounded border">
                                <div class="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                                    ${index + 1}
                                </div>
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-gray-900 mb-1">
                                        ${criterion.description}
                                    </div>
                                    <div class="text-xs text-gray-600 italic">
                                        Rubric: ${criterion.rubric}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                document.getElementById('criteriaPreview').innerHTML = `
                    <p class="text-sm text-gray-500">No criteria parsed yet. Enter criteria above and click "Save & Apply".</p>
                `;
            }
        }

        // Toggle format help visibility
        function toggleFormatHelp() {
            const helpSection = document.querySelector('[class*="bg-blue-50"][class*="border-blue-200"]');
            if (helpSection) {
                if (helpSection.classList.contains('hidden')) {
                    helpSection.classList.remove('hidden');
                } else {
                    helpSection.classList.add('hidden');
                }
                
                // Re-initialize icons after DOM change
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        }

        // Reset UI when server stops recording
        socket.on('stop_recording', () => {
            console.log('⏹️ Received stop_recording from server');
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const intervalInput = document.getElementById('intervalInput');
            updateRecordingButtons(false);
            intervalInput.disabled = false;
            isRecording = false;
        });

        // Expose all necessary functions to window for onclick handlers
        window.toggleCriteriaEditor = toggleCriteriaEditor;
        window.addCriterion = addCriterion;
        window.removeCriterion = removeCriterion;
        window.saveCriteria = saveCriteria;
        window.toggleFormatHelp = toggleFormatHelp;

        console.log('✅ Checkbox functions exposed to window:', {
            toggleCriteriaEditor: typeof window.toggleCriteriaEditor,
            addCriterion: typeof window.addCriterion,
            saveCriteria: typeof window.saveCriteria
        });
