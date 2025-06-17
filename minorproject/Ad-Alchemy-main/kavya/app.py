from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import sys
import logging
from PIL import Image
import shutil
import uuid
from datetime import datetime  # Add this import for datetime

# Add the path to your ML model
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Create a new Flask app instead of importing from gemmi
app = Flask(__name__, static_folder='images')
CORS(app)  # Enable CORS for all routes

# Import necessary components from gemmi
from gemmi import (
    GeminiImageGenerator, 
    next_image_filename, 
    BANNER_WIDTH, 
    BANNER_HEIGHT
)

# Load API key
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "GEMINI_API_KEY.env"))
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.error("GEMINI_API_KEY not found in GEMINI_API_KEY.env. Please add it and try again.")

# Initialize the generator
generator = None
if API_KEY:
    generator = GeminiImageGenerator(api_key=API_KEY)
    logger.info("Initialized Gemini generator successfully")
else:
    logger.error("Failed to initialize Gemini generator - missing API key")

# Define paths for temporary and saved images
TEMP_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
SAVED_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_images")
os.makedirs(TEMP_IMAGES_DIR, exist_ok=True)
os.makedirs(SAVED_IMAGES_DIR, exist_ok=True)

@app.route('/generate', methods=['POST'])
def generate():
    try:
        if not generator:
            return jsonify({'error': 'API key not configured'}), 500
            
        data = request.json
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
            
        # Enhance the prompt with banner-specific instructions
        banner_instructions = (
            "Create a professional horizontal banner image with the following specifications:\n"
            f"- Exact dimensions: {BANNER_WIDTH}x{BANNER_HEIGHT} pixels\n"
            "- Use a horizontal rectangular layout with proper banner proportions\n"
            "- Include visually appealing design elements typical of banners\n"
            "- Ensure any text is readable and properly positioned for a banner\n"
            "- Avoid generating images that only show the word 'Boost' or similar text\n"
            "- Create a complete, polished banner design based on this prompt:\n\n"
        )
        
        enhanced_prompt = banner_instructions + prompt
        
        # Generate the image
        image = generator.generate_image(enhanced_prompt)
        
        # Resize to banner dimensions
        image = image.resize((BANNER_WIDTH, BANNER_HEIGHT), Image.LANCZOS)
        
        # Save the image
        images_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
        os.makedirs(images_dir, exist_ok=True)
        
        filename = next_image_filename(directory=images_dir)
        image_path = os.path.join(images_dir, filename)
        image.save(image_path)
        logger.info(f"Image saved to {image_path}")
        
        # Create a full URL for the image that includes the host
        image_url = f"http://localhost:5000/images/{filename}"
        
        logger.info(f"Generated image URL: {image_url}")
        
        return jsonify({
            'success': True,
            'image_url': image_url,
            'filename': filename,
            'prompt': prompt
        })
        
    except Exception as e:
        logger.exception("Error: %s", e)
        return jsonify({'error': str(e)}), 500

