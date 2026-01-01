from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from functools import wraps
import hashlib

auth_bp = Blueprint('auth', __name__)

# Simple in-memory user storage (use database in production)
users = {
    'admin': {
        'password': '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',  # 'password' hashed
        'name': 'Administrator'
    }
}

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        # Hash the password
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Check credentials
        if username in users and users[username]['password'] == password_hash:
            session['user_id'] = username
            session['user_name'] = users[username]['name']
            return jsonify({
                'success': True,
                'username': username,
                'name': users[username]['name']
            })
        
        return jsonify({'error': 'Invalid credentials'}), 401
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        name = data.get('name', username)
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        if username in users:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Hash password
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Store user (in production, use database)
        users[username] = {
            'password': password_hash,
            'name': name
        }
        
        return jsonify({
            'success': True,
            'message': 'Registration successful'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/check_auth', methods=['GET'])
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'authenticated': True,
            'username': session['user_id'],
            'name': session.get('user_name')
        })
    return jsonify({'authenticated': False})