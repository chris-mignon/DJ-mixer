// Global State Management
class DJState {
    constructor() {
        this.decks = {
            A: {
                loaded: false,
                playing: false,
                bpm: 120,
                title: 'No Track Loaded',
                artist: '--:--',
                duration: 0,
                currentTime: 0,
                volume: 80,
                pitch: 0,
                videoId: null
            },
            B: {
                loaded: false,
                playing: false,
                bpm: 120,
                title: 'No Track Loaded',
                artist: '--:--',
                duration: 0,
                currentTime: 0,
                volume: 80,
                pitch: 0,
                videoId: null
            }
        };
        this.mixer = {
            crossfader: 50,
            masterVolume: 70,
            effects: {
                filter: false,
                echo: false,
                reverb: false,
                flanger: false
            },
            masterBPM: 120
        };
    }

    updateDeck(deckId, updates) {
        if (this.decks[deckId]) {
            this.decks[deckId] = { ...this.decks[deckId], ...updates };
            this.updateMasterBPM();
            this.broadcastState();
        }
    }

    updateMasterBPM() {
        if (this.decks.A.playing && this.decks.B.playing) {
            this.mixer.masterBPM = (this.decks.A.bpm + this.decks.B.bpm) / 2;
        } else if (this.decks.A.playing) {
            this.mixer.masterBPM = this.decks.A.bpm;
        } else if (this.decks.B.playing) {
            this.mixer.masterBPM = this.decks.B.bpm;
        }
        this.updateDisplay();
    }

    broadcastState() {
        socket.emit('deck_control', {
            decks: this.decks,
            mixer: this.mixer,
            timestamp: Date.now()
        });
    }

