import numpy as np
from pydub import AudioSegment
from pydub.effects import speedup, normalize
import librosa
import soundfile as sf
import io
from scipy import signal
from scipy.io import wavfile

class AudioProcessor:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def load_audio(self, file_path):
        """Load audio file using librosa"""
        y, sr = librosa.load(file_path, sr=self.sample_rate, mono=True)
        return y, sr
    
    def calculate_bpm(self, audio_data):
        """Calculate BPM using librosa"""
        try:
            # Use onset detection for BPM estimation
            onset_env = librosa.onset.onset_strength(y=audio_data, sr=self.sample_rate)
            tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=self.sample_rate)
            return tempo[0] if len(tempo) > 0 else 120.0
        except:
            return 120.0
    
    def detect_beat_positions(self, audio_data):
        """Detect beat positions"""
        tempo, beat_frames = librosa.beat.beat_track(
            y=audio_data, 
            sr=self.sample_rate
        )
        beat_times = librosa.frames_to_time(beat_frames, sr=self.sample_rate)
        return beat_times, tempo
    
    def time_stretch(self, audio_data, factor):
        """Time stretching without pitch change"""
        return librosa.effects.time_stretch(audio_data, rate=factor)
    
    def pitch_shift(self, audio_data, semitones):
        """Pitch shifting"""
        return librosa.effects.pitch_shift(
            audio_data, 
            sr=self.sample_rate, 
            n_steps=semitones
        )
    
    def apply_filter(self, audio_data, filter_type='lowpass', cutoff=1000):
        """Apply audio filter"""
        nyquist = self.sample_rate / 2
        normal_cutoff = cutoff / nyquist
        
        if filter_type == 'lowpass':
            b, a = signal.butter(4, normal_cutoff, btype='low', analog=False)
        elif filter_type == 'highpass':
            b, a = signal.butter(4, normal_cutoff, btype='high', analog=False)
        elif filter_type == 'bandpass':
            b, a = signal.butter(4, [normal_cutoff/2, normal_cutoff*1.5], btype='band', analog=False)
        else:
            return audio_data
        
        filtered = signal.filtfilt(b, a, audio_data)
        return filtered
    
    def create_crossfade(self, audio1, audio2, duration=2.0):
        """Create crossfade between two audio segments"""
        # Ensure same length
        min_len = min(len(audio1), len(audio2))
        audio1 = audio1[:min_len]
        audio2 = audio2[:min_len]
        
        # Create fade curves
        fade_out = np.linspace(1, 0, int(self.sample_rate * duration))
        fade_in = np.linspace(0, 1, int(self.sample_rate * duration))
        
        # Apply fades
        audio1_faded = audio1.copy()
        audio2_faded = audio2.copy()
        
        fade_len = len(fade_out)
        audio1_faded[-fade_len:] *= fade_out
        audio2_faded[:fade_len] *= fade_in
        
        # Mix
        mixed = audio1_faded + audio2_faded
        return mixed
    
    def normalize_audio(self, audio_data):
        """Normalize audio to -1 to 1 range"""
        max_val = np.max(np.abs(audio_data))
        if max_val > 0:
            return audio_data / max_val
        return audio_data
    
    def save_to_wav(self, audio_data, filename):
        """Save audio data to WAV file"""
        wavfile.write(filename, self.sample_rate, audio_data)