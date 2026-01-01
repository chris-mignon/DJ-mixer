class YouTubeLoader {
    constructor() {
        this.apiKey = null;
        this.baseURL = 'https://www.googleapis.com/youtube/v3';
        this.cache = new Map();
        this.searchHistory = [];
    }

    async initialize() {
        try {
            // Get API key from server
            const response = await fetch('/api/youtube_key');
            const data = await response.json();
            this.apiKey = data.api_key;
            return true;
        } catch (error) {
            console.warn('YouTube API key not available, using mock data');
            return false;
        }
    }

    async search(query, maxResults = 10) {
        // Check cache first
        const cacheKey = `search:${query}:${maxResults}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            if (!this.apiKey) {
                return this.getMockResults(query, maxResults);
            }

            const response = await fetch(
                `${this.baseURL}/search?part=snippet&maxResults=${maxResults}&q=${encodeURIComponent(query)}&type=video&key=${this.apiKey}`
            );

            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status}`);
            }

            const data = await response.json();
            const results = this.processSearchResults(data.items);

            // Cache results
            this.cache.set(cacheKey, results);
            this.searchHistory.push({ query, timestamp: Date.now() });

            return results;

        } catch (error) {
            console.error('YouTube search failed:', error);
            return this.getMockResults(query, maxResults);
        }
    }

    async getVideoDetails(videoId) {
        const cacheKey = `video:${videoId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            if (!this.apiKey) {
                return this.getMockVideoDetails(videoId);
            }

            const response = await fetch(
                `${this.baseURL}/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${this.apiKey}`
            );

            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                throw new Error('Video not found');
            }

            const videoInfo = this.processVideoDetails(data.items[0]);

            // Cache result
            this.cache.set(cacheKey, videoInfo);

            return videoInfo;

        } catch (error) {
            console.error('Failed to get video details:', error);
            return this.getMockVideoDetails(videoId);
        }
    }

    async getAudioStreamUrl(videoId) {
        try {
            // Use backend proxy to avoid CORS issues
            const response = await fetch(`/api/youtube_audio/${videoId}`);
            const data = await response.json();

            if (data.success && data.audio_url) {
                return data.audio_url;
            } else {
                throw new Error(data.error || 'Failed to get audio URL');
            }

        } catch (error) {
            console.error('Failed to get audio stream:', error);
            
            // Fallback: Try to extract from YouTube directly (may have CORS issues)
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
    }

    processSearchResults(items) {
        return items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.medium.url,
            channel: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            duration: 'N/A' // Would need another API call to get duration
        }));
    }

    processVideoDetails(item) {
        // Parse ISO 8601 duration
        const duration = this.parseDuration(item.contentDetails.duration);

        return {
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.high.url,
            channel: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            duration: duration,
            viewCount: item.statistics.viewCount,
            likeCount: item.statistics.likeCount,
            categoryId: item.snippet.categoryId,
            tags: item.snippet.tags || []
        };
    }

    parseDuration(duration) {
        // Parse ISO 8601 duration (e.g., PT1H33M43S)
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        
        if (!match) return 0;
        
        const hours = (match[1] || '').replace('H', '') || 0;
        const minutes = (match[2] || '').replace('M', '') || 0;
        const seconds = (match[3] || '').replace('S', '') || 0;
        
        return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
    }

    getMockResults(query, maxResults) {
        // Generate mock search results for development
        const mockResults = [];
        const genres = ['House', 'Techno', 'Trance', 'Drum & Bass', 'Hip Hop', 'Pop', 'Rock', 'Jazz'];

        for (let i = 0; i < maxResults; i++) {
            const genre = genres[Math.floor(Math.random() * genres.length)];
            const duration = 120 + Math.floor(Math.random() * 300); // 2-7 minutes
            const bpm = 120 + Math.floor(Math.random() * 40); // 120-160 BPM

            mockResults.push({
                id: `mock_${Date.now()}_${i}`,
                title: `${query} ${genre} Track ${i + 1}`,
                description: `A great ${genre.toLowerCase()} track for mixing. Estimated BPM: ${bpm}`,
                thumbnail: `https://picsum.photos/320/180?random=${i}`,
                channel: 'Demo Channel',
                publishedAt: new Date().toISOString(),
                duration: duration,
                bpm: bpm
            });
        }

        return mockResults;
    }

    getMockVideoDetails(videoId) {
        const genres = ['House', 'Techno', 'Trance', 'Drum & Bass', 'Hip Hop'];
        const genre = genres[Math.floor(Math.random() * genres.length)];
        const duration = 180 + Math.floor(Math.random() * 180); // 3-6 minutes
        const bpm = 120 + Math.floor(Math.random() * 40); // 120-160 BPM

        return {
            id: videoId,
            title: `Demo ${genre} Track`,
            description: `This is a demo ${genre.toLowerCase()} track for testing the DJ mixer application.`,
            thumbnail: 'https://picsum.photos/480/360',
            channel: 'DJ Mixer Pro Demo',
            publishedAt: new Date().toISOString(),
            duration: duration,
            viewCount: Math.floor(Math.random() * 1000000),
            likeCount: Math.floor(Math.random() * 50000),
            categoryId: '10', // Music
            tags: ['demo', 'music', genre.toLowerCase(), 'dj', 'mix'],
            bpm: bpm
        };
    }

    async getPlaylistVideos(playlistId) {
        try {
            if (!this.apiKey) {
                return this.getMockPlaylist(playlistId);
            }

            const response = await fetch(
                `${this.baseURL}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${this.apiKey}`
            );

            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status}`);
            }

            const data = await response.json();
            return data.items.map(item => ({
                id: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.medium.url,
                position: item.snippet.position
            }));

        } catch (error) {
            console.error('Failed to get playlist:', error);
            return this.getMockPlaylist(playlistId);
        }
    }

    getMockPlaylist(playlistId) {
        const mockVideos = [];
        const genres = ['House', 'Techno', 'Trance'];

        for (let i = 0; i < 10; i++) {
            const genre = genres[i % genres.length];
            mockVideos.push({
                id: `playlist_${playlistId}_${i}`,
                title: `Playlist ${genre} Track ${i + 1}`,
                thumbnail: `https://picsum.photos/320/180?playlist=${i}`,
                position: i
            });
        }

        return mockVideos;
    }

    clearCache() {
        this.cache.clear();
        console.log('YouTube cache cleared');
    }

    getSearchHistory() {
        return this.searchHistory.slice(-10).reverse(); // Last 10 searches
    }
}

