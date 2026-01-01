import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///dj_mixer.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_TYPE = 'filesystem'
    YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    TEMP_AUDIO_FOLDER = 'temp_audio'
    
    # Audio processing settings
    SAMPLE_RATE = 44100
    BUFFER_SIZE = 2048
    FADE_DURATION = 2.0  # seconds