from flask import Flask, render_template, session, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os
from config import Config
from datetime import timedelta

# Initialize extensions
db = SQLAlchemy()
socketio = SocketIO()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Ensure temp directory exists
    if not os.path.exists(app.config['TEMP_AUDIO_FOLDER']):
        os.makedirs(app.config['TEMP_AUDIO_FOLDER'])
    
    # Initialize extensions
    db.init_app(app)
    CORS(app)
    socketio.init_app(app, cors_allowed_origins="*", async_mode='eventlet')
    
    # Register blueprints
    from routes.api import api_bp
    from routes.mixer import mixer_bp
    from routes.auth import auth_bp
    
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(mixer_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/mixer')
    def mixer():
        return render_template('mixer.html')
    
    # WebSocket events
    @socketio.on('connect')
    def handle_connect():
        print('Client connected')
        emit('connection_response', {'data': 'Connected to DJ Mixer Server'})
    
    @socketio.on('deck_control')
    def handle_deck_control(data):
        # Broadcast deck controls to all clients
        emit('deck_update', data, broadcast=True, include_self=False)
    
    @socketio.on('crossfader_change')
    def handle_crossfader(data):
        emit('crossfader_update', data, broadcast=True, include_self=False)
    
    @socketio.on('bpm_sync')
    def handle_bpm_sync(data):
        emit('sync_update', data, broadcast=True, include_self=False)
    
    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)