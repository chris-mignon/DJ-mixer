from flask import Blueprint, request, jsonify, current_app
import json
from utils.youtube_dl import YouTubeLoader
from utils.audio_processor import AudioProcessor
import os

api_bp = Blueprint('api', __name__)
youtube_loader = YouTubeLoader()
audio_processor = AudioProcessor()

@api_bp.route('/search', methods=['GET'])
def search_youtube():
    query = request.args.get('q', '')
    limit = int(request.args.get('limit', 10))
    
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    
    results = youtube_loader.search_youtube(query, max_results=limit)
    return jsonify({'results': results})

@api_bp.route('/audio/info/<video_id>', methods=['GET'])
def get_audio_info(video_id):
    info = youtube_loader.get_audio_info(video_id)
    if info:
        return jsonify(info)
    return jsonify({'error': 'Could not fetch audio info'}), 404

@api_bp.route('/audio/analyze/<video_id>', methods=['POST'])
def analyze_audio(video_id):
    try:
        # Download and analyze audio
        audio_info = youtube_loader.download_audio(video_id)
        if not audio_info:
            return jsonify({'error': 'Failed to download audio'}), 500
        
        # Load and analyze
        audio_data, sr = audio_processor.load_audio(audio_info['wav_path'])
        
        # Calculate BPM
        bpm = audio_processor.calculate_bpm(audio_data)
        
        # Detect beats
        beat_times, detected_tempo = audio_processor.detect_beat_positions(audio_data)
        
        # Cleanup
        youtube_loader.cleanup(video_id)
        
        return jsonify({
            'bpm': float(bpm),
            'detected_tempo': float(detected_tempo),
            'duration': audio_info['duration'],
            'sample_rate': sr,
            'beat_count': len(beat_times),
            'first_beat': float(beat_times[0]) if len(beat_times) > 0 else 0
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/mix', methods=['POST'])
def mix_audio():
    data = request.json
    video_id1 = data.get('video_id1')
    video_id2 = data.get('video_id2')
    crossfade_duration = data.get('crossfade_duration', 2.0)
    
    try:
        # Download both tracks
        audio1_info = youtube_loader.download_audio(video_id1)
        audio2_info = youtube_loader.download_audio(video_id2)
        
        # Load audio
        audio1, sr1 = audio_processor.load_audio(audio1_info['wav_path'])
        audio2, sr2 = audio_processor.load_audio(audio2_info['wav_path'])
        
        # Ensure same sample rate
        if sr1 != sr2:
            # Resample if needed (simplified)
            audio2 = audio_processor.time_stretch(audio2, sr2/sr1)
        
        # Create crossfade
        mixed = audio_processor.create_crossfade(
            audio1, 
            audio2, 
            duration=crossfade_duration
        )
        
        # Save mixed audio
        output_path = os.path.join(
            current_app.config['TEMP_AUDIO_FOLDER'],
            f'mixed_{video_id1}_{video_id2}.wav'
        )
        audio_processor.save_to_wav(mixed, output_path)
        
        # Return download URL
        return jsonify({
            'mixed_url': f'/api/download/{os.path.basename(output_path)}',
            'duration': len(mixed) / sr1
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Cleanup
        youtube_loader.cleanup(video_id1)
        youtube_loader.cleanup(video_id2)

@api_bp.route('/download/<filename>', methods=['GET'])
def download_audio(filename):
    filepath = os.path.join(current_app.config['TEMP_AUDIO_FOLDER'], filename)
    if os.path.exists(filepath):
        from flask import send_file
        return send_file(filepath, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404