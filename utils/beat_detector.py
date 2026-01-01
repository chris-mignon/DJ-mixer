import numpy as np
import librosa
import librosa.display
from scipy import signal
from scipy.ndimage import maximum_filter

class BeatDetector:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        
    def extract_beats(self, audio_data, bpm=None):
        """
        Extract beat positions from audio data
        Returns beat positions in seconds
        """
        # Compute onset envelope
        onset_env = librosa.onset.onset_strength(
            y=audio_data, 
            sr=self.sample_rate,
            hop_length=512,
            aggregate=np.median
        )
        
        # If BPM is provided, use it for tempo estimation
        if bpm:
            tempo = float(bpm)
        else:
            # Estimate tempo
            tempo, _ = librosa.beat.beat_track(
                onset_envelope=onset_env,
                sr=self.sample_rate,
                hop_length=512
            )
            if isinstance(tempo, np.ndarray):
                tempo = tempo[0]
        
        # Detect beats
        beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=self.sample_rate,
            hop_length=512,
            start_bpm=tempo,
            tightness=100
        )[1]
        
        # Convert frames to time
        beat_times = librosa.frames_to_time(beat_frames, sr=self.sample_rate, hop_length=512)
        
        return beat_times, tempo
    
    def calculate_beat_phase(self, audio_data, beat_times):
        """Calculate beat phase alignment"""
        beat_samples = (beat_times * self.sample_rate).astype(int)
        
        # Calculate RMS energy at each beat
        beat_energies = []
        window_size = int(0.05 * self.sample_rate)  # 50ms window
        
        for beat_sample in beat_samples:
            start = max(0, beat_sample - window_size // 2)
            end = min(len(audio_data), beat_sample + window_size // 2)
            segment = audio_data[start:end]
            if len(segment) > 0:
                energy = np.sqrt(np.mean(segment ** 2))
                beat_energies.append(energy)
            else:
                beat_energies.append(0)
        
        return np.array(beat_energies)
    
    def find_downbeats(self, audio_data, beat_times, tempo):
        """Identify downbeats (first beat of each bar)"""
        # Assuming 4/4 time signature
        beats_per_bar = 4
        
        # Calculate bar positions
        beat_interval = 60 / tempo
        bar_positions = []
        
        for i, beat_time in enumerate(beat_times):
            if i % beats_per_bar == 0:
                bar_positions.append(beat_time)
        
        return np.array(bar_positions)
    
    def align_beats(self, beat_times_a, beat_times_b):
        """Align beats between two tracks"""
        if len(beat_times_a) == 0 or len(beat_times_b) == 0:
            return None, None
        
        # Find optimal time shift using cross-correlation
        max_len = max(len(beat_times_a), len(beat_times_b))
        beat_vector_a = np.zeros(max_len)
        beat_vector_b = np.zeros(max_len)
        
        for i, t in enumerate(beat_times_a[:max_len]):
            beat_vector_a[i] = 1
        
        for i, t in enumerate(beat_times_b[:max_len]):
            beat_vector_b[i] = 1
        
        # Cross-correlation
        correlation = np.correlate(beat_vector_a, beat_vector_b, mode='full')
        best_shift = np.argmax(correlation) - (max_len - 1)
        
        # Calculate required time shift
        avg_beat_interval_a = np.mean(np.diff(beat_times_a[:10])) if len(beat_times_a) > 1 else 0.5
        time_shift = best_shift * avg_beat_interval_a
        
        return time_shift, best_shift
    
    def create_beat_grid(self, audio_data, bpm, first_beat_time=0):
        """Create a regular beat grid"""
        beat_interval = 60 / bpm
        duration = len(audio_data) / self.sample_rate
        
        beat_times = []
        current_time = first_beat_time
        while current_time < duration:
            beat_times.append(current_time)
            current_time += beat_interval
        
        return np.array(beat_times)
    
    def quantize_to_grid(self, audio_data, bpm, quantization_strength=0.5):
        """Quantize audio to beat grid"""
        beat_interval = 60 / bpm
        beat_samples = int(beat_interval * self.sample_rate)
        
        # Split audio into beat segments
        num_beats = len(audio_data) // beat_samples
        quantized = np.zeros_like(audio_data)
        
        for i in range(num_beats):
            start = i * beat_samples
            end = start + beat_samples
            
            if end <= len(audio_data):
                segment = audio_data[start:end]
                # Apply quantization by aligning to grid
                quantized[start:end] = segment
        
        # Blend with original
        result = quantization_strength * quantized + (1 - quantization_strength) * audio_data
        
        return result
    
    def detect_energy_peaks(self, audio_data, threshold=0.1):
        """Detect energy peaks for manual beat detection"""
        # Compute RMS energy
        frame_length = 2048
        hop_length = 512
        
        energy = []
        for i in range(0, len(audio_data) - frame_length, hop_length):
            frame = audio_data[i:i + frame_length]
            rms = np.sqrt(np.mean(frame ** 2))
            energy.append(rms)
        
        energy = np.array(energy)
        
        # Find peaks
        peaks = signal.find_peaks(energy, height=threshold)[0]
        
        # Convert to time
        peak_times = peaks * hop_length / self.sample_rate
        
        return peak_times, energy