# Add new endpoint to save images permanently
# Modify the save-image endpoint to include more design-related information
# Add new endpoint to save images permanently
# Modify the save-image endpoint to include the saved flag
# Modify the save-image endpoint to ensure saved flag is always true
@app.route('/save-image', methods=['POST'])
def save_image():
    try:
        data = request.json
        logger.info(f"Received save request with data: {data}")
        
        filename = data.get('filename')
        prompt = data.get('prompt', '')
        user_id = data.get('userId', 'anonymous')
        design_type = data.get('type', 'banner')
        saved = True  # Always set to True when explicitly saving
        
        if not filename:
            logger.error("No filename provided in save request")
            return jsonify({'error': 'No filename provided', 'success': False}), 400
        
        # Generate a unique filename for the saved image
        unique_id = str(uuid.uuid4())[:8]
        saved_filename = f"saved_{user_id}_{unique_id}_{filename}"
        
        # Source and destination paths
        source_path = os.path.join(TEMP_IMAGES_DIR, filename)
        dest_path = os.path.join(SAVED_IMAGES_DIR, saved_filename)
        
        logger.info(f"Attempting to save image from {source_path} to {dest_path}")
        logger.info(f"TEMP_IMAGES_DIR: {TEMP_IMAGES_DIR}")
        logger.info(f"SAVED_IMAGES_DIR: {SAVED_IMAGES_DIR}")
        
        # Debug: List all files in the temp directory
        logger.info(f"Files in temp directory: {os.listdir(TEMP_IMAGES_DIR)}")
        
        # Check if source file exists
        if not os.path.exists(source_path):
            logger.error(f"Source image not found at {source_path}")
            
            # Try to find the file without directory structure
            logger.info(f"Trying alternative path with basename: {os.path.basename(filename)}")
            alternative_path = os.path.join(TEMP_IMAGES_DIR, os.path.basename(filename))
            
            if os.path.exists(alternative_path):
                source_path = alternative_path
                logger.info(f"Found image at alternative path: {source_path}")
            else:
                # Try to find a similar filename
                logger.info("Searching for similar filenames...")
                for file in os.listdir(TEMP_IMAGES_DIR):
                    if os.path.basename(filename) in file:
                        source_path = os.path.join(TEMP_IMAGES_DIR, file)
                        logger.info(f"Found similar filename: {source_path}")
                        break
                
                if not os.path.exists(source_path):
                    logger.error(f"Could not find any matching file for {filename}")
                    return jsonify({'error': f'Source image not found: {filename}', 'success': False}), 404
        
        # Copy the file to the saved images directory
        try:
            shutil.copy2(source_path, dest_path)
            logger.info(f"Image saved permanently to {dest_path}")
        except Exception as copy_error:
            logger.exception(f"Error copying file: {copy_error}")
            return jsonify({'error': f'Failed to copy file: {str(copy_error)}', 'success': False}), 500
        
        # Create metadata file with more design-related information
        created_at = datetime.now().isoformat()
        # Include the saved flag in the metadata
        metadata_path = os.path.join(SAVED_IMAGES_DIR, f"{saved_filename}.meta")
        try:
            with open(metadata_path, 'w') as f:
                f.write(f"Prompt: {prompt}\n")
                f.write(f"Type: {design_type}\n")
                f.write(f"Original filename: {filename}\n")
                f.write(f"User ID: {user_id}\n")
                f.write(f"Saved: {saved}\n")  # Always True
                f.write(f"Saved on: {created_at}\n")
            logger.info(f"Metadata saved to {metadata_path}")
        except Exception as meta_error:
            logger.exception(f"Error writing metadata: {meta_error}")
            # Continue even if metadata writing fails
        
        # Return the new permanent URL and design information
        saved_url = f"http://localhost:5000/saved-images/{saved_filename}"
        
        logger.info(f"Save successful, returning URL: {saved_url}")
        
        # Debug: List all files in the saved directory after save
        logger.info(f"Files in saved directory after save: {os.listdir(SAVED_IMAGES_DIR)}")
        
        return jsonify({
            'success': True,
            'design': {
                'id': saved_filename,
                'type': design_type,
                'prompt': prompt,
                'imageUrl': saved_url,
                'createdAt': created_at,
                'saved': saved  # Always True
            }
        })
        
    except Exception as e:
        logger.exception(f"Error saving image: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

# Modify the user-designs endpoint to show all saved images
@app.route('/user-designs/<user_id>', methods=['GET'])
def get_user_designs(user_id):
    try:
        designs = []
        
        for filename in os.listdir(SAVED_IMAGES_DIR):
            if filename.startswith(f"saved_{user_id}_") and not filename.endswith('.meta'):
                # Default values
                is_saved = True  # Default to True for all saved images
                prompt = ""
                design_type = "banner"
                created_at = datetime.fromtimestamp(os.path.getctime(os.path.join(SAVED_IMAGES_DIR, filename))).isoformat()
                
                meta_file = os.path.join(SAVED_IMAGES_DIR, f"{filename}.meta")
                if os.path.exists(meta_file):
                    try:
                        with open(meta_file, 'r') as f:
                            content = f.read()
                            # Parse metadata
                            for line in content.split('\n'):
                                if line.startswith("Prompt:"):
                                    prompt = line.split("Prompt:")[1].strip()
                                elif line.startswith("Type:"):
                                    design_type = line.split("Type:")[1].strip()
                    except Exception as e:
                        logger.error(f"Error reading metadata for {filename}: {e}")
                else:
                    logger.warning(f"No metadata file found for {filename}")
                
                # Create the image URL
                image_url = f"http://localhost:5000/saved-images/{filename}"
                
                design = {
                    'id': filename,
                    'type': design_type,
                    'prompt': prompt,
                    'imageUrl': image_url,
                    'createdAt': created_at,
                    'saved': is_saved  # Always True
                }
                
                logger.info(f"Adding design: {design}")
                designs.append(design)
        
        # Sort by creation time, newest first
        designs.sort(key=lambda x: x['createdAt'], reverse=True)
        
        logger.info(f"Returning {len(designs)} designs for user {user_id}")
        
        return jsonify({
            'success': True,
            'designs': designs
        })
        
    except Exception as e:
        logger.exception(f"Error retrieving user designs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'status': 'online',
        'service': 'Moksha Image Generator API',
        'endpoints': {
            '/generate': 'POST - Generate an image from a text prompt',
            '/save-image': 'POST - Save a generated image permanently',
            '/images/<filename>': 'GET - Retrieve a generated image',
            '/saved-images/<filename>': 'GET - Retrieve a saved image',
            '/list-saved-images/<user_id>': 'GET - List all saved images for a user'
        }
    })

if __name__ == '__main__':
    print(f"Starting Flask server from {os.path.abspath(__file__)}")
    if not API_KEY:
        logger.warning("Running without API key - generation will fail")
    
    # Create images directory if it doesn't exist
    logger.info(f"Temporary images will be stored in: {TEMP_IMAGES_DIR}")
    logger.info(f"Saved images will be stored in: {SAVED_IMAGES_DIR}")
    
    # Serve static images directly
    @app.route('/images/<path:filename>')
    def serve_image(filename):
        try:
            logger.info(f"Serving image: {filename} from {TEMP_IMAGES_DIR}")
            return send_from_directory(TEMP_IMAGES_DIR, filename)
        except Exception as e:
            logger.exception(f"Error serving image {filename}: {e}")
            return jsonify({'error': str(e)}), 404
    
    # Add endpoint to serve saved images
    @app.route('/saved-images/<path:filename>')
    def serve_saved_image(filename):
        try:
            logger.info(f"Serving saved image: {filename} from {SAVED_IMAGES_DIR}")
            return send_from_directory(SAVED_IMAGES_DIR, filename)
        except Exception as e:
            logger.exception(f"Error serving saved image: {e}")
            return jsonify({'error': str(e)}), 404
    
    app.run(debug=True, port=5000)