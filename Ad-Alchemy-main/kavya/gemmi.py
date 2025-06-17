#!/usr/bin/env python3
"""
gemmi.py

A script to generate images via Google's Gemini API, saving each
output with a sequential filename (img1.png, img2.png, …), prompting
for a multi-line input at runtime, and forcing every output to a
fixed banner resolution. 
"""

import logging
import os
import re
import sys
from io import BytesIO
from dotenv import load_dotenv
from PIL import Image
from google import genai
from google.genai import types
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ------------------------------------------------------------------------------
# Configuration: target banner size
# ------------------------------------------------------------------------------
BANNER_WIDTH = 1200
BANNER_HEIGHT = 628

# ------------------------------------------------------------------------------
# Logging Configuration
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


class GeminiImageGenerator:
    """
    A class to interact with the Gemini API for image generation.
    """

    def __init__(self, api_key: str, model_name: str = "gemini-2.0-flash-exp-image-generation"):
        try:
            self.client = genai.Client(api_key=api_key)
            self.model_name = model_name
            logger.info("Initialized GeminiImageGenerator with model: %s", model_name)
        except Exception as e:
            logger.exception("Failed to initialize Gemini client: %s", e)
            raise

    def generate_image(self, prompt: str) -> Image.Image:
        """
        Sends the prompt to Gemini and returns a PIL Image.
        """
        try:
            logger.info("Sending image generation request with prompt: %s", prompt)
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(response_modalities=["Text", "Image"])
            )
            logger.info("Received response from Gemini API.")

            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    img = Image.open(BytesIO(part.inline_data.data))
                    logger.info("Image generated successfully (original size: %sx%s).",
                                img.width, img.height)
                    return img

            raise ValueError("No image data found in API response.")

        except Exception as e:
            logger.exception("Error during image generation: %s", e)
            raise

    def save_image(self, image: Image.Image, filename: str):
        """
        Saves the image into the 'images/' directory.
        """
        try:
            images_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
            os.makedirs(images_dir, exist_ok=True)
            path = os.path.join(images_dir, filename)
            image.save(path)
            logger.info("Image saved to %s (%sx%s)", path, image.width, image.height)
            return path
        except Exception as e:
            logger.exception("Failed to save image: %s", e)
            raise


def next_image_filename(directory: str = None, prefix: str = "img", ext: str = ".png") -> str:
    """
    Scans `directory` for existing files like 'img<number>.png' and returns
    the next filename in sequence.
    """
    if directory is None:
        directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
    
    os.makedirs(directory, exist_ok=True)
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+){re.escape(ext)}$")
    max_index = 0

    for fname in os.listdir(directory):
        m = pattern.match(fname)
        if m:
            idx = int(m.group(1))
            max_index = max(max_index, idx)

    next_index = max_index + 1
    return f"{prefix}{next_index}{ext}"


# Create Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load API key
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "GEMINI_API_KEY.env"))
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.error("GEMINI_API_KEY not found in GEMINI_API_KEY.env. Please add it and try again.")

# Initialize the generator
generator = None
if API_KEY:
    generator = GeminiImageGenerator(api_key=API_KEY)

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
        filename = next_image_filename()
        image_path = generator.save_image(image, filename)
        
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

@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    try:
        images_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
        return send_file(os.path.join(images_dir, filename), mimetype='image/png')
    except Exception as e:
        logger.exception("Error serving image: %s", e)
        return jsonify({'error': str(e)}), 404

if __name__ == "__main__":
    if not API_KEY:
        sys.exit(1)
    
    print("Starting Flask server for Gemini image generation...")
    app.run(debug=True, port=5000)