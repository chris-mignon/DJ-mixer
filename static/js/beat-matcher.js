// Beat Matcher Module
class BeatMatcher {
    constructor() {
        this.beatGrids = {
            deckA: null,
            deckB: null
        };
    }

    analyzeBeatGrid(audioData, sampleRate, bpm) {
        // This is a simplified beat grid analysis.
        // In a real application, you would use a more advanced algorithm.
        const beatInterval = 60 / bpm; // in seconds
        const beatIntervalSamples = beatInterval * sampleRate;

        const beats = [];
        let currentBeat = 0;
        while (currentBeat < audioData.length) {
            beats.push(currentBeat / sampleRate); // time in seconds
            currentBeat += beatIntervalSamples;
        }

        return {
            bpm: bpm,
            beats: beats,
            sampleRate: sampleRate
        };
    }

    syncBeats(deckId, targetBPM) {
        const deck = djState.decks[deckId];
        if (!deck || !deck.loaded) {
            return false;
        }

        // Calculate the pitch adjustment needed
        const currentBPM = deck.bpm;
        const pitchAdjustment = ((targetBPM - currentBPM) / currentBPM) * 100;

        // Adjust the pitch
        const newPitch = deck.pitch + pitchAdjustment;
        const clampedPitch = Math.max(-50, Math.min(50, newPitch));

        // Apply the pitch change
        adjustPitch(deckId, clampedPitch);

        return true;
    }

    syncBothDecks() {
        // Determine which deck is the master (e.g., the one that is playing)
        let masterDeckId = null;
        let slaveDeckId = null;

        if (djState.decks.A.playing && !djState.decks.B.playing) {
            masterDeckId = 'A';
            slaveDeckId = 'B';
        } else if (djState.decks.B.playing && !djState.decks.A.playing) {
            masterDeckId = 'B';
            slaveDeckId = 'A';
        } else if (djState.decks.A.playing && djState.decks.B.playing) {
            // Both are playing, choose the one with the higher volume or crossfader position
            // For simplicity, we'll choose the one that the crossfader is favoring
            if (djState.mixer.crossfader <= 50) {
                masterDeckId = 'A';
                slaveDeckId = 'B';
            } else {
                masterDeckId = 'B';
                slaveDeckId = 'A';
            }
        } else {
            // None are playing, we can't sync
            return false;
        }

        if (masterDeckId && slaveDeckId) {
            const masterBPM = djState.decks[masterDeckId].bpm * (1 + djState.decks[masterDeckId].pitch / 100);
            this.syncBeats(slaveDeckId, masterBPM);
            return true;
        }

        return false;
    }

    quantize(deckId, position) {
        // This function would snap a cue point to the nearest beat.
        // We need the beat grid for the deck.
        const beatGrid = this.beatGrids[`deck${deckId}`];
        if (!beatGrid) {
            return position;
        }

        const beats = beatGrid.beats;
        let nearestBeat = beats[0];
        let minDiff = Math.abs(position - nearestBeat);

        for (let i = 1; i < beats.length; i++) {
            const diff = Math.abs(position - beats[i]);
            if (diff < minDiff) {
                minDiff = diff;
                nearestBeat = beats[i];
            }
        }

        return nearestBeat;
    }
}

// Create a global instance
const beatMatcher = new BeatMatcher();

// Function to handle the sync button
function syncBeats() {
    const success = beatMatcher.syncBothDecks();
    if (success) {
        updateStatus('Beats synced successfully!');
    } else {
        updateStatus('Unable to sync beats. Make sure at least one deck is playing.', 'warning');
    }
}

// Function to quantize a cue point (for example, when setting a cue)
function quantizeCue(deckId, currentTime) {
    const quantizedTime = beatMatcher.quantize(deckId, currentTime);
    // Set the audio to the quantized time
    const audioElement = audioEngine.sources[`deck${deckId}`]?.element;
    if (audioElement) {
        audioElement.currentTime = quantizedTime;
    }
    return quantizedTime;
}

// When the user clicks the cue button, we can quantize the cue point
function cueTrackWithQuantize(deckId) {
    const deck = djState.decks[deckId];
    if (!deck.loaded) return;

    // If the track is playing, pause it and go to the quantized cue point
    if (deck.playing) {
        audioEngine.pause(`deck${deckId}`);
        djState.updateDeck(deckId, { playing: false });
    }

    // Quantize the current time and set it
    const quantizedTime = quantizeCue(deckId, deck.currentTime);
    djState.updateDeck(deckId, { currentTime: quantizedTime });
    updateProgress(deckId, quantizedTime, deck.duration);
}