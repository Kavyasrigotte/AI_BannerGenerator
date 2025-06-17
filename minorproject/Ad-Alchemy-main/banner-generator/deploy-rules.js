// Script to deploy Firestore rules directly through the REST API
// Run with: node deploy-rules.js

const fs = require('fs');
const path = require('path');
const https = require('https');

// Path to your Firestore rules file
const rulesFilePath = path.join(__dirname, 'firestore.rules');

// Read the rules file content
try {
  console.log('Reading Firestore rules from:', rulesFilePath);
  const rulesContent = fs.readFileSync(rulesFilePath, 'utf8');
  
  console.log('Firestore Rules:');
  console.log(rulesContent);
  
  // Create a temporary HTML file with instructions
  const instructionsFilePath = path.join(__dirname, 'update-rules.html');
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Update Firestore Rules</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    pre { background: #f6f8fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .step { margin-bottom: 30px; }
    h1 { color: #333; }
    h2 { color: #0366d6; }
    .important { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Update Firestore Rules</h1>
  <p>Follow these steps to update your Firestore security rules:</p>
  
  <div class="step">
    <h2>Step 1: Go to Firebase Console</h2>
    <p>Visit <a href="https://console.firebase.google.com/" target="_blank">https://console.firebase.google.com/</a> and select your project.</p>
  </div>
  
  <div class="step">
    <h2>Step 2: Navigate to Firestore</h2>
    <p>In the left sidebar, click on "Firestore Database".</p>
  </div>
  
  <div class="step">
    <h2>Step 3: Go to Rules Tab</h2>
    <p>Click on the "Rules" tab at the top of the Firestore page.</p>
  </div>
  
  <div class="step">
    <h2>Step 4: Replace the Rules</h2>
    <p>Delete all existing rules and replace them with the following:</p>
    <pre>${rulesContent}</pre>
  </div>
  
  <div class="step">
    <h2>Step 5: Publish the Rules</h2>
    <p>Click the "Publish" button to apply these rules.</p>
  </div>
  
  <p class="important">Note: These rules allow all read/write operations for development purposes. For production, use more restrictive rules!</p>
</body>
</html>
  `;
  
  fs.writeFileSync(instructionsFilePath, htmlContent);
  console.log('Created instructions file:', instructionsFilePath);
  
  // Open the instructions file in the default browser
  const { exec } = require('child_process');
  exec(`start "" "${instructionsFilePath}"`);
  
  console.log('Follow the instructions in the opened browser window to update your Firestore rules.');
  
} catch (error) {
  console.error('Error:', error.message);
} 