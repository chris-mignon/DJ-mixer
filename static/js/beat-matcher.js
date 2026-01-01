class BeatMatcher {
    constructor() {
        this.beatGrids = {
            deckA: null,
            deckB: null
        };
        this.isSynced = false;
        this.syncOffset = 0;
    }

    async analyzeTrack(deckId, audioBuffer) {
        try {
            // Extract audio data
            const audioData = audioBuffer.getChannelData(0);
            
            // Send to server for analysis
            const response = await fetch('/api/analyze_audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    deck_id: deckId,
                    audio_data: Array.from(audioData.slice(0, 44100)) // First second for analysis
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.beatGrids[deckId] = {
                    bpm: result.bpm,
                    beatTimes: result.beat_times,
                    phase: result.phase
                };
                
                this.updateBPMDisplay(deckId, result.bpm);
                return result.bpm;
            }
        } catch (error) {
            console.error('Beat analysis failed:', error);
        }
        return null;
    }

    calculateBPMDifference(bpmA, bpmB) {
        return Math.abs(bpmA - bpmB);
    }

    calculatePitchAdjustment(bpmA, bpmB) {
        // Calculate percentage difference
        const difference = bpmB - bpmA;
        const percentage = (difference / bpmA) * 100;
        return percentage;
    }

    async syncBeats(deckA, deckB) {
        if (!this.beatGrids[deckA] || !this.beatGrids[deckB]) {
            console.warn('Both tracks must be analyzed first');
            return false;
        }

        const gridA = this.beatGrids[deckA];
        const gridB = this.beatGrids[deckB];

        // Calculate BPM ratio
        const bpmRatio = gridA.bpm / gridB.bpm;
        
        // Calculate time offset for beat alignment
        const beatIntervalA = 60 / gridA.bpm;
        const beatIntervalB = 60 / gridB.bpm;
        
        // Find best alignment
        let bestOffset = 0;
        let maxMatches = 0;
        
        // Try different time offsets (within 2 seconds)
        for (let offset = -2; offset <= 2; offset += 0.01) {
            let matches = 0;
            const offsetBeatTimesB = gridB.beatTimes.map(t => t + offset);
            
            // Check alignment with A's beats
            for (let beatA of gridA.beatTimes.slice(0, 10)) {
                for (let beatB of offsetBeatTimesB.slice(0, 10)) {
                    if (Math.abs(beatA - beatB) < 0.02) { // 20ms tolerance
                        matches++;
                        break;
                    }
                }
            }
            
            if (matches > maxMatches) {
                maxMatches = matches;
                bestOffset = offset;
            }
        }
        
        this.syncOffset = bestOffset;
        this.isSynced = true;
        
        // Calculate required pitch adjustment
        const pitchAdjustment = this.calculatePitchAdjustment(gridA.bpm, gridB.bpm);
        
        return {
            success: true,
            bpmRatio: bpmRatio,
            timeOffset: bestOffset,
            pitchAdjustment: pitchAdjustment,
            matchScore: maxMatches / 10 // Normalized to 0-1
        };
    }

    applySyncToDeck(deckId, bpmRatio, timeOffset) {
        const audioContext = audioEngine.audioContext;
        const source = audioEngine.sources[deckId];
        
        if (!source) return false;
        
        // Apply pitch adjustment (playback rate)
        const playbackRate = bpmRatio;
        source.element.playbackRate = playbackRate;
        
        // Apply time offset
        if (timeOffset !== 0) {
            // Store offset for cue points
            this.beatGrids[deckId].timeOffset = timeOffset;
        }
        
        return true;
    }

    quantizeCuePoint(deckId, time) {
        if (!this.beatGrids[deckId]) return time;
        
        const beatTimes = this.beatGrids[deckId].beatTimes;
        if (!beatTimes || beatTimes.length === 0) return time;
        
        // Find nearest beat
        let nearestBeat = beatTimes[0];
        let minDifference = Math.abs(time - nearestBeat);
        
        for (const beatTime of beatTimes) {
            const difference = Math.abs(time - beatTime);
            if (difference < minDifference) {
                minDifference = difference;
                nearestBeat = beatTime;
            }
        }
        
        // If within 100ms, snap to beat
        if (minDifference < 0.1) {
            return nearestBeat;
        }
        
        return time;
    }

    createBeatGridVisualization(deckId, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !this.beatGrids[deckId]) return;
        
        const ctx = canvas.getContext('2d');
        const grid = this.beatGrids[deckId];
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw beat grid
        const width = canvas.width;
        const height = canvas.height;
        const duration = grid.beatTimes[grid.beatTimes.length - 1] || 60;
        
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        
        // Draw major beats (every 4 beats)
        grid.beatTimes.forEach((beatTime, index) => {
            const x = (beatTime / duration) * width;
            
            if (index % 4 === 0) {
                // Downbeat - thicker line
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#ff9800';
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            } else {
                // Regular beat
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#00adb5';
                ctx.beginPath();
                ctx.moveTo(x, height * 0.3);
                ctx.lineTo(x, height * 0.7);
                ctx.stroke();
            }
        });
        
        // Draw phase indicator
        if (grid.phase) {
            const phaseX = (grid.phase / duration) * width;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.fillRect(phaseX - 2, 0, 4, height);
        }
    }

    updateBPMDisplay(deckId, bpm) {
        const bpmElement = document.querySelector(`#deck-${deckId.toLowerCase()} .bpm-value`);
        if (bpmElement) {
            bpmElement.textContent = Math.round(bpm);
        }
        
        // Update master BPM if needed
        this.updateMasterBPM();
    }

    updateMasterBPM() {
        const bpmA = this.beatGrids.deckA ? this.beatGrids.deckA.bpm : 0;
        const bpmB = this.beatGrids.deckB ? this.beatGrids.deckB.bpm : 0;
        
        let masterBPM = 120; // Default
        
        if (bpmA > 0 && bpmB > 0) {
            masterBPM = (bpmA + bpmB) / 2;
        } else if (bpmA > 0) {
            masterBPM = bpmA;
        } else if (bpmB > 0) {
            masterBPM = bpmB;
        }
        
        const masterElement = document.getElementById('master-bpm');
        if (masterElement) {
            masterElement.textContent = Math.round(masterBPM);
        }
    }

    getBeatPosition(deckId, currentTime) {
        if (!this.beatGrids[deckId]) return { beat: 0, bar: 0 };
        
        const beatTimes = this.beatGrids[deckId].beatTimes;
        if (!beatTimes || beatTimes.length === 0) {
            return { beat: 0, bar: 0 };
        }
        
        // Find current beat
        let currentBeat = 0;
        for (let i = 0; i < beatTimes.length; i++) {
            if (beatTimes[i] <= currentTime) {
                currentBeat = i;
            } else {
                break;
            }
        }
        
        const beatInBar = (currentBeat % 4) + 1;
        const bar = Math.floor(currentBeat / 4) + 1;
        
        return {
            beat: beatInBar,
            bar: bar,
            totalBeat: currentBeat + 1
        };
    }

    displayBeatCounter(deckId, currentTime) {
        const position = this.getBeatPosition(deckId, currentTime);
        const counterElement = document.getElementById(`beat-counter-${deckId.toLowerCase()}`);
        
        if (counterElement) {
            counterElement.textContent = `${position.bar}.${position.beat}`;
            
            // Highlight on beat 1
            if (position.beat === 1) {
                counterElement.style.color = '#ff9800';
                counterElement.style.fontWeight = 'bold';
            } else {
                counterElement.style.color = '#00ff88';
                counterElement.style.fontWeight = 'normal';
            }
        }
    }
}

