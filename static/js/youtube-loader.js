// YouTube Loader Module
class YouTubeLoader {
    constructor() {
        this.baseURL = '/api';
    }

    async search(query, limit = 10) {
        try {
            const response = await fetch(`${this.baseURL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (!response.ok) {
                throw new Error('Search request failed');
            }
            const data = await response.json();
            return data.results;
        } catch (error) {
            console.error('YouTubeLoader search error:', error);
            throw error;
        }
    }

    async getAudioInfo(videoId) {
        try {
            const response = await fetch(`${this.baseURL}/audio/info/${videoId}`);
            if (!response.ok) {
                throw new Error('Failed to get audio info');
            }
            return await response.json();
        } catch (error) {
            console.error('YouTubeLoader getAudioInfo error:', error);
            throw error;
        }
    }

    async analyzeAudio(videoId) {
        try {
            const response = await fetch(`${this.baseURL}/audio/analyze/${videoId}`, {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('Failed to analyze audio');
            }
            return await response.json();
        } catch (error) {
            console.error('YouTubeLoader analyzeAudio error:', error);
            throw error;
        }
    }

    async downloadAudio(videoId) {
        // Note: This would be called by the backend, but we can trigger it via analyzeAudio
        // which downloads the audio. We might want a separate endpoint for just downloading.
        // For now, we use analyzeAudio which downloads and analyzes.
        return this.analyzeAudio(videoId);
    }
}

// Create a global instance
const youtubeLoader = new YouTubeLoader();

// Functions to interact with the UI
function setupSearch(deckId) {
    const searchInput = document.getElementById(`search-${deckId}`);
    const searchButton = document.querySelector(`#deck-${deckId} .search-btn`);

    if (searchInput && searchButton) {
        const performSearch = () => {
            const query = searchInput.value.trim();
            if (query) {
                searchAndDisplayResults(deckId, query);
            }
        };

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        searchButton.addEventListener('click', performSearch);
    }
}

async function searchAndDisplayResults(deckId, query) {
    const resultsContainer = document.getElementById(`results-${deckId}`);
    if (!resultsContainer) return;

    try {
        resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
        const results = await youtubeLoader.search(query, 10);

        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No results found.</div>';
            return;
        }

        let html = '';
        results.forEach(track => {
            html += `
                <div class="search-result-item" data-video-id="${track.id}" data-title="${track.title}">
                    <img src="${track.thumbnail}" alt="${track.title}">
                    <div class="result-info">
                        <div class="result-title">${track.title}</div>
                        <div class="result-channel">${track.channel}</div>
                        <div class="result-duration">${formatDuration(track.duration)}</div>
                    </div>
                </div>
            `;
        });

        resultsContainer.innerHTML = html;

        // Add event listeners to each result item
        document.querySelectorAll(`#results-${deckId} .search-result-item`).forEach(item => {
            item.addEventListener('click', () => {
                const videoId = item.getAttribute('data-video-id');
                const title = item.getAttribute('data-title');
                loadTrackToDeck(deckId, videoId, title);
            });
        });

    } catch (error) {
        resultsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function loadTrackToDeck(deckId, videoId, title) {
    // Update UI to show loading
    const trackTitleElement = document.getElementById(`title-${deckId}`);
    if (trackTitleElement) {
        trackTitleElement.textContent = 'Loading...';
    }

    try {
        // Analyze the audio to get BPM and other info
        const analysis = await youtubeLoader.analyzeAudio(videoId);

        // Load the audio in the audio engine
        const result = await audioEngine.loadYouTubeAudio(videoId, `deck${deckId}`);

        if (result.success) {
            // Update the state
            djState.updateDeck(deckId, {
                loaded: true,
                title: title,
                duration: result.duration,
                bpm: analysis.bpm,
                videoId: videoId,
                currentTime: 0
            });

            // Update the UI
            document.getElementById(`thumb-${deckId}`).src = `https://img.youtube.com/vi/${videoId}/0.jpg`;
            document.getElementById(`title-${deckId}`).textContent = title;
            document.getElementById(`duration-${deckId}`).textContent = formatDuration(result.duration);
            document.getElementById(`bpm-${deckId}`).textContent = Math.round(analysis.bpm);

            // Set up the audio element listeners for progress
            const audioElement = result.element;
            audioElement.addEventListener('timeupdate', () => {
                djState.decks[deckId].currentTime = audioElement.currentTime;
                updateProgress(deckId, audioElement.currentTime, result.duration);
            });

            audioElement.addEventListener('ended', () => {
                djState.decks[deckId].playing = false;
                djState.updateDisplay();
            });

            // Clear the search results
            document.getElementById(`results-${deckId}`).innerHTML = '';

            // Update the status
            updateStatus(`Loaded: ${title} (${Math.round(analysis.bpm)} BPM)`);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Failed to load track:', error);
        updateStatus(`Failed to load track: ${error.message}`, 'error');
        // Reset the title
        if (trackTitleElement) {
            trackTitleElement.textContent = 'No Track Loaded';
        }
    }
}

// Initialize search for both decks when the page loads
document.addEventListener('DOMContentLoaded', () => {
    setupSearch('a');
    setupSearch('b');
});