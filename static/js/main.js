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