// Global YouTube loader instance
const youtubeLoader = new YouTubeLoader();

// YouTube integration functions
async function initYouTubeLoader() {
    const initialized = await youtubeLoader.initialize();
    if (initialized) {
        updateStatus('YouTube loader initialized');
    } else {
        updateStatus('YouTube loader using mock data', 'warning');
    }
}

async function searchYouTube(deckId) {
    const inputElement = document.getElementById(`search-${deckId.toLowerCase()}`);
    const query = inputElement.value.trim();
    
    if (!query) {
        updateStatus('Please enter a search query', 'warning');
        return;
    }
    
    updateStatus(`Searching YouTube for: ${query}...`);
    
    try {
        const results = await youtubeLoader.search(query, 10);
        displaySearchResults(deckId, results);
        
        updateStatus(`Found ${results.length} results`);
        
    } catch (error) {
        console.error('Search failed:', error);
        updateStatus('Search failed. Please try again.', 'error');
    }
}

function displaySearchResults(deckId, results) {
    const resultsContainer = document.getElementById(`results-${deckId.toLowerCase()}`);
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }
    
    results.forEach(result => {
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result-item';
        resultElement.innerHTML = `
            <div class="result-thumbnail">
                <img src="${result.thumbnail}" alt="${result.title}">
                <div class="result-duration">${formatDuration(result.duration)}</div>
            </div>
            <div class="result-details">
                <div class="result-title">${result.title}</div>
                <div class="result-channel">${result.channel}</div>
                <div class="result-meta">
                    <span class="result-bpm">${result.bpm ? result.bpm + ' BPM' : 'BPM: N/A'}</span>
                    <span class="result-length">${formatDuration(result.duration)}</span>
                </div>
            </div>
            <button class="result-load-btn" onclick="loadYouTubeTrack('${deckId}', '${result.id}')">
                <i class="fas fa-plus"></i> Load
            </button>
        `;
        
        resultsContainer.appendChild(resultElement);
    });
}

async function loadYouTubeTrack(deckId, videoId) {
    updateStatus(`Loading YouTube track...`);
    
    try {
        // Get video details
        const videoInfo = await youtubeLoader.getVideoDetails(videoId);
        
        // Get audio stream URL
        const audioUrl = await youtubeLoader.getAudioStreamUrl(videoId);
        
        // Load into audio engine
        const result = await audioEngine.loadYouTubeAudio(videoId, `deck${deckId}`);
        
        if (result.success) {
            // Update deck state
            djState.updateDeck(deckId, {
                loaded: true,
                title: videoInfo.title,
                artist: videoInfo.channel,
                duration: videoInfo.duration,
                bpm: videoInfo.bpm || 120,
                videoId: videoId,
                currentTime: 0,
                thumbnail: videoInfo.thumbnail
            });
            
            // Update UI
            updateDeckUI(deckId, videoInfo);
            
            // Analyze beats
            await analyzeTrackBeats(deckId);
            
            updateStatus(`Loaded: ${videoInfo.title}`);
            
            // Clear search results
            document.getElementById(`results-${deckId.toLowerCase()}`).innerHTML = '';
            
        } else {
            throw new Error('Failed to load audio');
        }
        
    } catch (error) {
        console.error('Failed to load YouTube track:', error);
        updateStatus(`Failed to load track: ${error.message}`, 'error');
    }
}

function updateDeckUI(deckId, videoInfo) {
    // Update thumbnail
    const thumbElement = document.getElementById(`thumb-${deckId.toLowerCase()}`);
    if (thumbElement) {
        thumbElement.src = videoInfo.thumbnail;
        thumbElement.alt = videoInfo.title;
    }
    
    // Update title
    const titleElement = document.getElementById(`title-${deckId.toLowerCase()}`);
    if (titleElement) {
        titleElement.textContent = videoInfo.title;
    }
    
    // Update duration
    const durationElement = document.getElementById(`duration-${deckId.toLowerCase()}`);
    if (durationElement) {
        durationElement.textContent = formatDuration(videoInfo.duration);
    }
    
    // Update BPM if available
    if (videoInfo.bpm) {
        const bpmElement = document.querySelector(`#deck-${deckId.toLowerCase()} .bpm-value`);
        if (bpmElement) {
            bpmElement.textContent = Math.round(videoInfo.bpm);
        }
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds === 'N/A') return '--:--';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Add to search input event listeners
document.addEventListener('DOMContentLoaded', () => {
    ['a', 'b'].forEach(deckId => {
        const searchInput = document.getElementById(`search-${deckId}`);
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    searchYouTube(deckId.toUpperCase());
                }
            });
        }
    });
    
    // Initialize YouTube loader
    initYouTubeLoader();
});