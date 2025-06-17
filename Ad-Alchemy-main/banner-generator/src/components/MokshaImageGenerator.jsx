import React, { useState } from 'react';
import { generateImageFromPrompt, saveGeneratedImage } from '../services/mokshaService';
import { useAuth } from '../context/AuthContext';

const MokshaImageGenerator = ({ onSaveSuccess }) => {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false); // Add this missing state variable
  const { currentUser } = useAuth();

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;
    
    try {
      setLoading(true);
      setError('');
      
      const result = await generateImageFromPrompt(prompt);
      console.log('Image generation result:', result);
      
      setGeneratedImage(result.image_url);
      setImageData({
        filename: result.filename,
        prompt: result.prompt
      });
    } catch (err) {
      setError(err.message || 'Failed to generate image');
      console.error('Image generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImage = async () => {
    if (!imageData || !imageData.filename) {
      setError('No image to save');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSaveSuccess(false);
      
      // Make sure we have the user ID
      const userId = currentUser?.uid || 'anonymous';
      
      // Call the saveGeneratedImage function from your service
      // Make sure to mark this design as explicitly saved
      const result = await saveGeneratedImage(
        imageData.filename,
        imageData.prompt,
        userId,
        true // Explicitly mark as saved
      );
      
      console.log('Save result:', result);
      
      if (result.success) {
        setSaveSuccess(true);
        
        // If you have a callback to update the parent component, call it
        if (onSaveSuccess && result.design) {
          onSaveSuccess(result.design);
        }
      } else {
        throw new Error(result.error || 'Failed to save image');
      }
    } catch (err) {
      console.error('Error saving image:', err);
      setError(err.message || 'Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  // Fallback image for when the generated image fails to load
  const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%238B5CF6'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='white' text-anchor='middle' dominant-baseline='middle'%3EImage not available%3C/text%3E%3C/svg%3E";

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-white">AI Banner Generator</h2>
      
      <div className="mb-4">
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
          Enter your banner description
        </label>
        <textarea
          id="prompt"
          rows="3"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Describe the banner you want to create..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        ></textarea>
      </div>
      
      <button
        onClick={handleGenerateImage}
        disabled={loading || !prompt.trim()}
        className="w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Generating...' : 'Generate Banner'}
      </button>
      
      {error && (
        <div className="mt-4 p-3 bg-red-900 text-white rounded-md">
          {error}
        </div>
      )}
      
      {saveSuccess && (
        <div className="mt-4 p-3 bg-green-900 text-white rounded-md">
          Banner saved successfully! You can view it in your designs.
        </div>
      )}
      
      {generatedImage && (
        <div className="mt-6">
          <h3 className="text-xl font-semibold mb-3 text-white">Generated Banner</h3>
          <div className="border border-gray-600 rounded-md overflow-hidden">
            <img 
              src={generatedImage} 
              alt="Generated banner" 
              className="w-full h-auto"
              onError={(e) => {
                console.error('Image failed to load');
                e.target.src = fallbackImage;
              }}
            />
          </div>
          
          <div className="mt-4 flex justify-between">
            <button
              onClick={() => {
                setPrompt('');
                setGeneratedImage(null);
                setImageData(null);
              }}
              className="py-2 px-4 bg-gray-700 text-white font-semibold rounded-md hover:bg-gray-600 transition"
            >
              New Banner
            </button>
            
            <button
              onClick={handleSaveImage}
              disabled={saving}
              className="py-2 px-4 bg-green-600 text-white font-semibold rounded-md hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving...' : 'Save Banner'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MokshaImageGenerator;