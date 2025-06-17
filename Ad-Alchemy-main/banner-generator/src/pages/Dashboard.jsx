import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, 
  // eslint-disable-next-line no-unused-vars
  limit, 
  doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
// Remove or comment out this import since it's not being used
// import MokshaImageGenerator from '../components/MokshaImageGenerator';
import { getUserDesigns, saveGeneratedImage } from '../services/mokshaService';
import { auth } from '../services/firebase';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('create');
  // eslint-disable-next-line no-unused-vars
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [designs, setDesigns] = useState([]);
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [savedDesigns, setSavedDesigns] = useState([]);
  // Either use this variable or add an eslint-disable comment
  // eslint-disable-next-line no-unused-vars
  const [selectedType, setSelectedType] = useState('banner');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [viewImageModal, setViewImageModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [customOptions, setCustomOptions] = useState({
    colors: ['#8B5CF6', '#EC4899', '#FFFFFF'],
    componentColors: {
      background: '#8B5CF6',
      text: '#FFFFFF',
      accent: '#EC4899',
      border: '#3B82F6'
    },
    font: 'sans-serif',
    theme: 'modern',
    text: '',
    size: 'medium',
    layout: 'standard',
    position: { x: 50, y: 50 },
    scale: 1,
    rotation: 0
  });
  // Add new state variables for profile update
  const [displayName, setDisplayName] = useState('');
  const [profileUpdateSuccess, setProfileUpdateSuccess] = useState(false);
  const [profileUpdateError, setProfileUpdateError] = useState('');
  // Add new state variables for password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  // Add state for CORS info modal
  const [showCorsInfo, setShowCorsInfo] = useState(false);
  // Add these new state variables and handlers
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  const { currentUser, logout, updateUserProfile, updateUserPassword } = useAuth();
  const navigate = useNavigate();
  const db = getFirestore();
  // eslint-disable-next-line no-unused-vars
  const storage = getStorage(); // Keeping for future file upload functionality
  
  // Use useCallback to memoize the fetchSavedDesigns function
  // Add this import at the top of the file
// Move this import to the top of the file with other imports
  
  // Then modify the fetchSavedDesigns function to use our new service
  // Add this function to handle successful saves
  // eslint-disable-next-line no-unused-vars
  const handleSaveSuccess = (newDesign) => {
    console.log('New design saved:', newDesign);
    // Add the new design to the savedDesigns array
    setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
  };
  
  // Modify fetchSavedDesigns to include designs from Moksha API
  const fetchSavedDesigns = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      console.log('Fetching saved designs for user:', currentUser.uid);
      
      // Get designs from Firestore
      const designsRef = collection(db, 'designs');
      const q = query(
        designsRef, 
        where('userId', '==', currentUser.uid), 
        orderBy('createdAt', 'desc')
      );
      
      console.log('Executing Firestore query...');
      const querySnapshot = await getDocs(q);
      const firestoreDesigns = [];
      
      console.log(`Found ${querySnapshot.size} designs in Firestore for user ${currentUser.uid}`);
      
      // Process Firestore results
      querySnapshot.forEach((doc) => {
        try {
          // Extract Firestore timestamp and convert to ISO string if it exists
          const data = doc.data();
          
          // Handle different timestamp formats
          let createdAt = null;
          if (data.createdAt?.toDate) {
            createdAt = data.createdAt.toDate().toISOString();
          } else if (data.createdAt) {
            createdAt = data.createdAt;
          } else {
            createdAt = data.savedAt || new Date().toISOString();
          }
          
          // Ensure imageUrl exists
          if (!data.imageUrl) {
            console.warn(`Design ${doc.id} is missing imageUrl, skipping`);
            return;
          }
            
          firestoreDesigns.push({
            id: doc.id,
            ...data,
            createdAt: createdAt
          });
          
          console.log(`Loaded design: ${doc.id} from ${data.source || 'unknown'}`);
        } catch (docError) {
          console.error(`Error processing document ${doc.id}:`, docError);
          // Continue with other documents
        }
      });
      
      // Get designs from Moksha API if we're using it
      let mokshaDesigns = [];
      try {
        console.log('Fetching designs from Moksha service...');
        mokshaDesigns = await getUserDesigns(currentUser.uid);
        console.log(`Retrieved ${mokshaDesigns.length} designs from Moksha`);
        
        if (mokshaDesigns.length > 0) {
          console.log('First Moksha design:', { 
            id: mokshaDesigns[0].id,
            url: mokshaDesigns[0].imageUrl?.substring(0, 30) + '...'
          });
        }
      } catch (err) {
        console.error('Error fetching Moksha designs:', err);
      }
      
      // Combine both sources, removing duplicates (prefer Firestore copies)
      console.log('Combining designs from all sources...');
      
      // Extract all existing image URLs for deduplication
      const firestoreUrls = firestoreDesigns.map(design => design.imageUrl);
      
      // Filter out duplicates from Moksha designs
      const uniqueMokshaDesigns = mokshaDesigns.filter(design => {
        // Skip designs without image URLs
        if (!design.imageUrl) return false;
        
        // Check if this URL already exists in Firestore designs
        return !firestoreUrls.includes(design.imageUrl);
      });
      
      // Combine all designs
      const allDesigns = [...firestoreDesigns, ...uniqueMokshaDesigns];
      console.log(`Total unique designs: ${allDesigns.length}`);
      
      // Sort by date (newest first)
      allDesigns.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      
      // Update state
      console.log('Updating saved designs state with all designs');
      setSavedDesigns(allDesigns);
    } catch (error) {
      console.error('Error fetching designs:', error);
      // Don't leave the user with no designs if there's an error
      // Keep the existing designs in state
    } finally {
      setLoading(false);
    }
  }, [currentUser, db]);

  useEffect(() => {
    if (currentUser) {
      fetchSavedDesigns();
    }
  }, [currentUser, fetchSavedDesigns]); // Now this is safe

  // Load user display name on component mount
  useEffect(() => {
    if (currentUser) {
      // Set display name to the user's display name if available, otherwise use email
      setDisplayName(currentUser.displayName || currentUser.email);
    }
  }, [currentUser]);

  // Add an additional effect to update display name when profile changes are successful
  useEffect(() => {
    if (profileUpdateSuccess && currentUser) {
      // There's a slight delay before Firebase fully processes the update
      // So we manually force the current display value to be shown
      setTimeout(() => {
        try {
          // Force a refresh of the current user data
          auth.currentUser.reload().then(() => {
            // Update the display name in our state to match what Firebase now has
            setDisplayName(auth.currentUser.displayName || currentUser.email);
            console.log('Display name refreshed after update');
          });
        } catch (error) {
          console.error('Error refreshing user data after profile update:', error);
        }
      }, 50); // Ultra-fast 50ms delay for near-instant updates
    }
  }, [profileUpdateSuccess, currentUser]);

  // Add function to update user profile
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      setProfileUpdateError('Display name cannot be empty');
      return;
    }
    
    try {
      setLoading(true);
      setProfileUpdateError('');
      setProfileUpdateSuccess(false);
      
      // Update profile
      await updateUserProfile({
        displayName: displayName.trim()
      });
      
      // Force immediate UI update without full page reload
      if (currentUser) {
        // Get the latest user data
        const user = auth.currentUser;
        
        // Force auth state refresh immediately - no waiting
        Promise.all([
          // Update success state immediately to trigger our useEffect
          setProfileUpdateSuccess(true),
          
          // Pre-emptively update sidebar display
          user.reload()
        ]).then(() => {
          // Refresh the UI with the latest user data
          console.log('User profile updated:', user.displayName);
        }).catch(err => {
          console.error('Error synchronizing user data:', err);
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileUpdateError('Failed to update profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Add function to change password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!newPassword || newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters');
      return;
    }
    
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('New passwords do not match');
      return;
    }
    
    try {
      setLoading(true);
      setPasswordChangeError('');
      setPasswordChangeSuccess(false);
      
      // Update the password directly (reauthentication will be handled by Firebase)
      await updateUserPassword(newPassword);
      
      // Clear password fields
      setNewPassword('');
      setConfirmNewPassword('');
      
      setPasswordChangeSuccess(true);
    } catch (error) {
      console.error('Error changing password:', error);
      // If Firebase requires reauthentication
      if (error.code === 'auth/requires-recent-login') {
        setPasswordChangeError('For security reasons, please log out and log back in before changing your password');
      } else {
        setPasswordChangeError('Failed to change password: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Generate a data URI for a placeholder image
  const generatePlaceholderImage = (text, bgColor = '8B5CF6', textColor = 'FFFFFF') => {
    const encodedText = encodeURIComponent(text);
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23${bgColor}'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='24' fill='%23${textColor}' text-anchor='middle' dominant-baseline='middle'%3E${encodedText}%3C/text%3E%3C/svg%3E`;
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Either use or remove this function
  // If you want to keep it, connect it to a button in the UI
  // If handleGenerateContent is not used, you can remove it or mark it with eslint-disable
  // eslint-disable-next-line no-unused-vars
  const handleGenerateContent = async (e) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      return;
    }
    
    setLoading(true);
    
    // In a real implementation, you would call an AI API here
    // For now, we'll simulate an API call with a timeout
    setTimeout(() => {
      // Mock AI-generated designs with data URI images instead of placeholder.com
      const mockDesigns = Array(6).fill().map((_, i) => ({
        id: `design-${Date.now()}-${i}`,
        type: selectedType,
        prompt,
        imageUrl: generatePlaceholderImage(`${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} ${i+1}`),
        createdAt: new Date().toISOString(),
      }));
      
      setDesigns(mockDesigns);
      setLoading(false);
    }, 2000);
  };

  const handleSaveDesign = async (design) => {
    try {
      if (!design) {
        alert('No design selected to save.');
        return;
      }
      
      if (!currentUser) {
        alert('You must be logged in to save designs. Please log in and try again.');
        return;
      }
      
      console.log('Starting design save process...');
      console.log('Design details:', {
        id: design.id,
        type: design.type,
        hasImageUrl: !!design.imageUrl,
        imagePreview: design.imageUrl ? design.imageUrl.substring(0, 30) + '...' : 'none'
      });
      
      setLoading(true); // Show loading state
      
      // If it's an image from AI generation, save it to Firebase
      if (design.imageUrl) {
        console.log('Design has image URL, proceeding with save');
        
        try {
          // First try to save using saveImageToFirebase for consistent handling
          console.log('Attempting to save via saveImageToFirebase...');
          const savedDesign = await saveImageToFirebase(design.imageUrl, design.prompt || imagePrompt);
          
          if (savedDesign && savedDesign.id) {
            console.log('Design saved successfully via saveImageToFirebase:', savedDesign.id);
            alert('Design saved successfully!');
            
            // Refresh the saved designs list to show the new design
            await fetchSavedDesigns();
            
            return savedDesign.id;
          } else {
            // If saveImageToFirebase returns null but doesn't throw, try the service method
            console.log('saveImageToFirebase did not return a valid result, trying service method');
            
            const result = await saveGeneratedImage({
              userId: currentUser.uid,
              imageUrl: design.imageUrl,
              prompt: design.prompt || imagePrompt || '',
              isSaved: true
            });
            
            if (result && result.id) {
              console.log('Saved via saveGeneratedImage service:', result.id);
              alert('Design saved successfully!');
              
              // Refresh saved designs
              await fetchSavedDesigns();
              
              return result.id;
            } else {
              throw new Error('Neither save method returned a valid result');
            }
          }
        } catch (saveError) {
          console.error('Error during save process:', saveError);
          
          // Final fallback - direct Firestore save
          try {
            console.log('Attempting direct Firestore save as final fallback...');
            
            // Create a unique folder name
            const folderName = `user_${currentUser.uid}_${Date.now()}`;
            
            // Save directly to Firestore with minimal data
            const docRef = await addDoc(collection(db, 'designs'), {
              userId: currentUser.uid,
              type: design.type || 'image',
              prompt: design.prompt || imagePrompt || 'Generated image',
              imageUrl: design.imageUrl,
              folderName: folderName,
              createdAt: serverTimestamp(),
              source: 'fallback_direct',
            });
            
            console.log('Fallback direct save successful, ID:', docRef.id);
            
            // Add to local state manually
            const newDesign = {
              id: docRef.id,
              userId: currentUser.uid,
              type: design.type || 'image',
              prompt: design.prompt || imagePrompt || 'Generated image',
              imageUrl: design.imageUrl,
              folderName: folderName,
              createdAt: new Date().toISOString(),
              source: 'fallback_direct',
            };
            
            setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
            alert('Design saved using fallback method.');
            
            return docRef.id;
          } catch (finalError) {
            console.error('All save methods failed:', finalError);
            throw new Error('All save methods failed: ' + finalError.message);
          }
        }
      } else {
        console.error('Cannot save: No image URL found in the design');
        alert('Cannot save: No image URL found in the design');
        return null;
      }
    } catch (error) {
      console.error('Error saving design:', error);
      alert('Failed to save design. Please try again. ' + error.message);
      return null;
    } finally {
      setLoading(false); // Hide loading state
    }
  };

  // If handleDeleteDesign is not used, you can remove it or mark it with eslint-disable
  // eslint-disable-next-line no-unused-vars
  const handleDeleteDesign = async (id) => {
    if (!id || !currentUser) {
      console.error('Cannot delete: Missing design ID or user not logged in');
      return;
    }
    
    try {
      setLoading(true);
      
      console.log(`Attempting to delete design with ID: ${id}`);
      
      // Find the design in the local state
      const designToDelete = savedDesigns.find(design => design.id === id);
      
      if (!designToDelete) {
        console.error(`Design with ID ${id} not found in local state`);
        return;
      }
      
      // Make sure the user owns this design
      if (designToDelete.userId !== currentUser.uid) {
        console.error('Permission denied: This design belongs to another user');
        alert('You do not have permission to delete this design');
        return;
      }
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'designs', id));
      console.log(`Design with ID ${id} deleted from Firestore`);
      
      // If the image was stored in Firebase Storage, try to delete it too
      if (designToDelete.source === 'firebase' && designToDelete.imageUrl && designToDelete.imageUrl.includes('firebasestorage')) {
        try {
          // Extract the path from the URL
          const url = new URL(designToDelete.imageUrl);
          const pathMatch = url.pathname.match(/o\/(.+?)(?:\?|$)/);
          
          if (pathMatch && pathMatch[1]) {
            const decodedPath = decodeURIComponent(pathMatch[1]);
            const imageRef = ref(storage, decodedPath);
            await deleteObject(imageRef);
            console.log(`Image file deleted from Storage: ${decodedPath}`);
          }
        } catch (storageError) {
          console.error('Error deleting from Storage:', storageError);
          // Continue even if Storage deletion fails
        }
      }
      
      // Update local state
      setSavedDesigns(savedDesigns.filter(design => design.id !== id));
      
      console.log('Design deleted successfully');
    } catch (error) {
      console.error('Error deleting design:', error);
      alert('Failed to delete design. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomize = (design) => {
    // Set the selected design and initialize customization options
    setSelectedDesign(design);
    setCustomOptions({
      colors: design.colors || ['#8B5CF6', '#EC4899', '#FFFFFF'],
      componentColors: {
        background: design.componentColors?.background || '#8B5CF6',
        text: design.componentColors?.text || '#FFFFFF',
        accent: design.componentColors?.accent || '#EC4899',
        border: design.componentColors?.border || '#3B82F6'
      },
      font: design.font || 'sans-serif',
      theme: design.theme || 'modern',
      text: design.text || '',
      size: design.size || 'medium',
      layout: design.layout || 'standard',
      position: design.position || { x: 50, y: 50 },
      scale: design.scale || 1,
      rotation: design.rotation || 0
    });
    setIsCustomizing(true);
  };

  const handleDownload = (design) => {
    // For designs with type and imageUrl
    if (design && design.imageUrl) {
      handleDownloadImage(design.imageUrl, design.type || 'design');
    } else {
      alert('Unable to download. Image URL not found.');
    }
  };

  const handleDownloadImage = (imageUrl, filename) => {
    // Create a function to download images with high quality
    const downloadImage = (blob, fileName) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up to avoid memory leaks
    };

    // Handle data URI images (SVG placeholders)
    if (imageUrl.startsWith('data:')) {
      try {
        // For data URIs, we can create a blob directly
        const byteString = atob(imageUrl.split(',')[1]);
        const mimeType = imageUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        
        // Create high-quality blob with maximum quality
        const blob = new Blob([ab], {type: mimeType, quality: 1.0});
        const extension = mimeType.split('/')[1] || 'png';
        downloadImage(blob, `${filename}-hq.${extension}`);
      } catch (error) {
        console.error('Error downloading data URI image:', error);
        alert('Failed to download image. Please try again.');
      }
    } else {
      // For remote URLs, fetch the image with high quality settings
      fetch(imageUrl, {
        // Add cache control to ensure we get the full quality image
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Accept': 'image/*'
        },
        // Ensure we're getting the full image data
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin'
      })
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.blob();
        })
        .then(blob => {
          // Determine file extension from content type or default to png
          const fileExtension = blob.type.split('/')[1] || 'png';
          
          // For images that might be compressed, try to preserve quality
          if (fileExtension === 'jpeg' || fileExtension === 'jpg') {
            // Create a canvas to redraw the image at full quality
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              // Get high quality image from canvas
              canvas.toBlob((highQualityBlob) => {
                downloadImage(highQualityBlob, `${filename}-hq.${fileExtension}`);
              }, 'image/jpeg', 1.0); // 1.0 is maximum quality
            };
            img.src = URL.createObjectURL(blob);
          } else if (fileExtension === 'png') {
            // For PNG, use the blob directly as it's lossless
            downloadImage(blob, `${filename}-hq.${fileExtension}`);
          } else {
            // For other formats, just use the original blob
            downloadImage(blob, `${filename}-hq.${fileExtension}`);
          }
        })
        .catch(error => {
          console.error('Error downloading image:', error);
          alert('Failed to download image. Please try again.');
        });
    }
  };

  // Add applyCustomization function
  const applyCustomization = async () => {
    try {
      setLoading(true);
      
      // Create a canvas to apply customizations
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      // Set crossOrigin to anonymous to handle CORS
      img.crossOrigin = 'anonymous';
      
      // Wait for image to load with CORS handling
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = (e) => {
          console.error('Error loading image:', e);
          // If CORS fails, try to load without CORS
          img.crossOrigin = '';
          img.src = selectedDesign.imageUrl;
        };
        img.src = selectedDesign.imageUrl;
      });
      
      // Calculate new dimensions while maintaining aspect ratio
      const maxDimension = 1200; // Maximum width or height
      let width = img.width;
      let height = img.height;
      
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      
      // Set canvas size
      canvas.width = width;
      canvas.height = height;
      
      try {
        // Apply filters and transformations
        ctx.filter = `
          ${customOptions.theme === 'modern' ? 'contrast(1.2) saturate(1.2) brightness(1.1)' : 
            customOptions.theme === 'retro' ? 'sepia(0.5) contrast(1.1) brightness(0.9)' : 
            'contrast(1) saturate(1) brightness(1)'}
          ${customOptions.colors[0] === '#8B5CF6' ? 'hue-rotate(240deg)' : 
            customOptions.colors[0] === '#3B82F6' ? 'hue-rotate(180deg)' : 
            customOptions.colors[0] === '#F59E0B' ? 'hue-rotate(30deg)' : 
            customOptions.colors[0] === '#6366F1' ? 'hue-rotate(200deg)' : ''}
        `;
        
        // Draw the base image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Apply color overlay
        ctx.fillStyle = `${customOptions.colors[0]}20`;
        ctx.globalCompositeOperation = 'color';
        ctx.fillRect(0, 0, width, height);
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        
        // Add text if present
        if (customOptions.text) {
          // Scale font size based on image dimensions
          const baseFontSize = Math.min(width, height) * 0.05; // 5% of the smaller dimension
          const fontSize = customOptions.size === 'small' ? baseFontSize * 0.8 : 
                          customOptions.size === 'large' ? baseFontSize * 1.2 : 
                          baseFontSize;
          
          ctx.font = `${fontSize}px ${customOptions.font}`;
          ctx.fillStyle = customOptions.colors[2];
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Calculate text position
          const x = (customOptions.position.x / 100) * width;
          const y = (customOptions.position.y / 100) * height;
          
          // Apply rotation and scale
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((customOptions.rotation * Math.PI) / 180);
          ctx.scale(customOptions.scale, customOptions.scale);
          
          // Draw text
          ctx.fillText(customOptions.text, 0, 0);
          ctx.restore();
        }
        
        // Convert canvas to data URL with compression
        const customizedImageUrl = canvas.toDataURL('image/jpeg', 0.8); // 80% quality
        
        // Check if the data URL is still too large
        if (customizedImageUrl.length > 1000000) { // 1MB limit
          throw new Error('Image too large after compression');
        }
        
        // Create the customized design object
        const customizedDesign = {
          ...selectedDesign,
          imageUrl: customizedImageUrl,
          colors: customOptions.colors,
          font: customOptions.font,
          theme: customOptions.theme,
          text: customOptions.text,
          size: customOptions.size,
          layout: customOptions.layout,
          position: customOptions.position,
          scale: customOptions.scale,
          rotation: customOptions.rotation,
          isCustomized: true,
          customizations: {
            colors: customOptions.colors,
            font: customOptions.font,
            theme: customOptions.theme,
            text: customOptions.text,
            size: customOptions.size,
            layout: customOptions.layout,
            position: customOptions.position,
            scale: customOptions.scale,
            rotation: customOptions.rotation
          }
        };

        // Save the customized design to Firestore
        const designDoc = {
          userId: currentUser.uid,
          type: 'image',
          prompt: customizedDesign.prompt || imagePrompt || 'Customized design',
          imageUrl: customizedImageUrl,
          customizations: customizedDesign.customizations,
          createdAt: serverTimestamp(),
          source: 'customized',
          isCustomized: true
        };

        // Add to Firestore
        const docRef = await addDoc(collection(db, 'designs'), designDoc);
        console.log('Customized design saved with ID:', docRef.id);

        // Add to local state
        const newDesign = {
          ...designDoc,
          id: docRef.id,
          createdAt: new Date().toISOString()
        };
        
        setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
        
        // Close customization mode
        setIsCustomizing(false);
        setSelectedDesign(null);
        
        // Show success message
        alert('Design customized and saved successfully!');
      } catch (canvasError) {
        console.error('Canvas manipulation error:', canvasError);
        
        // Fallback: Save the original image with customization metadata
        const designDoc = {
          userId: currentUser.uid,
          type: 'image',
          prompt: selectedDesign.prompt || imagePrompt || 'Customized design',
          imageUrl: selectedDesign.imageUrl,
          customizations: {
            colors: customOptions.colors,
            font: customOptions.font,
            theme: customOptions.theme,
            text: customOptions.text,
            size: customOptions.size,
            layout: customOptions.layout,
            position: customOptions.position,
            scale: customOptions.scale,
            rotation: customOptions.rotation
          },
          createdAt: serverTimestamp(),
          source: 'customized_fallback',
          isCustomized: true
        };

        // Add to Firestore
        const docRef = await addDoc(collection(db, 'designs'), designDoc);
        console.log('Customized design saved with fallback method, ID:', docRef.id);

        // Add to local state
        const newDesign = {
          ...designDoc,
          id: docRef.id,
          createdAt: new Date().toISOString()
        };
        
        setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
        
        // Close customization mode
        setIsCustomizing(false);
        setSelectedDesign(null);
        
        // Show success message with note about fallback
        alert('Design saved with customization settings. Note: Some visual effects may not be applied due to image restrictions.');
      }
    } catch (error) {
      console.error('Error applying customization:', error);
      alert('Failed to apply customization. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to handle viewing an image in full size
  const handleViewImage = (imageUrl) => {
    setSelectedImageUrl(imageUrl);
    setViewImageModal(true);
  };
  
  // Function to close the image viewer modal
  const closeImageViewer = () => {
    setViewImageModal(false);
    setSelectedImageUrl('');
  };

  // Add a new function to handle generating multiple images
  const handleGenerateMultipleImages = async (prompt) => {
    if (!prompt.trim()) return;
    
    setIsGeneratingImages(true);
    setGeneratedImages([]);
    setImagePrompt(prompt);
    
    try {
      // Generate 6 images in parallel
      const imagePromises = Array(6).fill().map((_, i) => 
        import('../services/mokshaService').then(module => 
          module.generateImageFromPrompt(`${prompt} - variation ${i+1}`)
        )
      );
      
      const results = await Promise.all(imagePromises);
      setGeneratedImages(results.map(result => result.image_url));
    } catch (error) {
      console.error('Error generating multiple images:', error);
    } finally {
      setIsGeneratingImages(false);
    }
  };

  // Function to save image to Firebase
  const saveImageToFirebase = async (imageUrl, promptText) => {
    if (!currentUser) {
      console.error('No user logged in');
      alert('You must be logged in to save images. Please log in and try again.');
      return null;
    }
    
    // Check if user is properly authenticated
    if (!auth.currentUser) {
      console.error('User not properly authenticated in Firebase Auth');
      alert('Authentication error. Please try logging out and logging back in.');
      return null;
    }
    
    // Get fresh ID token to ensure authentication is valid
    try {
      await auth.currentUser.getIdToken(true);
      console.log('Authentication refreshed successfully');
    } catch (authError) {
      console.error('Failed to refresh authentication:', authError);
      alert('Authentication session may have expired. Please log out and log back in.');
      return null;
    }
    
    // Validate imageUrl
    if (!imageUrl) {
      console.error('Invalid image URL: URL is empty or null');
      alert('Cannot save: The image URL is invalid or empty.');
      return null;
    }
    
    console.log('Starting image save process...');
    console.log('Image URL type:', typeof imageUrl, imageUrl ? imageUrl.substring(0, 50) + '...' : 'null');
    
    try {
      setLoading(true);
      
      // Create a unique filename
      const timestamp = new Date().getTime();
      const filename = `generated_image_${timestamp}.jpg`;
      const userId = currentUser.uid;
      console.log('User ID:', userId);
      console.log('Generated filename:', filename);
      
      // For remote URLs, we need a workaround for CORS issues during development
      if (!imageUrl.startsWith('data:')) {
        console.log('Processing external URL...');
        
        try {
          // For demo/development: Save to Firestore without Storage
          // This is a CORS workaround - in production, you would upload to Storage
          const designDoc = {
            userId: userId,
            type: 'image',
            prompt: promptText || 'Generated image',
            imageUrl: imageUrl, // Store the original URL directly
            createdAt: serverTimestamp(),
            source: 'external',
            filename: filename
          };
          
          console.log('Saving to Firestore:', JSON.stringify(designDoc, null, 2));
          
          // Add to Firestore
          const docRef = await addDoc(collection(db, 'designs'), designDoc);
          console.log('Document written with ID:', docRef.id);
          
          // Add the ID to the object for local state
          const newDesign = {
            ...designDoc,
            id: docRef.id,
            createdAt: new Date().toISOString()
          };
          
          // Add to the local state
          setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
          console.log('Image reference saved to Firestore successfully');
          return newDesign;
        } catch (firestoreError) {
          console.error('Firestore save error:', firestoreError);
          throw new Error(`Firestore save failed: ${firestoreError.message}`);
        }
      }
      
      console.log('Processing data URL for Storage upload...');
      
      try {
        // For data URLs (which don't have CORS issues)
        // Reference to the storage location
        const storageRef = ref(storage, `images/${userId}/${filename}`);
        console.log('Storage reference created');
        
        // Upload to Firebase storage
        await uploadString(storageRef, imageUrl, 'data_url');
        console.log('Image uploaded to Storage successfully');
        
        // Get the download URL
        const downloadURL = await getDownloadURL(storageRef);
        console.log('Download URL obtained:', downloadURL.substring(0, 50) + '...');
        
        // Save reference to Firestore
        const designDoc = {
          userId: userId,
          type: 'image',
          prompt: promptText || 'Generated image',
          imageUrl: downloadURL,
          createdAt: serverTimestamp(),
          source: 'firebase',
          filename: filename
        };
        
        console.log('Saving to Firestore...');
        
        // Add to Firestore
        const docRef = await addDoc(collection(db, 'designs'), designDoc);
        console.log('Document written with ID:', docRef.id);
        
        // Add the ID to the object
        const newDesign = {
          ...designDoc,
          id: docRef.id,
          createdAt: new Date().toISOString() // Convert timestamp to ISO for UI
        };
        
        // Add to the local state
        setSavedDesigns(prevDesigns => [newDesign, ...prevDesigns]);
        
        console.log('Image saved to Firebase successfully');
        return newDesign;
      } catch (storageError) {
        console.error('Storage upload error:', storageError);
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }
      
    } catch (error) {
      console.error('Error saving image to Firebase:', error);
      // If there was an error and it's related to Firestore permissions
      if (error.message && error.message.includes('permission-denied')) {
        alert('Permission denied. Please check your Firebase security rules.');
      } else if (error.message && error.message.includes('CORS')) {
        // Show CORS info modal for CORS-related errors
        showCorsInfoModal();
      } else {
        // Generic error message for other cases
        alert(`Failed to save image: ${error.message}`);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Helper function to show CORS info
  const showCorsInfoModal = () => {
    setShowCorsInfo(true);
  };
  
  // Helper function to hide CORS info
  const hideCorsInfoModal = () => {
    setShowCorsInfo(false);
  };

  // Add an effect to check Firebase connectivity
  useEffect(() => {
    // Check if Firebase is properly connected
    const checkFirebaseConnectivity = async () => {
      try {
        // Check Firestore connectivity
        console.log('Checking Firestore connectivity...');
        const testCollection = collection(db, 'connectivity_test');
        const testDocRef = await addDoc(testCollection, {
          timestamp: serverTimestamp(),
          userAgent: navigator.userAgent
        });
        console.log('Firestore connectivity test successful, ID:', testDocRef.id);
        
        // Cleanup test document
        await deleteDoc(testDocRef);
        
        // Check Storage connectivity
        console.log('Checking Storage connectivity...');
        const testStorageRef = ref(storage, `connectivity_test/${Date.now()}.txt`);
        await uploadString(testStorageRef, 'Test connectivity string', 'raw');
        console.log('Storage connectivity test successful');
        
        console.log('All Firebase services are properly connected!');
      } catch (error) {
        console.error('Firebase connectivity test failed:', error);
        // Don't show an alert here as it would be disruptive on page load
        // Just log to console for debugging
      }
    };
    
    if (currentUser) {
      checkFirebaseConnectivity();
    }
  }, [currentUser, db, storage]);

  // Add a function to test Firestore permissions
  const testFirestorePermissions = async () => {
    try {
      console.log('Testing Firestore permissions...');
      
      // Get user ID
      if (!currentUser || !auth.currentUser) {
        console.error('No user logged in for permission test');
        return false;
      }
      
      const userId = currentUser.uid;
      console.log('Current user ID:', userId);
      
      // Try to write a test document to the designs collection
      const testData = {
        userId: userId,
        type: 'permission_test',
        testTimestamp: serverTimestamp(),
        testData: 'This is a permission test'
      };
      
      console.log('Attempting to write test document...');
      const testRef = await addDoc(collection(db, 'designs'), testData);
      console.log('Test document written successfully with ID:', testRef.id);
      
      // Clean up the test document
      await deleteDoc(testRef);
      console.log('Test document cleaned up successfully');
      
      return true;
    } catch (error) {
      console.error('Firestore permission test failed:', error);
      return false;
    }
  };
  
  // Add a button in the settings tab to test permissions
  const handleTestPermissions = async () => {
    setLoading(true);
    try {
      const result = await testFirestorePermissions();
      if (result) {
        alert('Firestore permissions test passed! You have write access.');
      } else {
        alert('Firestore permissions test failed. Check console for details.');
      }
    } catch (error) {
      console.error('Error testing permissions:', error);
      alert('Error testing permissions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Add this new function after fetchSavedDesigns
  const verifyImageUrls = useCallback((designs) => {
    if (!designs || designs.length === 0) return;
    
    console.log('Verifying image URLs for', designs.length, 'designs');
    
    // Track which images load successfully and which fail
    designs.forEach(design => {
      if (!design.imageUrl) {
        console.warn(`Design ${design.id} has no imageUrl`);
        return;
      }
      
      // Log the image URL for debugging
      console.log(`Checking image URL: ${design.id}:`, design.imageUrl.substring(0, 50) + (design.imageUrl.length > 50 ? '...' : ''));
      
      // Create a test image to check if the URL is valid
      const img = new Image();
      img.onload = () => {
        console.log(`✅ Image loaded successfully: ${design.id}`);
      };
      img.onerror = () => {
        console.error(`❌ Image failed to load: ${design.id}`);
      };
      img.src = design.imageUrl;
    });
  }, []);

  // Add this useEffect to verify images whenever savedDesigns changes
  useEffect(() => {
    if (savedDesigns.length > 0) {
      verifyImageUrls(savedDesigns);
    }
  }, [savedDesigns, verifyImageUrls]);

  // Add position control handlers
  const handlePositionChange = (axis, value) => {
    setCustomOptions(prev => ({
      ...prev,
      position: {
        ...prev.position,
        [axis]: Math.max(0, Math.min(100, value))
      }
    }));
  };

  const handleScaleChange = (value) => {
    setCustomOptions(prev => ({
      ...prev,
      scale: Math.max(0.5, Math.min(2, value))
    }));
  };

  const handleRotationChange = (value) => {
    setCustomOptions(prev => ({
      ...prev,
      rotation: value
    }));
  };

  const handleMouseDown = (e) => {
    if (!contentRef.current) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - contentRef.current.offsetLeft,
      y: e.clientY - contentRef.current.offsetTop
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !contentRef.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left - dragStart.x;
    const y = e.clientY - containerRect.top - dragStart.y;

    // Convert to percentages
    const xPercent = (x / containerRect.width) * 100;
    const yPercent = (y / containerRect.height) * 100;

    // Clamp values between 0 and 100
    const clampedX = Math.max(0, Math.min(100, xPercent));
    const clampedY = Math.max(0, Math.min(100, yPercent));

    setCustomOptions(prev => ({
      ...prev,
      position: {
        x: clampedX,
        y: clampedY
      }
    }));
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 bg-gray-800 p-4 flex flex-col`}>
        <div className="flex items-center justify-between mb-10">
          <h1 className={`text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 ${!sidebarOpen && 'hidden'}`}>
            BannerAI
          </h1>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 transition"
          >
            {sidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
        
        <nav className="flex-1">
          <ul className="space-y-2">
            <li>
              <button 
                onClick={() => setActiveTab('create')}
                className={`flex items-center w-full p-3 rounded-md transition ${activeTab === 'create' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                {sidebarOpen && <span>Create New</span>}
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('saved')}
                className={`flex items-center w-full p-3 rounded-md transition ${activeTab === 'saved' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                  <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
                </svg>
                {sidebarOpen && <span>My Designs</span>}
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('templates')}
                className={`flex items-center w-full p-3 rounded-md transition ${activeTab === 'templates' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
                {sidebarOpen && <span>Templates</span>}
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('settings')}
                className={`flex items-center w-full p-3 rounded-md transition ${activeTab === 'settings' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                {sidebarOpen && <span>Settings</span>}
              </button>
            </li>
          </ul>
        </nav>
        
        <div className="mt-auto border-t border-gray-700 pt-4">
          <div className={`flex items-center ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center mr-3">
              {currentUser?.displayName?.charAt(0).toUpperCase() || currentUser?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm truncate">{currentUser?.displayName || currentUser?.email || 'User'}</p>
                <button 
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <header className="bg-gray-800 shadow-md py-4 px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {activeTab === 'create' && 'Create New Design'}
              {activeTab === 'saved' && 'My Saved Designs'}
              {activeTab === 'templates' && 'Templates Gallery'}
              {activeTab === 'settings' && 'Account Settings'}
            </h2>
            <div className="flex items-center space-x-3">
              <div className="bg-gray-700 rounded-md p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="bg-gray-700 rounded-md p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="bg-gray-700 rounded-md p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6">

          {/* Create New Design Tab */}
          {activeTab === 'create' && (
            <div>
              {isCustomizing ? (
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold">Customize Design</h3>
                    <button 
                      onClick={() => setIsCustomizing(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <div className="bg-gray-700 rounded-lg overflow-hidden relative">
                        <div 
                          ref={containerRef}
                          className="relative w-full h-64"
                          style={{ overflow: 'hidden' }}
                        >
                          <img 
                            src={selectedDesign?.imageUrl || 'https://via.placeholder.com/600x400/8B5CF6/FFFFFF?text=Selected+Design'} 
                            alt="Selected design" 
                            className="w-full h-full object-cover cursor-pointer absolute inset-0"
                            onClick={() => handleViewImage(selectedDesign?.imageUrl)}
                            style={{
                              filter: `
                                ${customOptions.theme === 'modern' ? 'contrast(1.2) saturate(1.2) brightness(1.1)' : 
                                  customOptions.theme === 'retro' ? 'sepia(0.5) contrast(1.1) brightness(0.9)' : 
                                  'contrast(1) saturate(1) brightness(1)'}
                                ${customOptions.colors[0] === '#8B5CF6' ? 'hue-rotate(240deg)' : 
                                  customOptions.colors[0] === '#3B82F6' ? 'hue-rotate(180deg)' : 
                                  customOptions.colors[0] === '#F59E0B' ? 'hue-rotate(30deg)' : 
                                  customOptions.colors[0] === '#6366F1' ? 'hue-rotate(200deg)' : ''}
                              `,
                              transform: `
                                ${customOptions.size === 'small' ? 'scale(0.9)' : 
                                  customOptions.size === 'large' ? 'scale(1.1)' : 'scale(1)'}
                              `,
                              objectPosition: customOptions.layout === 'centered' ? 'center' : 
                                            customOptions.layout === 'grid' ? 'top' : 'center',
                              transition: 'all 0.3s ease-in-out'
                            }}
                          />
                          {/* Theme overlay */}
                          <div 
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: `
                                ${customOptions.theme === 'modern' ? 
                                  'linear-gradient(45deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))' : 
                                  customOptions.theme === 'retro' ? 
                                  'linear-gradient(45deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.2))' : 
                                  'none'}
                              `,
                              mixBlendMode: 'overlay'
                            }}
                          />
                          {/* Color overlay */}
                          <div 
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: `${customOptions.colors[0]}20`,
                              mixBlendMode: 'color'
                            }}
                          />
                          {/* Draggable content container */}
                          <div 
                            ref={contentRef}
                            className="absolute"
                            style={{
                              left: `${customOptions.position.x}%`,
                              top: `${customOptions.position.y}%`,
                              transform: `translate(-50%, -50%) scale(${customOptions.scale}) rotate(${customOptions.rotation}deg)`,
                              cursor: isDragging ? 'grabbing' : 'grab',
                              userSelect: 'none',
                              transition: isDragging ? 'none' : 'all 0.3s ease-in-out'
                            }}
                            onMouseDown={handleMouseDown}
                          >
                            {/* Text overlay */}
                            {customOptions.text && (
                              <div 
                                className="p-4"
                                style={{
                                  fontFamily: customOptions.font,
                                  fontWeight: customOptions.textStyle === 'light' ? 300 : 
                                             customOptions.textStyle === 'regular' ? 400 :
                                             customOptions.textStyle === 'medium' ? 500 :
                                             customOptions.textStyle === 'semibold' ? 600 :
                                             customOptions.textStyle === 'bold' ? 700 : 400,
                                  color: customOptions.colors[2],
                                  textAlign: 'center',
                                  fontSize: customOptions.size === 'small' ? '0.875rem' : 
                                           customOptions.size === 'large' ? '1.25rem' : '1rem',
                                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {customOptions.text}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 space-y-3">
                        <button 
                          onClick={() => handleDownload(selectedDesign)}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition flex items-center justify-center gap-2"
                          title="Download Design"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Download Design
                        </button>
                        <button 
                          onClick={() => handleSaveDesign(selectedDesign)}
                          className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-md font-medium transition"
                        >
                          Save to My Designs
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Custom Text
                        </label>
                        <input
                          type="text"
                          value={customOptions.text}
                          onChange={(e) => setCustomOptions({...customOptions, text: e.target.value})}
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                          placeholder="Add text to your design"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Color Scheme
                        </label>
                        <div className="flex space-x-2">
                          {[
                            ['#8B5CF6', '#EC4899', '#FFFFFF'],
                            ['#3B82F6', '#10B981', '#F3F4F6'],
                            ['#F59E0B', '#EF4444', '#111827'],
                            ['#6366F1', '#8B5CF6', '#F3F4F6'],
                          ].map((scheme, i) => (
                            <button
                              key={i}
                              onClick={() => setCustomOptions({...customOptions, colors: scheme})}
                              className={`p-1 rounded-md ${JSON.stringify(customOptions.colors) === JSON.stringify(scheme) ? 'ring-2 ring-white' : ''}`}
                            >
                              <div className="flex">
                                {scheme.map((color, j) => (
                                  <div 
                                    key={j}
                                    className="w-6 h-6 rounded-full -mr-1 border border-gray-700"
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Font Style
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['sans-serif', 'serif', 'monospace'].map((font) => (
                            <button
                              key={font}
                              onClick={() => setCustomOptions({...customOptions, font})}
                              className={`py-2 px-3 rounded-md text-center ${customOptions.font === font ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                              <span style={{ fontFamily: font }}>
                                {font.charAt(0).toUpperCase() + font.slice(1)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Design Theme
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['modern', 'retro', 'minimalist'].map((theme) => (
                            <button
                              key={theme}
                              onClick={() => setCustomOptions({...customOptions, theme})}
                              className={`py-2 px-3 rounded-md ${customOptions.theme === theme ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                              {theme.charAt(0).toUpperCase() + theme.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Size
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['small', 'medium', 'large'].map((size) => (
                            <button
                              key={size}
                              onClick={() => setCustomOptions({...customOptions, size})}
                              className={`py-2 px-3 rounded-md ${customOptions.size === size ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                              {size.charAt(0).toUpperCase() + size.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Layout
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['standard', 'centered', 'grid'].map((layout) => (
                            <button
                              key={layout}
                              onClick={() => setCustomOptions({...customOptions, layout})}
                              className={`py-2 px-3 rounded-md ${customOptions.layout === layout ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                              {layout.charAt(0).toUpperCase() + layout.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Content Position
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Horizontal Position</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={customOptions.position.x}
                              onChange={(e) => handlePositionChange('x', parseInt(e.target.value))}
                              className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>Left</span>
                              <span>Right</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Vertical Position</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={customOptions.position.y}
                              onChange={(e) => handlePositionChange('y', parseInt(e.target.value))}
                              className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>Top</span>
                              <span>Bottom</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Tip: You can also drag the text directly on the image to position it
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Content Scale
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="200"
                          value={customOptions.scale * 100}
                          onChange={(e) => handleScaleChange(parseInt(e.target.value) / 100)}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>50%</span>
                          <span>100%</span>
                          <span>200%</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Content Rotation
                        </label>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          value={customOptions.rotation}
                          onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>-180°</span>
                          <span>0°</span>
                          <span>180°</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={applyCustomization}
                        disabled={loading}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {loading ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Applying Changes...
                          </>
                        ) : "Apply Changes"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
                    <h3 className="text-xl font-semibold mb-4">Generate New Design</h3>
                    
                    {/* Add image generation form */}
                    <div className="mb-6">
                      <label htmlFor="imagePromptInput" className="block text-sm font-medium text-gray-300 mb-2">
                        Describe the images you want to generate
                      </label>
                      <textarea
                        id="imagePromptInput"
                        value={imagePrompt}
                        onChange={(e) => setImagePrompt(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white h-24"
                        placeholder="Describe in detail what you want in your images..."
                        required
                      />
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleGenerateMultipleImages(imagePrompt)}
                        disabled={isGeneratingImages || !imagePrompt.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        {isGeneratingImages ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating Images...
                          </>
                        ) : (
                          <>Generate 6 Images</>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Display generated images */}
                  {generatedImages.length > 0 && (
                    <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
                      <h3 className="text-xl font-semibold mb-4">Generated Images</h3>
                      <p className="text-gray-400 mb-6">Select an image to customize or download</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {generatedImages.map((imageUrl, index) => (
                          <div 
                            key={`generated-image-${index}`} 
                            className="bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-purple-500 transition cursor-pointer"
                            onClick={() => setSelectedDesign({
                              id: `image-${Date.now()}-${index}`,
                              type: 'image',
                              prompt: imagePrompt,
                              imageUrl: imageUrl,
                              createdAt: new Date().toISOString(),
                            })}
                          >
                            <img 
                              src={imageUrl} 
                              alt={`Generated variation ${index + 1}`} // Changed from "Generated image" to just "Generated variation"
                              className="w-full h-48 object-cover cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewImage(imageUrl);
                              }}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = generatePlaceholderImage(`Image ${index + 1} (Error)`);
                              }}
                            />
                            <div className="p-4">
                              <h4 className="font-medium mb-2">Image Variation {index + 1}</h4>
                              <div className="flex justify-between">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCustomize({
                                      id: `image-${Date.now()}-${index}`,
                                      type: 'image',
                                      prompt: imagePrompt,
                                      imageUrl: imageUrl,
                                      createdAt: new Date().toISOString(),
                                    });
                                  }}
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition"
                                >
                                  Customize
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadImage(imageUrl, `image-${index+1}`);
                                  }}
                                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm transition mx-1 flex items-center justify-center gap-1"
                                  title="Download high quality image"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                  Download
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Use the new Firebase storage function directly
                                    saveImageToFirebase(imageUrl, imagePrompt).then(result => {
                                      if (result) {
                                        alert('Image saved to Firebase successfully!');
                                      } else {
                                        // Show CORS info modal if we get an error
                                        showCorsInfoModal();
                                      }
                                    }).catch(error => {
                                      console.error('Firebase save error:', error);
                                      // Show CORS info modal on errors
                                      showCorsInfoModal();
                                    });
                                  }}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition flex items-center justify-center gap-1"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                                  </svg>
                                  Firebase
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Original form - you can keep for other design types */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {designs.map((design) => (
                      <div 
                        key={design.id} 
                        className="bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-purple-500 transition cursor-pointer"
                        onClick={() => setSelectedDesign(design)}
                      >
                        <img 
                          src={design.imageUrl} 
                          alt={`Generated ${design.type}`}
                          className="w-full h-40 object-cover cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewImage(design.imageUrl);
                          }}
                          onError={(e) => {
                            console.error(`Image load error for design ${design.id}:`, design.imageUrl);
                            // Log the design data to debug
                            console.error('Design data:', JSON.stringify({
                              id: design.id,
                              source: design.source,
                              createdAt: design.createdAt,
                              imageUrlStart: design.imageUrl?.substring(0, 50),
                              hasOriginalDataUrl: !!design.originalDataUrl
                            }));
                            
                            e.target.onerror = null;
                            
                            // Try to use originalDataUrl if it exists
                            if (design.originalDataUrl) {
                              console.log(`Using originalDataUrl fallback for design ${design.id}`);
                              e.target.src = design.originalDataUrl;
                            } else {
                              // If no originalDataUrl exists, use placeholder
                              console.log(`No originalDataUrl fallback, using placeholder for design ${design.id}`);
                              
                              // Enhanced placeholder for localhost images
                              if (design.imageUrl && design.imageUrl.includes('localhost:5000')) {
                                e.target.src = generatePlaceholderImage(
                                  'Local server image\nStart Flask server to view', 
                                  'F59E0B'  // Orange background
                                );
                              } else {
                                e.target.src = generatePlaceholderImage('Image not available', 'FF5555');
                              }
                            }
                          }}
                        />
                        <div className="p-4">
                          <h4 className="font-medium mb-2 truncate">{design.type.charAt(0).toUpperCase() + design.type.slice(1)} Design</h4>
                          <p className="text-gray-400 text-sm mb-4 line-clamp-2">{design.prompt}</p>
                          
                          <div className="flex justify-between">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCustomize(design);
                              }}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition"
                            >
                              Customize
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveDesign(design);
                              }}
                              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

           
            
          )}
               
            
         
          

       
          {/* Saved Designs Tab */}
          {activeTab === 'saved' && (
            <div>
              <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Your Saved Designs</h3>
                
                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="mt-2">Loading your designs...</p>
                  </div>
                ) : savedDesigns.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedDesigns.map((design) => (
                      <div 
                        key={design.id} 
                        className="bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-purple-500 transition cursor-pointer"
                        onClick={() => setSelectedDesign(design)}
                      >
                        <div className="h-48 overflow-hidden relative group">
                          <img 
                            src={design.isLocalhostUrl ? generatePlaceholderImage(`Local server image\n${design.imageUrl.split('/').pop()}\nStart Flask server to view`, 'F59E0B') : design.imageUrl} 
                            alt={design.prompt || 'Saved design'} 
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Pass either the fixed URL or the original URL to the viewer
                              const viewUrl = design.isLocalhostUrl ? 
                                generatePlaceholderImage(`Local server image\n${design.imageUrl.split('/').pop()}\nRequires Flask server`, 'F59E0B') : 
                                design.imageUrl;
                              handleViewImage(viewUrl);
                            }}
                            onError={(e) => {
                              console.error(`Image load error for design ${design.id}:`, design.imageUrl);
                              // Log the design data to debug
                              console.error('Design data:', JSON.stringify({
                                id: design.id,
                                source: design.source,
                                createdAt: design.createdAt,
                                imageUrlStart: design.imageUrl?.substring(0, 50),
                                hasOriginalDataUrl: !!design.originalDataUrl,
                                isLocalhostUrl: !!design.isLocalhostUrl
                              }));
                              
                              e.target.onerror = null;
                              
                              // Try to use originalDataUrl if it exists
                              if (design.originalDataUrl) {
                                console.log(`Using originalDataUrl fallback for design ${design.id}`);
                                e.target.src = design.originalDataUrl;
                              } else if (design.isLocalhostUrl || (design.imageUrl && design.imageUrl.includes('localhost:5000'))) {
                                // This is a localhost URL, show special placeholder explaining it needs the server
                                e.target.src = generatePlaceholderImage(
                                  `Local server image\n${design.imageUrl.split('/').pop()}\nStart Flask server to view`, 
                                  'F59E0B'  // Orange background
                                );
                              } else {
                                // If no originalDataUrl exists, use standard placeholder
                                console.log(`No originalDataUrl fallback, using placeholder for design ${design.id}`);
                                e.target.src = generatePlaceholderImage('Image not available', 'FF5555');
                              }
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <div className="flex space-x-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCustomize(design);
                                }}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(design);
                                }}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition flex items-center justify-center gap-1"
                                title="Download high quality image"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Download
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm('Are you sure you want to delete this design?')) {
                                    handleDeleteDesign(design.id);
                                  }
                                }}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <h4 className="font-medium truncate">{design.prompt || 'Untitled Design'}</h4>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-sm text-gray-400">
                              {new Date(design.createdAt).toLocaleDateString()}
                            </p>
                            {design.folderName && (
                              <span className="text-xs bg-gray-600 px-2 py-1 rounded-full">
                                {design.folderName.split('_')[0] === 'user' ? 'Folder: ' + design.folderName.split('_')[2] : design.folderName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-400">You don't have any saved designs yet.</p>
                    <button 
                      onClick={() => setActiveTab('create')}
                      className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500"
                    >
                      Create Your First Design
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div>
              <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold">Template Gallery</h3>
                  <div className="flex items-center space-x-2">
                    <select className="bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option>All Categories</option>
                      <option>Banners</option>
                      <option>Logos</option>
                      <option>Posters</option>
                      <option>Social Media</option>
                    </select>
                    <select className="bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option>Most Popular</option>
                      <option>Newest</option>
                      <option>Trending</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="bg-gray-700 rounded-lg overflow-hidden group cursor-pointer">
                      <div className="relative">
                        <img 
                          src={`https://via.placeholder.com/300x200/8B5CF6/FFFFFF?text=Template+${i}`} 
                          alt={`Template ${i}`}
                          className="w-full h-40 object-cover group-hover:opacity-90 transition"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <button className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md font-medium">
                            Use Template
                          </button>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="font-medium text-sm">Template {i}</h4>
                        <p className="text-xs text-gray-400">Professional {i % 4 === 0 ? 'Banner' : i % 4 === 1 ? 'Logo' : i % 4 === 2 ? 'Poster' : 'Social Media'}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 flex justify-center">
                  <nav className="flex items-center">
                    <button className="px-3 py-1 bg-gray-700 rounded-l-md border-r border-gray-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button className="px-3 py-1 bg-purple-600">1</button>
                    <button className="px-3 py-1 bg-gray-700">2</button>
                    <button className="px-3 py-1 bg-gray-700">3</button>
                    <button className="px-3 py-1 bg-gray-700 rounded-r-md border-l border-gray-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2">
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-xl font-semibold mb-4">Account Settings</h3>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={currentUser?.email || ''}
                          disabled
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white cursor-not-allowed"
                        />
                        <p className="mt-1 text-xs text-gray-400">Your email address is used for login</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Display Name
                        </label>
                        <div className="mb-2 text-xs text-gray-400">
                          Current display name: {currentUser?.displayName || 'Not set'}
                        </div>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Enter a display name"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                        />
                      </div>
                      
                      {profileUpdateSuccess && (
                        <div className="bg-green-900 bg-opacity-50 border border-green-500 rounded-md p-3 text-sm">
                          Profile updated successfully! Changes will apply immediately.
                        </div>
                      )}
                      
                      {profileUpdateError && (
                        <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-md p-3 text-sm">
                          {profileUpdateError}
                        </div>
                      )}
                      
                      <div>
                        <button 
                          onClick={handleUpdateProfile}
                          disabled={loading}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {loading ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Updating...
                            </>
                          ) : "Update Profile"}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold mb-4">Password & Security</h3>
                    
                    <form onSubmit={handleChangePassword} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter a new password"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Confirm your new password"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                        />
                      </div>
                      
                      {passwordChangeSuccess && (
                        <div className="bg-green-900 bg-opacity-50 border border-green-500 rounded-md p-3 text-sm">
                          Password changed successfully!
                        </div>
                      )}
                      
                      {passwordChangeError && (
                        <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-md p-3 text-sm">
                          {passwordChangeError}
                        </div>
                      )}
                      
                      <div>
                        <button 
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {loading ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Changing...
                            </>
                          ) : "Change Password"}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        Note: For security reasons, you may need to log out and log back in before changing your password.
                      </p>
                    </form>
                    
                    {/* Firebase Database Permissions Test */}
                    <div className="mt-8 border-t border-gray-700 pt-6">
                      <h4 className="font-medium text-gray-300 mb-3">Firebase Database Permissions</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        If you're having trouble saving data to Firebase, you can test your permissions here.
                      </p>
                      
                      <button
                        onClick={handleTestPermissions}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? "Testing..." : "Test Firestore Permissions"}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-xl font-semibold mb-4">Subscription</h3>
                    
                    <div className="bg-purple-900 bg-opacity-40 border border-purple-500 rounded-lg p-4 mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Free Plan</h4>
                        <span className="px-2 py-1 bg-purple-600 rounded text-xs font-medium">Active</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-4">You are currently on the Free plan with limited features.</p>
                      <button className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md font-medium hover:opacity-90 transition">
                        Upgrade to Pro
                      </button>
                    </div>
                    
                    <div className="border-t border-gray-700 pt-4">
                      <h4 className="font-medium mb-2">Pro Plan Features</h4>
                      <ul className="text-sm text-gray-300 space-y-2">
                        <li className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Unlimited designs
                        </li>
                        <li className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Advanced customization
                        </li>
                        <li className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Higher quality exports
                        </li>
                        <li className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Priority support
                        </li>
                        <li className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Brand style integration
                        </li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold mb-4">Usage Stats</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-3 border-b border-gray-700">
                        <div>
                          <h5 className="font-medium">Monthly Designs</h5>
                          <p className="text-sm text-gray-400">0 / 15 designs used</p>
                        </div>
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="w-1/3 h-full bg-purple-500"></div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between py-3 border-b border-gray-700">
                        <div>
                          <h5 className="font-medium">Storage Space</h5>
                          <p className="text-sm text-gray-400">0 MB / 100 MB used</p>
                        </div>
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="w-1/4 h-full bg-purple-500"></div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <h5 className="font-medium">API Requests</h5>
                          <p className="text-sm text-gray-400">0 / 100 requests used</p>
                        </div>
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="w-1/5 h-full bg-purple-500"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold mb-4">Notifications</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium">Email Notifications</h5>
                          <p className="text-sm text-gray-400">Receive updates and newsletters</p>
                        </div>
                        <button className="w-12 h-6 bg-purple-600 rounded-full relative">
                          <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></span>
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium">Design Completion</h5>
                          <p className="text-sm text-gray-400">Get notified when designs are ready</p>
                        </div>
                        <button className="w-12 h-6 bg-gray-700 rounded-full relative">
                          <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Image Viewer Modal */}
      {viewImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl w-full max-h-screen overflow-auto">
            <button 
              onClick={closeImageViewer}
              className="absolute top-2 right-2 bg-gray-800 rounded-full p-2 text-white hover:bg-gray-700 transition z-10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <img 
                src={selectedImageUrl} 
                alt="Full size view" 
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              
              <div className="p-4 flex justify-center space-x-4">
                <button 
                  onClick={() => handleDownload({imageUrl: selectedImageUrl}, 'image')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download High Quality
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* CORS Info Modal */}
      {showCorsInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-2xl w-full bg-gray-800 rounded-lg overflow-hidden shadow-xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">Firebase Storage CORS Issue</h3>
                <button 
                  onClick={hideCorsInfoModal}
                  className="text-gray-400 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 text-gray-300">
                <p><strong>What's happening:</strong> You're seeing a CORS (Cross-Origin Resource Sharing) error because your browser prevents uploading images from external sources directly to Firebase Storage during local development.</p>
                
                <h4 className="font-medium text-white mt-2">To fix this in a production environment:</h4>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Install the Firebase CLI: <code className="bg-gray-700 px-1 rounded">npm install -g firebase-tools</code></li>
                  <li>Login to Firebase: <code className="bg-gray-700 px-1 rounded">firebase login</code></li>
                  <li>Create a cors.json file with this content:
                    <pre className="bg-gray-700 p-2 rounded text-sm mt-1">
{`[
  {
    "origin": ["http://localhost:3000", "https://your-app-domain.com"],
    "method": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600
  }
]`}
                    </pre>
                  </li>
                  <li>Upload the CORS configuration:
                    <pre className="bg-gray-700 p-2 rounded text-sm mt-1">
{`gsutil cors set cors.json gs://ai-content-generator-179e8.firebasestorage.app`}
                    </pre>
                  </li>
                </ol>
                
                <p className="mt-2"><strong>For now:</strong> We've implemented a workaround that stores image references in Firestore but doesn't try to upload to Storage.</p>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={hideCorsInfoModal}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customization Modal */}
      {isCustomizing && selectedDesign && (
        <div className="fixed inset-0 bg-gray-900 z-50 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Customize Design</h3>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => handleDownload(selectedDesign)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium transition flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Design
                </button>
                <button 
                  onClick={() => setIsCustomizing(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Preview Panel */}
              <div className="w-2/3 bg-gray-800 p-6 overflow-auto">
                <div className="bg-gray-700 rounded-lg overflow-hidden relative h-full flex items-center justify-center">
                  <div 
                    ref={containerRef}
                    className="relative w-full h-full"
                    style={{ overflow: 'hidden' }}
                  >
                    <img 
                      src={selectedDesign?.imageUrl} 
                      alt="Selected design" 
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => handleViewImage(selectedDesign?.imageUrl)}
                      style={{
                        filter: `
                          ${customOptions.theme === 'modern' ? 'contrast(1.2) saturate(1.2) brightness(1.1)' : 
                            customOptions.theme === 'retro' ? 'sepia(0.5) contrast(1.1) brightness(0.9)' : 
                            'contrast(1) saturate(1) brightness(1)'}
                          ${customOptions.colors[0] === '#8B5CF6' ? 'hue-rotate(240deg)' : 
                            customOptions.colors[0] === '#3B82F6' ? 'hue-rotate(180deg)' : 
                            customOptions.colors[0] === '#F59E0B' ? 'hue-rotate(30deg)' : 
                            customOptions.colors[0] === '#6366F1' ? 'hue-rotate(200deg)' : ''}
                        `,
                        transform: `
                          ${customOptions.size === 'small' ? 'scale(0.9)' : 
                            customOptions.size === 'large' ? 'scale(1.1)' : 'scale(1)'}
                        `,
                        objectPosition: customOptions.layout === 'centered' ? 'center' : 
                                      customOptions.layout === 'grid' ? 'top' : 'center',
                        transition: 'all 0.3s ease-in-out'
                      }}
                    />
                    {/* Theme overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `
                          ${customOptions.theme === 'modern' ? 
                            'linear-gradient(45deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))' : 
                            customOptions.theme === 'retro' ? 
                            'linear-gradient(45deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.2))' : 
                            'none'}
                        `,
                        mixBlendMode: 'overlay'
                      }}
                    />
                    {/* Color overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `${customOptions.colors[0]}20`,
                        mixBlendMode: 'color'
                      }}
                    />
                    {/* Draggable content container */}
                    <div 
                      ref={contentRef}
                      className="absolute"
                      style={{
                        left: `${customOptions.position.x}%`,
                        top: `${customOptions.position.y}%`,
                        transform: `translate(-50%, -50%) scale(${customOptions.scale}) rotate(${customOptions.rotation}deg)`,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        transition: isDragging ? 'none' : 'all 0.3s ease-in-out'
                      }}
                      onMouseDown={handleMouseDown}
                    >
                      {/* Text overlay */}
                      {customOptions.text && (
                        <div 
                          className="p-4"
                          style={{
                            fontFamily: customOptions.font,
                            color: customOptions.componentColors.text,
                            textAlign: 'center',
                            fontSize: customOptions.size === 'small' ? '0.875rem' : 
                                     customOptions.size === 'large' ? '1.25rem' : '1rem',
                            textShadow: `0 2px 4px ${customOptions.componentColors.accent}40`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {customOptions.text}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls Panel */}
              <div className="w-1/3 bg-gray-800 border-l border-gray-700 p-6 overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Custom Text
                    </label>
                    <input
                      type="text"
                      value={customOptions.text}
                      onChange={(e) => setCustomOptions({...customOptions, text: e.target.value})}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                      placeholder="Add text to your design"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Color Scheme
                    </label>
                    <div className="flex space-x-2">
                      {[
                        { name: 'Purple', colors: ['#8B5CF6', '#EC4899', '#FFFFFF'], filter: 'hue-rotate(240deg)' },
                        { name: 'Blue', colors: ['#3B82F6', '#10B981', '#F3F4F6'], filter: 'hue-rotate(180deg)' },
                        { name: 'Warm', colors: ['#F59E0B', '#EF4444', '#111827'], filter: 'hue-rotate(30deg)' },
                        { name: 'Cool', colors: ['#6366F1', '#8B5CF6', '#F3F4F6'], filter: 'hue-rotate(200deg)' }
                      ].map((scheme, i) => (
                        <button
                          key={i}
                          onClick={() => setCustomOptions({...customOptions, colors: scheme.colors})}
                          className={`p-1 rounded-md ${JSON.stringify(customOptions.colors) === JSON.stringify(scheme.colors) ? 'ring-2 ring-white' : ''}`}
                          title={scheme.name}
                        >
                          <div className="flex">
                            {scheme.colors.map((color, j) => (
                              <div 
                                key={j}
                                className="w-6 h-6 rounded-full -mr-1 border border-gray-700"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Font Style
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['sans-serif', 'serif', 'monospace'].map((font) => (
                        <button
                          key={font}
                          onClick={() => setCustomOptions({...customOptions, font})}
                          className={`py-2 px-3 rounded-md text-center ${customOptions.font === font ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          <span style={{ fontFamily: font }}>
                            {font.charAt(0).toUpperCase() + font.slice(1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Design Theme
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['modern', 'retro', 'minimalist'].map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setCustomOptions({...customOptions, theme})}
                          className={`py-2 px-3 rounded-md ${customOptions.theme === theme ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Size
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['small', 'medium', 'large'].map((size) => (
                        <button
                          key={size}
                          onClick={() => setCustomOptions({...customOptions, size})}
                          className={`py-2 px-3 rounded-md ${customOptions.size === size ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {size.charAt(0).toUpperCase() + size.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Layout
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['standard', 'centered', 'grid'].map((layout) => (
                        <button
                          key={layout}
                          onClick={() => setCustomOptions({...customOptions, layout})}
                          className={`py-2 px-3 rounded-md ${customOptions.layout === layout ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {layout.charAt(0).toUpperCase() + layout.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image Style
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { name: 'Modern', style: 'contrast(1.2) saturate(1.2) brightness(1.1)' },
                        { name: 'Retro', style: 'sepia(0.5) contrast(1.1) brightness(0.9)' },
                        { name: 'Natural', style: 'contrast(1) saturate(1) brightness(1)' }
                      ].map((style) => (
                        <button
                          key={style.name}
                          onClick={() => setCustomOptions({...customOptions, theme: style.name.toLowerCase()})}
                          className={`py-2 px-3 rounded-md ${customOptions.theme === style.name.toLowerCase() ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Content Position
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Horizontal Position</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={customOptions.position.x}
                          onChange={(e) => handlePositionChange('x', parseInt(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Left</span>
                          <span>Right</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Vertical Position</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={customOptions.position.y}
                          onChange={(e) => handlePositionChange('y', parseInt(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Top</span>
                          <span>Bottom</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Content Scale
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={customOptions.scale * 100}
                      onChange={(e) => handleScaleChange(parseInt(e.target.value) / 100)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>50%</span>
                      <span>100%</span>
                      <span>200%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Content Rotation
                    </label>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={customOptions.rotation}
                      onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>-180°</span>
                      <span>0°</span>
                      <span>180°</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Component Colors
                    </label>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Background</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={customOptions.componentColors.background}
                            onChange={(e) => setCustomOptions({
                              ...customOptions,
                              componentColors: {
                                ...customOptions.componentColors,
                                background: e.target.value
                              }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-sm text-gray-300">{customOptions.componentColors.background}</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Text</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={customOptions.componentColors.text}
                            onChange={(e) => setCustomOptions({
                              ...customOptions,
                              componentColors: {
                                ...customOptions.componentColors,
                                text: e.target.value
                              }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-sm text-gray-300">{customOptions.componentColors.text}</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Accent</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={customOptions.componentColors.accent}
                            onChange={(e) => setCustomOptions({
                              ...customOptions,
                              componentColors: {
                                ...customOptions.componentColors,
                                accent: e.target.value
                              }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-sm text-gray-300">{customOptions.componentColors.accent}</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Border</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={customOptions.componentColors.border}
                            onChange={(e) => setCustomOptions({
                              ...customOptions,
                              componentColors: {
                                ...customOptions.componentColors,
                                border: e.target.value
                              }
                            })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-sm text-gray-300">{customOptions.componentColors.border}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={applyCustomization}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Applying Changes...
                      </>
                    ) : "Apply Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;