    updateDisplay() {
        // Update UI elements
        document.getElementById('master-bpm').textContent = 
            Math.round(this.mixer.masterBPM);
        
        for (const deckId of ['A', 'B']) {
            const deck = this.decks[deckId];
            document.getElementById(`bpm-${deckId}`).textContent = 
                Math.round(deck.bpm);
            document.getElementById(`title-${deckId}`).textContent = deck.title;
            document.getElementById(`time-${deckId}`).textContent = 
                this.formatTime(deck.currentTime);
            document.getElementById(`duration-${deckId}`).textContent = 
                this.formatTime(deck.duration);
            document.getElementById(`volume-${deckId}`).value = deck.volume;
            document.getElementById(`pitch-${deckId}`).value = deck.pitch;
            document.querySelector(`.pitch-value[data-deck="${deckId}"]`).textContent = 
                `${deck.pitch}%`;
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize state
const djState = new DJState();

// Audio Engine Functions
function initAudioEngine() {
    audioEngine.init();
    updateStatus('Audio engine initialized');
}

function initWaveforms() {
    // Initialize waveform displays
    ['A', 'B'].forEach(deckId => {
        const wavesurfer = WaveSurfer.create({
            container: `#waveform-${deckId}`,
            waveColor: '#00adb5',
            progressColor: '#00ff88',
            cursorColor: 'transparent',
            barWidth: 2,
            barRadius: 3,
            cursorWidth: 1,
            height: 90,
            barGap: 3,
            responsive: true
        });
        
        window[`wavesurfer${deckId}`] = wavesurfer;
    });
}

// Track Management
async function searchTrack(deckId) {
    const input = document.getElementById(`search-${deckId.toLowerCase()}`);
    const query = input.value.trim();
    
    if (!query) return;
    
    updateStatus(`Searching for "${query}"...`);
    
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();
        
        const resultsContainer = document.getElementById(`results-${deckId.toLowerCase()}`);
        resultsContainer.innerHTML = '';
        
        data.results.forEach(track => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <img src="${track.thumbnail}" alt="${track.title}">
                <div class="result-info">
                    <div class="result-title">${track.title}</div>
                    <div class="result-duration">${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}</div>
                </div>
            `;
            item.onclick = () => loadTrack(deckId, track.id, track.title);
            resultsContainer.appendChild(item);
        });
        
    } catch (error) {
        console.error('Search error:', error);
        updateStatus('Search failed', 'error');
    }
}

async function loadTrack(deckId, videoId, title) {
    updateStatus(`Loading track: ${title}...`);
    
    try {
        // Analyze audio first
        const analyzeResponse = await fetch(`/api/audio/analyze/${videoId}`, {
            method: 'POST'
        });
        const analysis = await analyzeResponse.json();
        
        // Load audio in engine
        const result = await audioEngine.loadYouTubeAudio(videoId, `deck${deckId}`);
        
        if (result.success) {
            djState.updateDeck(deckId, {
                loaded: true,
                title: title,
                duration: result.duration,
                bpm: analysis.bpm,
                videoId: videoId,
                currentTime: 0
            });
            
            // Update thumbnail
            document.getElementById(`thumb-${deckId.toLowerCase()}`).src = 
                `https://img.youtube.com/vi/${videoId}/0.jpg`;
            
            updateStatus(`Loaded: ${title} (${Math.round(analysis.bpm)} BPM)`);
            
            // Clear search results
            document.getElementById(`results-${deckId.toLowerCase()}`).innerHTML = '';
            
            // Setup audio element listeners
            const audioElement = result.element;
            audioElement.addEventListener('timeupdate', () => {
                djState.decks[deckId].currentTime = audioElement.currentTime;
                updateProgress(deckId, audioElement.currentTime, result.duration);
            });
            
            audioElement.addEventListener('ended', () => {
                djState.decks[deckId].playing = false;
                djState.updateDisplay();
            });
            
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('Load error:', error);
        updateStatus(`Failed to load track: ${error.message}`, 'error');
    }
}

function togglePlay(deckId) {
    const deck = djState.decks[deckId];
    if (!deck.loaded) return;
    
    if (deck.playing) {
        audioEngine.pause(`deck${deckId}`);
        djState.updateDeck(deckId, { playing: false });
    } else {
        audioEngine.play(`deck${deckId}`, deck.currentTime);
        djState.updateDeck(deckId, { playing: true });
    }
}

function togglePause(deckId) {
    audioEngine.pause(`deck${deckId}`);
    djState.updateDeck(deckId, { playing: false });
}

function stopTrack(deckId) {
    audioEngine.stop(`deck${deckId}`);
    djState.updateDeck(deckId, { 
        playing: false, 
        currentTime: 0 
    });
    updateProgress(deckId, 0, djState.decks[deckId].duration);
}

function cueTrack(deckId) {
    audioEngine.pause(`deck${deckId}`);
    djState.updateDeck(deckId, { 
        playing: false, 
        currentTime: 0 
    });
    updateProgress(deckId, 0, djState.decks[deckId].duration);
}

// Mixer Controls
function adjustVolume(deckId, volume) {
    audioEngine.setVolume(`deck${deckId}`, volume);
    djState.updateDeck(deckId, { volume: parseInt(volume) });
}

function adjustPitch(deckId, percent) {
    audioEngine.setPitch(`deck${deckId}`, percent);
    djState.updateDeck(deckId, { pitch: parseInt(percent) });
}

function updateCrossfader(position) {
    audioEngine.setCrossfader(position);
    djState.mixer.crossfader = parseInt(position);
    socket.emit('crossfader_change', { position: position });
    updateDisplay();
}

function updateMasterVolume(volume) {
    // Implement master volume control
    djState.mixer.masterVolume = parseInt(volume);
    updateDisplay();
}

function updateProgress(deckId, currentTime, duration) {
    const progress = (currentTime / duration) * 100;
    document.getElementById(`progress-${deckId.toLowerCase()}`).style.width = `${progress}%`;
    document.getElementById(`time-${deckId.toLowerCase()}`).textContent = 
        djState.formatTime(currentTime);
}

// Beat Synchronization
async function syncBeats() {
    updateStatus('Synchronizing beats...');
    
    const deckA = djState.decks.A;
    const deckB = djState.decks.B;
    
    if (!deckA.loaded || !deckB.loaded) {
        updateStatus('Both decks must be loaded to sync', 'warning');
        return;
    }
    
    // Calculate BPM difference
    const bpmDiff = deckA.bpm - deckB.bpm;
    const syncPercent = (bpmDiff / deckA.bpm) * 100;
    
    // Adjust BPM of deck B to match deck A
    const newPitchB = deckB.pitch - syncPercent;
    const clampedPitch = Math.max(-50, Math.min(50, newPitchB));
    
    adjustPitch('B', clampedPitch);
    
    // Send sync event
    socket.emit('bpm_sync', {
        source: 'A',
        target: 'B',
        adjustment: -syncPercent
    });
    
    updateStatus(`Beats synced! Deck B adjusted by ${-syncPercent.toFixed(1)}%`);
}

// Effects
function toggleEffect(effect) {
    djState.mixer.effects[effect] = !djState.mixer.effects[effect];
    
    const button = document.querySelector(`.effect-btn:nth-child(${
        Object.keys(djState.mixer.effects).indexOf(effect) + 1
    })`);
    
    if (djState.mixer.effects[effect]) {
        button.classList.add('active');
        applyEffect(effect);
    } else {
        button.classList.remove('active');
        removeEffect(effect);
    }
}

function applyEffect(effect) {
    switch(effect) {
        case 'filter':
            audioEngine.applyFilter('deckA', 'lowpass', 1000);
            audioEngine.applyFilter('deckB', 'lowpass', 1000);
            break;
        // Add other effects implementations
    }
    updateStatus(`${effect} effect activated`);
}

function removeEffect(effect) {
    // Remove effect implementation
    updateStatus(`${effect} effect deactivated`);
}

// Global Controls
function playBoth() {
    togglePlay('A');
    togglePlay('B');
}

function stopAll() {
    stopTrack('A');
    stopTrack('B');
}

function recordMix() {
    updateStatus('Recording mix...');
    // Implement recording functionality
}

// Status Updates
function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status-message');
    statusElement.textContent = message;
    
    statusElement.className = '';
    if (type === 'error') {
        statusElement.style.color = '#ff5252';
    } else if (type === 'warning') {
        statusElement.style.color = '#ff9800';
    } else {
        statusElement.style.color = '#00ff88';
    }
    
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Socket Event Handlers
function handleDeckUpdate(data) {
    // Update state from other clients
    console.log('Deck update received:', data);
}

function handleCrossfaderUpdate(data) {
    document.getElementById('crossfader').value = data.position;
    updateCrossfader(data.position);
}

function handleSyncUpdate(data) {
    updateStatus(`Beats synced by ${data.adjustment.toFixed(1)}%`);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initAudioEngine();
    initWaveforms();
    updateStatus('DJ Mixer Pro Ready');
    
    // Simulate CPU usage updates
    setInterval(() => {
        const cpuLoad = Math.floor(Math.random() * 30) + 20;
        document.getElementById('cpu-load').textContent = `${cpuLoad}%`;
    }, 3000);
});
// Additional functions for main.js

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, duration);
}

function getToastIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Prevent default behavior for our shortcuts
        const key = e.key.toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const alt = e.altKey;
        
        // Global shortcuts
        switch(key) {
            case ' ':
                // Space bar: Play/pause both decks
                e.preventDefault();
                if (djState.decks.A.playing && djState.decks.B.playing) {
                    togglePlay('A');
                    togglePlay('B');
                } else if (djState.decks.A.playing) {
                    togglePlay('A');
                } else if (djState.decks.B.playing) {
                    togglePlay('B');
                }
                break;
                
            case '1':
                if (ctrl) {
                    e.preventDefault();
                    loadSampleTrack('A');
                }
                break;
                
            case '2':
                if (ctrl) {
                    e.preventDefault();
                    loadSampleTrack('B');
                }
                break;
                
            case 'q':
                // Cue deck A
                if (!shift) {
                    e.preventDefault();
                    cueTrack('A');
                }
                break;
                
            case 'w':
                // Cue deck B
                if (!shift) {
                    e.preventDefault();
                    cueTrack('B');
                }
                break;
                
            case 'a':
                // Play/pause deck A
                if (!shift) {
                    e.preventDefault();
                    togglePlay('A');
                }
                break;
                
            case 's':
                // Play/pause deck B
                if (!shift) {
                    e.preventDefault();
                    togglePlay('B');
                }
                break;
                
            case 'z':
                // Stop deck A
                if (!shift) {
                    e.preventDefault();
                    stopTrack('A');
                }
                break;
                
            case 'x':
                // Stop deck B
                if (!shift) {
                    e.preventDefault();
                    stopTrack('B');
                }
                break;
                
            case 'b':
                // Sync beats
                if (ctrl) {
                    e.preventDefault();
                    syncBeats();
                }
                break;
                
            case 'h':
                // Show/hide shortcuts help
                if (ctrl) {
                    e.preventDefault();
                    toggleShortcutsHelp();
                }
                break;
                
            case 'm':
                // Toggle mute master
                if (ctrl) {
                    e.preventDefault();
                    toggleMasterMute();
                }
                break;
                
            case 'r':
                // Record mix
                if (ctrl) {
                    e.preventDefault();
                    recordMix();
                }
                break;
        }
        
        // Crossfader with arrow keys
        if (!ctrl && !alt) {
            const crossfader = document.getElementById('crossfader');
            let currentValue = parseInt(crossfader.value);
            
            switch(key) {
                case 'arrowleft':
                    e.preventDefault();
                    currentValue = Math.max(0, currentValue - 5);
                    crossfader.value = currentValue;
                    updateCrossfader(currentValue);
                    break;
                    
                case 'arrowright':
                    e.preventDefault();
                    currentValue = Math.min(100, currentValue + 5);
                    crossfader.value = currentValue;
                    updateCrossfader(currentValue);
                    break;
                    
                case 'arrowup':
                    e.preventDefault();
                    // Increase master volume
                    const masterVolume = document.getElementById('master-volume');
                    let masterValue = parseInt(masterVolume.value);
                    masterValue = Math.min(100, masterValue + 5);
                    masterVolume.value = masterValue;
                    updateMasterVolume(masterValue);
                    break;
                    
                case 'arrowdown':
                    e.preventDefault();
                    // Decrease master volume
                    const masterVolume2 = document.getElementById('master-volume');
                    let masterValue2 = parseInt(masterVolume2.value);
                    masterValue2 = Math.max(0, masterValue2 - 5);
                    masterVolume2.value = masterValue2;
                    updateMasterVolume(masterValue2);
                    break;
            }
        }
    });
}