// Global beat matcher instance
const beatMatcher = new BeatMatcher();

// Beat matching functions for global access
async function analyzeTrackBeats(deckId) {
    const deck = djState.decks[deckId];
    if (!deck.loaded) return;
    
    // Get audio buffer from engine
    const source = audioEngine.sources[`deck${deckId}`];
    if (source && source.element) {
        // Create offline audio context for analysis
        const offlineContext = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1, // mono
            source.element.duration * 44100, // samples
            44100 // sample rate
        );
        
        const sourceNode = offlineContext.createMediaElementSource(source.element);
        sourceNode.connect(offlineContext.destination);
        
        offlineContext.startRendering().then(audioBuffer => {
            return beatMatcher.analyzeTrack(`deck${deckId}`, audioBuffer);
        }).then(bpm => {
            if (bpm) {
                updateStatus(`Deck ${deckId} analyzed: ${Math.round(bpm)} BPM`);
            }
        });
    }
}

async function syncTracks() {
    updateStatus('Synchronizing tracks...');
    
    const result = await beatMatcher.syncBeats('deckA', 'deckB');
    
    if (result.success) {
        // Apply sync to deck B
        beatMatcher.applySyncToDeck('deckB', result.bpmRatio, result.timeOffset);
        
        // Update deck B pitch display
        const pitchElement = document.getElementById('pitch-b');
        const pitchValueElement = document.querySelector('#deck-b .pitch-value');
        
        if (pitchElement && pitchValueElement) {
            const currentPitch = parseInt(pitchElement.value);
            const newPitch = currentPitch + result.pitchAdjustment;
            const clampedPitch = Math.max(-50, Math.min(50, newPitch));
            
            pitchElement.value = clampedPitch;
            pitchValueElement.textContent = `${clampedPitch}%`;
            
            // Apply pitch adjustment
            adjustPitch('B', clampedPitch);
        }
        
        updateStatus(`Tracks synced! Match score: ${Math.round(result.matchScore * 100)}%`);
    } else {
        updateStatus('Sync failed. Make sure both tracks are loaded.', 'error');
    }
}

function quantizeCue(deckId) {
    const deck = djState.decks[deckId];
    if (!deck.loaded) return;
    
    const currentTime = deck.currentTime;
    const quantizedTime = beatMatcher.quantizeCuePoint(`deck${deckId}`, currentTime);
    
    if (Math.abs(quantizedTime - currentTime) > 0.01) {
        // Apply quantization
        audioEngine.sources[`deck${deckId}`].element.currentTime = quantizedTime;
        djState.decks[deckId].currentTime = quantizedTime;
        updateProgress(deckId, quantizedTime, deck.duration);
        
        updateStatus(`Cue quantized to nearest beat`);
    }
}

// Initialize beat visualization
function initBeatVisualization() {
    // Create beat grid canvases
    ['A', 'B'].forEach(deckId => {
        const waveformContainer = document.getElementById(`waveform-${deckId.toLowerCase()}`);
        if (waveformContainer) {
            const canvas = document.createElement('canvas');
            canvas.id = `beat-grid-${deckId.toLowerCase()}`;
            canvas.className = 'beat-grid';
            canvas.width = waveformContainer.clientWidth;
            canvas.height = 30;
            canvas.style.position = 'absolute';
            canvas.style.bottom = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            waveformContainer.appendChild(canvas);
        }
    });
    
    // Update beat grids periodically
    setInterval(() => {
        ['A', 'B'].forEach(deckId => {
            const deck = djState.decks[deckId];
            if (deck.loaded && deck.playing) {
                beatMatcher.displayBeatCounter(deckId, deck.currentTime);
                beatMatcher.createBeatGridVisualization(`deck${deckId}`, `beat-grid-${deckId.toLowerCase()}`);
            }
        });
    }, 100);
}