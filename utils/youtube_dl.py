import youtube_dl
import os
from pydub import AudioSegment
import requests
import json
from urllib.parse import urlparse, parse_qs

class YouTubeLoader:
    def __init__(self, temp_folder='temp_audio'):
        self.temp_folder = temp_folder
        if not os.path.exists(temp_folder):
            os.makedirs(temp_folder)
        
        self.ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(temp_folder, '%(id)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
        }
    
    def extract_video_id(self, url):
        """Extract video ID from various YouTube URL formats"""
        parsed = urlparse(url)
        if parsed.hostname in ('youtu.be',):
            return parsed.path[1:]
        if parsed.hostname in ('www.youtube.com', 'youtube.com', 'm.youtube.com'):
            if parsed.path == '/watch':
                return parse_qs(parsed.query)['v'][0]
            if parsed.path.startswith('/embed/'):
                return parsed.path.split('/')[2]
            if parsed.path.startswith('/v/'):
                return parsed.path.split('/')[2]
        return None
    
    def search_youtube(self, query, max_results=10):
        """Search YouTube for videos"""
        try:
            search_url = f"https://www.youtube.com/results?search_query={query}"
            # Note: In production, use YouTube Data API v3
            # For demo, we'll return mock data
            return self._mock_search_results(query, max_results)
        except Exception as e:
            print(f"Search error: {e}")
            return []
    
    def _mock_search_results(self, query, max_results):
        """Mock search results for development"""
        # In production, replace with actual YouTube API calls
        import random
        mock_tracks = [
            {
                'id': f'video_{i}',
                'title': f'{query} Track {i}',
                'duration': random.randint(120, 300),
                'thumbnail': f'https://img.youtube.com/vi/mock_{i}/0.jpg',
                'channel': 'Demo Channel'
            }
            for i in range(max_results)
        ]
        return mock_tracks
    
    def get_audio_info(self, video_id):
        """Get audio information without downloading"""
        try:
            with youtube_dl.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(
                    f'https://www.youtube.com/watch?v={video_id}',
                    download=False
                )
                return {
                    'id': info['id'],
                    'title': info['title'],
                    'duration': info['duration'],
                    'thumbnail': info['thumbnail'],
                    'url': info['url'],
                    'formats': info['formats']
                }
        except Exception as e:
            print(f"Error getting audio info: {e}")
            return None
    
    def download_audio(self, video_id):
        """Download audio from YouTube"""
        try:
            with youtube_dl.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(
                    f'https://www.youtube.com/watch?v={video_id}',
                    download=True
                )
                
                # Convert to WAV for audio processing
                mp3_path = os.path.join(self.temp_folder, f"{video_id}.mp3")
                wav_path = os.path.join(self.temp_folder, f"{video_id}.wav")
                
                audio = AudioSegment.from_mp3(mp3_path)
                audio.export(wav_path, format="wav")
                
                return {
                    'mp3_path': mp3_path,
                    'wav_path': wav_path,
                    'duration': len(audio) / 1000,  # Convert to seconds
                    'sample_rate': audio.frame_rate,
                    'channels': audio.channels
                }
        except Exception as e:
            print(f"Download error: {e}")
            return None
    
    def cleanup(self, video_id):
        """Clean up temporary files"""
        files = [
            os.path.join(self.temp_folder, f"{video_id}.mp3"),
            os.path.join(self.temp_folder, f"{video_id}.wav")
        ]
        for file in files:
            if os.path.exists(file):
                try:
                    os.remove(file)
                except:
                    pass