function toggleShortcutsHelp() {
    const help = document.getElementById('shortcuts-help') || createShortcutsHelp();
    help.classList.toggle('active');
}

function createShortcutsHelp() {
    const help = document.createElement('div');
    help.id = 'shortcuts-help';
    help.className = 'shortcuts-help';
    help.innerHTML = `
        <h4><i class="fas fa-keyboard"></i> Keyboard Shortcuts</h4>
        <div class="shortcuts-list">
            <div class="shortcut-item">
                <span>Space</span>
                <span class="shortcut-key">Play/Pause</span>
            </div>
            <div class="shortcut-item">
                <span>Ctrl + 1/2</span>
                <span class="shortcut-key">Load Sample</span>
            </div>
            <div class="shortcut-item">
                <span>Q/W</span>
                <span class="shortcut-key">Cue Deck A/B</span>
            </div>
            <div class="shortcut-item">
                <span>A/S</span>
                <span class="shortcut-key">Play Deck A/B</span>
            </div>
            <div class="shortcut-item">
                <span>Z/X</span>
                <span class="shortcut-key">Stop Deck A/B</span>
            </div>
            <div class="shortcut-item">
                <span>←/→</span>
                <span class="shortcut-key">Crossfader</span>
            </div>
            <div class="shortcut-item">
                <span>↑/↓</span>
                <span class="shortcut-key">Master Volume</span>
            </div>
            <div class="shortcut-item">
                <span>Ctrl + B</span>
                <span class="shortcut-key">Sync Beats</span>
            </div>
            <div class="shortcut-item">
                <span>Ctrl + H</span>
                <span class="shortcut-key">Show Help</span>
            </div>
        </div>
        <button class="btn-close-help" onclick="this.parentElement.classList.remove('active')">
            Close
        </button>
    `;
    document.body.appendChild(help);
    return help;
}

function loadSampleTrack(deckId) {
    const sampleTracks = [
        {
            id: 'CevxZvSJLk8',
            title: 'Daft Punk - Around The World',
            artist: 'Daft Punk',
            bpm: 122,
            duration: 425
        },
        {
            id: 'FxzBavqPpxs',
            title: 'Avicii - Levels',
            artist: 'Avicii',
            bpm: 128,
            duration: 345
        },
        {
            id: 'gCYcHz2k5x0',
            title: 'Calvin Harris - Feel So Close',
            artist: 'Calvin Harris',
            bpm: 128,
            duration: 228
        }
    ];
    
    const randomTrack = sampleTracks[Math.floor(Math.random() * sampleTracks.length)];
    
    // Simulate loading the track
    djState.updateDeck(deckId, {
        loaded: true,
        title: randomTrack.title,
        artist: randomTrack.artist,
        bpm: randomTrack.bpm,
        duration: randomTrack.duration,
        videoId: randomTrack.id,
        currentTime: 0
    });
    
    // Update UI
    const deckElement = document.getElementById(`deck-${deckId.toLowerCase()}`);
    if (deckElement) {
        const thumb = deckElement.querySelector('.track-thumbnail img');
        if (thumb) {
            thumb.src = `https://img.youtube.com/vi/${randomTrack.id}/0.jpg`;
        }
    }
    
    showToast(`Loaded sample track: ${randomTrack.title}`, 'success');
    updateStatus(`Loaded ${randomTrack.title} (${randomTrack.bpm} BPM)`);
}

