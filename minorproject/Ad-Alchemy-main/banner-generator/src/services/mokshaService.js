// This file contains service functions for interacting with the Moksha API
// and handling persistent storage of generated content

import axios from 'axios';
import { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { auth } from './firebase';

// API endpoint for image generation
// Changed from external API to local Flask server
const API_ENDPOINT = 'http://localhost:5000/generate';

// Generate placeholder images when the API is unavailable
const generatePlaceholderImage = (text) => {
  // Create a random color for the placeholder
  const colors = ['8B5CF6', 'EC4899', '10B981', '3B82F6', 'F59E0B', 'EF4444'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  // Create a data URI for an SVG placeholder
  const encodedText = encodeURIComponent(text);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23${randomColor}'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='white' text-anchor='middle' dominant-baseline='middle'%3E${encodedText}%3C/text%3E%3C/svg%3E`;
};

// Generate an image from a prompt
export const generateImageFromPrompt = async (prompt) => {
  try {
    // Try to use the real API
    const response = await axios.post(API_ENDPOINT, {
      prompt: prompt,
      model: 'stable-diffusion-xl', // Note: The local Flask API might not use this parameter
      num_images: 1
    });
    
    // The local Flask API returns data in a different format than the original API
    // Adjust the response parsing to match your Flask server response format
    return {
      image_url: response.data.image_url || response.data.images?.[0]?.url,
      prompt: prompt,
      filename: response.data.filename || `moksha_${Date.now()}.jpg`
    };
  } catch (error) {
    console.error('Error generating image:', error);
    
    // If we can't reach the API, generate a fallback placeholder image
    console.log('Using placeholder image due to API unavailability');
    return {
      image_url: generatePlaceholderImage(prompt || 'Generated Image'),
      prompt: prompt,
      filename: `placeholder_${Date.now()}.svg`
    };
  }
};

// Add this utility function to check and fix localhost URLs
export const fixLocalImageUrl = (imageUrl) => {
  // Check if this is a localhost URL
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
  
  if (imageUrl.includes('localhost:5000')) {
    // This is a development/local Flask server URL
    // We can't guarantee it's available, so let's return a special data URI
    // that indicates it requires the local server
    
    // Extract the image filename from the URL
    const filename = imageUrl.split('/').pop();
    
    // Create an orange placeholder that indicates this is a local server image
    const colors = ['F59E0B', 'D97706', 'B45309']; // Orange shades
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Encode the warning text
    const text = encodeURIComponent(`Local server image\n${filename}\nStart Flask server to view`);
    
    // Return a data URI with the warning
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23${randomColor}'/%3E%3Ctext x='50%25' y='40%25' font-family='Arial' font-size='24' fill='white' text-anchor='middle' dominant-baseline='middle'%3E${text}%3C/text%3E%3C/svg%3E`;
  }
  
  return imageUrl;
};

// Get user designs from Moksha API and Firebase
export const getUserDesigns = async (userId) => {
  // In a real implementation, this would fetch from Moksha API and combine with Firebase data
  try {
    if (!userId) {
      console.error('getUserDesigns called with no userId');
      return [];
    }
    
    console.log(`Fetching designs for user: ${userId}`);
    
    const db = getFirestore();
    const designsRef = collection(db, 'designs');
    const q = query(designsRef, where('userId', '==', userId));
    
    console.log('Executing Firestore query...');
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.size} designs in Firestore`);
    
    const designs = [];
    let processedCount = 0;
    let errorCount = 0;
    let localhostCount = 0;
    
    querySnapshot.forEach((doc) => {
      try {
        processedCount++;
        const data = doc.data();
        
        // Skip designs with no imageUrl
        if (!data.imageUrl) {
          console.warn(`Design ${doc.id} has no imageUrl, skipping`);
          return;
        }
        
        // Convert Firestore Timestamp to ISO string if it exists
        const createdAt = data.createdAt?.toDate?.() 
          ? data.createdAt.toDate().toISOString()
          : (data.createdAt || data.savedAt || new Date().toISOString());
        
        // Check for localhost URLs and fix them
        let imageUrl = data.imageUrl;
        if (imageUrl.includes('localhost:5000')) {
          localhostCount++;
          console.log(`Design ${doc.id} has a localhost URL: ${imageUrl.substring(0, 50)}...`);
          // Note: We don't automatically replace the URL here to keep the original
          // in case the server is running, but we will handle it in the component
        }
        
        // Prepare design object
        const design = {
          id: doc.id,
          ...data,
          createdAt: createdAt,
          // Add a flag to indicate this is a localhost URL
          isLocalhostUrl: imageUrl.includes('localhost:5000')
        };
        
        // Validate Firebase Storage URLs
        if (data.imageUrl && data.imageUrl.includes('firebasestorage')) {
          console.log(`Design ${doc.id} has a Firebase Storage URL`);
          
          // If we have a fallback originalDataUrl, make sure it's included
          if (data.originalDataUrl) {
            console.log(`Design ${doc.id} has an originalDataUrl backup`);
          }
        }
        
        designs.push(design);
      } catch (docError) {
        errorCount++;
        console.error(`Error processing document ${doc.id}:`, docError);
      }
    });
    
    console.log(`Successfully processed ${processedCount - errorCount}/${processedCount} designs`);
    if (localhostCount > 0) {
      console.log(`Found ${localhostCount} designs with localhost URLs. These require the Flask server to be running.`);
    }
    
    return designs;
  } catch (error) {
    console.error('Error fetching user designs:', error);
    return [];
  }
};

// Save a generated image to persistent storage
export const saveGeneratedImage = async (imageData) => {
  try {
    if (!auth.currentUser) {
      console.error('Authentication error: No user is logged in');
      throw new Error('User not authenticated');
    }
    
    const userId = auth.currentUser.uid;
    console.log(`Saving image for user: ${userId}`);
    
    const db = getFirestore();
    const storage = getStorage();
    
    // Create a unique filename based on timestamp
    const timestamp = new Date().getTime();
    const filename = imageData.filename || `image_${timestamp}.jpg`;
    
    let imageUrl = imageData.imageUrl;
    if (!imageUrl) {
      console.error('Image URL is missing');
      throw new Error('Image URL is required');
    }
    
    console.log(`Processing image: ${imageUrl.substring(0, 30)}...`);
    console.log(`Image type: ${imageUrl.startsWith('data:') ? 'Data URL' : 'Remote URL'}`);
    
    // Track if we need to use a data URL directly in storage
    let storeDataUrlDirectly = false;
    
    // For data URLs, always upload to Firebase Storage
    if (imageUrl.startsWith('data:')) {
      try {
        console.log('Uploading data URL to Firebase Storage');
        
        // Create a reference to the storage location
        const storageRef = ref(storage, `images/${userId}/${filename}`);
        
        // Upload to Firebase storage
        await uploadString(storageRef, imageUrl, 'data_url');
        console.log('Image uploaded to Storage successfully');
        
        // Get the download URL with long expiration
        const downloadURL = await getDownloadURL(storageRef);
        console.log(`Storage URL: ${downloadURL.substring(0, 30)}...`);
        imageUrl = downloadURL;
        
        // Store original data URL as fallback
        storeDataUrlDirectly = true;
      } catch (storageError) {
        console.error('Error uploading to Storage:', storageError);
        // Continue with the original data URL if storage fails
        console.log('Falling back to original data URL');
        storeDataUrlDirectly = true;
      }
    } else {
      // For remote URLs, log but don't attempt storage upload due to CORS
      console.log('Using remote URL directly (CORS limitation)');
    }
    
    // Save metadata to Firestore for permanent persistence
    const designData = {
      userId: userId,
      prompt: imageData.prompt || '',
      imageUrl: imageUrl,
      createdAt: serverTimestamp(),
      source: imageUrl.startsWith('data:') ? 'data_url' : 
              (imageUrl.includes('firebasestorage') ? 'firebase' : 'external'),
      filename: filename,
      folderName: imageData.folderName || `user_${userId}_${timestamp}`,
      isSaved: true,
      type: 'image',
      // Add additional metadata to help with debugging
      savedAt: new Date().toISOString(),
      // Store original data URL for data URLs as backup if we got a Storage URL
      originalDataUrl: storeDataUrlDirectly && imageData.imageUrl.startsWith('data:') ? 
                      imageData.imageUrl : null,
      // Track client information to help with debugging
      clientInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      }
    };
    
    console.log('Saving to Firestore with data:', JSON.stringify({
      ...designData,
      imageUrl: `${designData.imageUrl.substring(0, 30)}...`,
      originalDataUrl: designData.originalDataUrl ? 'Data URL (truncated)' : null
    }));
    
    // Add to Firestore collection with retry for resilience
    let docRef = null;
    try {
      docRef = await addDoc(collection(db, 'designs'), designData);
      console.log(`Design saved to Firestore with ID: ${docRef.id}`);
    } catch (firestoreError) {
      console.error('First Firestore save attempt failed:', firestoreError);
      
      // Retry once with minimal data
      try {
        console.log('Retrying with minimal data...');
        const minimalData = {
          userId: userId,
          imageUrl: imageUrl,
          createdAt: serverTimestamp(),
          type: 'image',
          // Still include originalDataUrl as fallback if available
          originalDataUrl: designData.originalDataUrl
        };
        
        docRef = await addDoc(collection(db, 'designs'), minimalData);
        console.log(`Design saved with minimal data, ID: ${docRef.id}`);
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
        throw new Error(`Could not save to Firestore: ${retryError.message}`);
      }
    }
    
    if (!docRef) {
      throw new Error('Failed to get document reference from Firestore');
    }
    
    // Verify save was successful by reading back the document
    try {
      const savedDocRef = doc(db, 'designs', docRef.id);
      const savedDocSnap = await getDoc(savedDocRef);
      if (!savedDocSnap.exists()) {
        console.error('Document was not found after save');
      } else {
        console.log('Verified document exists in Firestore');
      }
    } catch (verifyError) {
      console.warn('Could not verify document save:', verifyError);
      // Continue anyway since we have the docRef
    }
    
    // Return the saved design with all metadata for client use
    return {
      id: docRef.id,
      ...designData,
      createdAt: new Date().toISOString() // Convert for UI display
    };
  } catch (error) {
    console.error('Error in saveGeneratedImage:', error);
    throw new Error(`Failed to save image permanently: ${error.message}`);
  }
};

// Create a named service object to fix the ESLint warning
const mokshaService = {
  generateImageFromPrompt,
  getUserDesigns,
  saveGeneratedImage
};

export default mokshaService;