// Script to apply CORS configuration to Firebase Storage bucket
// Run with: node upload-cors.js

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Path to your cors.json file
const corsFilePath = path.join(__dirname, 'src', 'cors.json');

console.log('Reading CORS configuration from:', corsFilePath);

// Read CORS configuration
try {
  const corsConfig = fs.readFileSync(corsFilePath, 'utf8');
  console.log('CORS Configuration:');
  console.log(corsConfig);
  
  // Create a temporary batch file with gsutil commands
  const batchFilePath = path.join(__dirname, 'apply-cors.bat');
  const batchFileContent = `
@echo off
echo Installing gsutil if needed...
pip install gsutil
echo.
echo Applying CORS configuration...
gsutil cors set "${corsFilePath}" gs://ai-content-generator-179e8.appspot.com
echo.
echo Done! Press any key to exit.
pause > nul
`;

  fs.writeFileSync(batchFilePath, batchFileContent);
  console.log('Created batch file:', batchFilePath);
  
  console.log('Opening batch file. Please run it to apply CORS configuration.');
  exec(`start "" "${batchFilePath}"`);
  
} catch (error) {
  console.error('Error:', error.message);
} 