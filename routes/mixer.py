from flask import Blueprint, render_template, jsonify, request, session
from flask_socketio import emit
from utils.youtube_dl import YouTubeLoader
from utils.audio_processor import AudioProcessor
import json

mixer_bp = Blueprint('mixer', __name__)
youtube_loader = YouTubeLoader()
audio_processor = AudioProcessor()

@mixer_bp.route('/load_track', methods=['POST'])
def load_track():
    """Load a track to a specific deck"""
    try:
        data = request.json
        deck_id = data.get('deck_id')
        video_id = data.get('video_id')
        
        # Download and analyze track
        track_info = youtube_loader.download_audio(video_id)
        if not track_info:
            return jsonify({'error': 'Failed to download audio'}), 500
        
        # Analyze BPM and beats
        audio_data, sr = audio_processor.load_audio(track_info['wav_path'])
        bpm = audio_processor.calculate_bpm(audio_data)
        beat_times, detected_tempo = audio_processor.detect_beat_positions(audio_data)
        
        # Store in session
        if 'tracks' not in session:
            session['tracks'] = {}
        
        session['tracks'][deck_id] = {
            'video_id': video_id,
            'bpm': bpm,
            'duration': track_info['duration'],
            'wav_path': track_info['wav_path'],
            'beat_times': beat_times.tolist() if hasattr(beat_times, 'tolist') else beat_times
        }
        session.modified = True
        
        return jsonify({
            'success': True,
            'bpm': float(bpm),
            'duration': track_info['duration'],
            'deck_id': deck_id
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@mixer_bp.route('/get_track_info/<video_id>', methods=['GET'])
def get_track_info(video_id):
    """Get track information without downloading"""
    try:
        info = youtube_loader.get_audio_info(video_id)
        if info:
            return jsonify(info)
        return jsonify({'error': 'Track not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@mixer_bp.route('/sync_beats', methods=['POST'])
def sync_beats():
    """Sync beats between two tracks"""
    try:
        data = request.json
        deck_a_id = data.get('deck_a')
        deck_b_id = data.get('deck_b')
        
        # Get track information from session
        track_a = session.get('tracks', {}).get(deck_a_id)
        track_b = session.get('tracks', {}).get(deck_b_id)
        
        if not track_a or not track_b:
            return jsonify({'error': 'Both tracks must be loaded'}), 400
        
        # Calculate BPM ratio for synchronization
        bpm_ratio = track_a['bpm'] / track_b['bpm']
        
        return jsonify({
            'success': True,
            'bpm_ratio': float(bpm_ratio),
            'deck_a_bpm': float(track_a['bpm']),
            'deck_b_bpm': float(track_b['bpm']),
            'pitch_adjustment': float((bpm_ratio - 1) * 100)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@mixer_bp.route('/save_mix', methods=['POST'])
def save_mix():
    """Save the current mix as a file"""
    try:
        data = request.json
        deck_a_id = data.get('deck_a')
        deck_b_id = data.get('deck_b')
        crossfade_duration = data.get('crossfade_duration', 2.0)
        
        # Load audio files
        track_a = session.get('tracks', {}).get(deck_a_id)
        track_b = session.get('tracks', {}).get(deck_b_id)
        
        if not track_a or not track_b:
            return jsonify({'error': 'Both tracks must be loaded'}), 400
        
        # Load audio data
        audio1, sr1 = audio_processor.load_audio(track_a['wav_path'])
        audio2, sr2 = audio_processor.load_audio(track_b['wav_path'])
        
        # Ensure same sample rate
        if sr1 != sr2:
            # Resample audio2 to match audio1
            import librosa
            audio2 = librosa.resample(audio2, orig_sr=sr2, target_sr=sr1)
        
        # Apply crossfade
        mixed_audio = audio_processor.create_crossfade(
            audio1, audio2, duration=crossfade_duration
        )
        
        # Save mixed audio
        import os
        from datetime import datetime
        output_filename = f"mix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.wav"
        output_path = os.path.join('static', 'mixes', output_filename)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        audio_processor.save_to_wav(mixed_audio, output_path)
        
        return jsonify({
            'success': True,
            'mix_url': f'/static/mixes/{output_filename}',
            'duration': len(mixed_audio) / sr1
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@mixer_bp.route('/get_mixes', methods=['GET'])
def get_mixes():
    """Get list of saved mixes"""
    import os
    mixes_dir = os.path.join('static', 'mixes')
    if not os.path.exists(mixes_dir):
        return jsonify({'mixes': []})
    
    mixes = []
    for filename in os.listdir(mixes_dir):
        if filename.endswith('.wav'):
            filepath = os.path.join(mixes_dir, filename)
            stat = os.stat(filepath)
            mixes.append({
                'filename': filename,
                'url': f'/static/mixes/{filename}',
                'size': stat.st_size,
                'created': stat.st_ctime
            })
    
    return jsonify({'mixes': sorted(mixes, key=lambda x: x['created'], reverse=True)})

@mixer_bp.route('/delete_mix/<filename>', methods=['DELETE'])
def delete_mix(filename):
    """Delete a saved mix"""
    import os
    filepath = os.path.join('static', 'mixes', filename)
    if os.path.exists(filepath):
        os.remove(filepath)
        return jsonify({'success': True})
    return jsonify({'error': 'File not found'}), 404