function toggleMasterMute() {
    const masterSlider = document.getElementById('master-volume');
    const currentValue = parseInt(masterSlider.value);
    
    if (currentValue > 0) {
        masterSlider.dataset.previous = currentValue;
        masterSlider.value = 0;
        updateMasterVolume(0);
        showToast('Master muted', 'info');
    } else {
        const previous = parseInt(masterSlider.dataset.previous || '70');
        masterSlider.value = previous;
        updateMasterVolume(previous);
        showToast('Master unmuted', 'info');
    }
}

// Cue point management
const cuePoints = {
    deckA: [],
    deckB: []
};

function setCuePoint(deckId) {
    const deck = djState.decks[deckId];
    if (!deck.loaded) return;
    
    const cueNumber = cuePoints[`deck${deckId}`].length + 1;
    if (cueNumber > 8) {
        showToast('Maximum 8 cue points allowed', 'warning');
        return;
    }
    
    const cueTime = deck.currentTime;
    cuePoints[`deck${deckId}`].push({
        number: cueNumber,
        time: cueTime,
        color: getCueColor(cueNumber)
    });
    
    // Add visual cue point to waveform
    addCuePointVisual(deckId, cueNumber, cueTime);
    
    showToast(`Cue ${cueNumber} set at ${formatTime(cueTime)}`, 'success');
}

function getCueColor(number) {
    const colors = [
        '#FF5252', '#FF9800', '#FFEB3B', '#4CAF50',
        '#2196F3', '#9C27B0', '#E91E63', '#00BCD4'
    ];
    return colors[(number - 1) % colors.length];
}

function addCuePointVisual(deckId, number, time) {
    const waveform = document.getElementById(`waveform-${deckId.toLowerCase()}`);
    if (!waveform) return;
    
    const cuePoint = document.createElement('div');
    cuePoint.className = 'cue-point';
    cuePoint.dataset.number = number;
    cuePoint.style.left = `${(time / djState.decks[deckId].duration) * 100}%`;
    cuePoint.title = `Cue ${number}: ${formatTime(time)}`;
    
    cuePoint.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToCuePoint(deckId, number);
    });
    
    waveform.appendChild(cuePoint);
}

function jumpToCuePoint(deckId, number) {
    const cue = cuePoints[`deck${deckId}`].find(c => c.number === number);
    if (!cue) return;
    
    const source = audioEngine.sources[`deck${deckId}`];
    if (source && source.element) {
        source.element.currentTime = cue.time;
        djState.decks[deckId].currentTime = cue.time;
        updateProgress(deckId, cue.time, djState.decks[deckId].duration);
        
        showToast(`Jumped to cue ${number}`, 'info');
    }
}

function clearCuePoints(deckId) {
    cuePoints[`deck${deckId}`] = [];
    
    // Remove visual cues
    const waveform = document.getElementById(`waveform-${deckId.toLowerCase()}`);
    if (waveform) {
        const cueElements = waveform.querySelectorAll('.cue-point');
        cueElements.forEach(el => el.remove());
    }
    
    showToast(`Cleared cue points for deck ${deckId}`, 'info');
}

// Initialize additional features
function initAdditionalFeatures() {
    // Create toast container
    createToastContainer();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Create shortcuts help
    createShortcutsHelp();
    
    // Initialize beat visualization
    initBeatVisualization();
    
    // Add cue point buttons
    ['A', 'B'].forEach(deckId => {
        const transportControls = document.querySelector(`#deck-${deckId.toLowerCase()} .transport-controls`);
        if (transportControls) {
            const cueButton = document.createElement('button');
            cueButton.className = 'control-btn btn-cue-set';
            cueButton.innerHTML = '<i class="fas fa-flag"></i> CUE';
            cueButton.title = 'Set cue point (Ctrl+Click to clear all)';
            cueButton.onclick = (e) => {
                if (e.ctrlKey) {
                    clearCuePoints(deckId);
                } else {
                    setCuePoint(deckId);
                }
            };
            transportControls.appendChild(cueButton);
        }
    });
    
    showToast('DJ Mixer Pro initialized!', 'success');
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    initAudioEngine();
    initWaveforms();
    initAdditionalFeatures();
    updateStatus('DJ Mixer Pro Ready');
    
    // Initialize YouTube loader
    initYouTubeLoader();
    
    // Simulate CPU usage updates
    setInterval(() => {
        const cpuLoad = Math.floor(Math.random() * 30) + 20;
        document.getElementById('cpu-load').textContent = `${cpuLoad}%`;
    }, 3000);
});
