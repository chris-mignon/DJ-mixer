class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.sources = {};
        this.gainNodes = {};
        this.analysers = {};
        this.filters = {};
        this.isInitialized = false;
    }

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.isInitialized = true;
            console.log('AudioEngine initialized');
        }
    }

    async loadYouTubeAudio(videoId, deckId) {
        try {
            const response = await fetch(`/api/audio/info/${videoId}`);
            const data = await response.json();
            
            // Create audio element for streaming
            const audioElement = new Audio(data.url);
            audioElement.crossOrigin = 'anonymous';
            
            // Create source from audio element
            const source = this.audioContext.createMediaElementSource(audioElement);
            const gainNode = this.audioContext.createGain();
            const analyser = this.audioContext.createAnalyser();
            
            // Store references
            this.sources[deckId] = { source, element: audioElement };
            this.gainNodes[deckId] = gainNode;
            this.analysers[deckId] = analyser;
            
            // Connect nodes
            source.connect(gainNode);
            gainNode.connect(analyser);
            analyser.connect(this.audioContext.destination);
            
            // Set up analyser
            analyser.fftSize = 2048;
            
            return {
                success: true,
                duration: data.duration,
                title: data.title,
                element: audioElement
            };
            
        } catch (error) {
            console.error('Error loading audio:', error);
            return { success: false, error: error.message };
        }
    }

    play(deckId, time = 0) {
        if (this.sources[deckId] && this.sources[deckId].element) {
            this.sources[deckId].element.currentTime = time;
            this.sources[deckId].element.play();
            return true;
        }
        return false;
    }

    pause(deckId) {
        if (this.sources[deckId] && this.sources[deckId].element) {
            this.sources[deckId].element.pause();
            return true;
        }
        return false;
    }

    stop(deckId) {
        if (this.sources[deckId]) {
            this.pause(deckId);
            this.sources[deckId].element.currentTime = 0;
            return true;
        }
        return false;
    }

    setVolume(deckId, volume) {
        if (this.gainNodes[deckId]) {
            // Convert 0-100 to gain (0-1)
            const gainValue = volume / 100;
            this.gainNodes[deckId].gain.value = gainValue;
            return true;
        }
        return false;
    }

    setCrossfader(position) {
        // position: 0 (full A) to 100 (full B)
        const normalized = position / 100;
        
        if (this.gainNodes.deckA) {
            this.gainNodes.deckA.gain.value = 1 - normalized;
        }
        if (this.gainNodes.deckB) {
            this.gainNodes.deckB.gain.value = normalized;
        }
    }

    setPitch(deckId, percent) {
        // Implement pitch shifting
        if (this.sources[deckId] && this.sources[deckId].element) {
            const playbackRate = 1 + (percent / 100);
            this.sources[deckId].element.playbackRate = playbackRate;
            return true;
        }
        return false;
    }

    applyFilter(deckId, type, frequency) {
        if (!this.filters[deckId]) {
            this.filters[deckId] = this.audioContext.createBiquadFilter();
            // Reconnect chain
            this.sources[deckId].source.disconnect();
            this.sources[deckId].source.connect(this.filters[deckId]);
            this.filters[deckId].connect(this.gainNodes[deckId]);
        }
        
        const filter = this.filters[deckId];
        filter.type = type;
        filter.frequency.value = frequency;
    }

    getWaveformData(deckId) {
        if (this.analysers[deckId]) {
            const bufferLength = this.analysers[deckId].frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analysers[deckId].getByteTimeDomainData(dataArray);
            return dataArray;
        }
        return null;
    }

    getFrequencyData(deckId) {
        if (this.analysers[deckId]) {
            const bufferLength = this.analysers[deckId].frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analysers[deckId].getByteFrequencyData(dataArray);
            return dataArray;
        }
        return null;
    }
}

// Global audio engine instance
const audioEngine = new AudioEngine();