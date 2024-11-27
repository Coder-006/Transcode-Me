from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import os
import subprocess
from werkzeug.utils import secure_filename

app = Flask(__name__)
# Allow CORS for all routes and SocketIO connections from localhost
CORS(app, resources={r"/*": {"origins": ["http://localhost", "https://transcode-me.netlify.app"]}})

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins=["http://localhost", "https://transcode-me.netlify.app"]) # Enable Cross-Origin Resource Sharing

# Folder configuration
app.config['UPLOAD_FOLDER'] = './uploads'
app.config['TRANSCODED_FOLDER'] = './transcoded'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['TRANSCODED_FOLDER'], exist_ok=True)

# Allowed file types
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ['mp4', 'avi', 'mov', 'mp3', 'mkv']

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handles file uploads and saves them to the server."""
    if 'file' not in request.files:
        return jsonify({'message': 'No file uploaded'}), 400

    file = request.files['file']

    # Validate file
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'message': 'Invalid file type'}), 400

    # Save uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    return jsonify({
        'message': 'File uploaded successfully',
        'uploaded_file': filename
    })

@app.route('/transcode', methods=['POST'])
def transcode_file():
    """Handles transcoding of the uploaded file to the selected target format."""
    data = request.json
    if 'filename' not in data or 'target_format' not in data:
        return jsonify({'message': 'Filename or target format missing'}), 400

    filename = data['filename']
    target_format = data['target_format']

    # Validate the existence of the file
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(file_path):
        return jsonify({'message': 'File not found'}), 404

    # Transcoding logic
    output_filename = f"{os.path.splitext(filename)[0]}.{target_format}"
    output_path = os.path.join(app.config['TRANSCODED_FOLDER'], output_filename)

    try:
        # Use FFmpeg to transcode the media
        subprocess.run(
            ['ffmpeg', '-i', file_path, output_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
    except subprocess.CalledProcessError as e:
        return jsonify({'message': 'Transcoding failed', 'error': str(e)}), 500

    # Generate a URL for the transcoded file
    transcoded_file_url = f'http://localhost:5000/transcoded/{output_filename}'

    return jsonify({
        'message': 'Transcoding completed successfully',
        'transcoded_file': output_filename,
        'download_url': transcoded_file_url
    })

@app.route('/transcoded/<filename>')
def download_file(filename):
    """Serves the transcoded file."""
    return send_from_directory(app.config['TRANSCODED_FOLDER'], filename)

# SocketIO event to notify frontend about transcoding progress
@socketio.on('transcode_progress', namespace='/transcoding')
def handle_transcoding_progress(data):
    """
    Handle real-time progress updates during transcoding.
    Emits a progress percentage back to the client.
    """
    # Simulating a progress for demonstration
    for i in range(0, 101, 5):  # Increment by 5% each step
        socketio.emit('transcoding_update', {'progress': i}, namespace='/transcoding')
        socketio.sleep(1)  # Sleep to simulate time taken for transcoding (1 second)
    socketio.emit('transcoding_update', {'progress': 100}, namespace='/transcoding')

if __name__ == '__main__':
    socketio.run(app, debug=True, host="127.0.0.1")  # Run the app with SocketIO
