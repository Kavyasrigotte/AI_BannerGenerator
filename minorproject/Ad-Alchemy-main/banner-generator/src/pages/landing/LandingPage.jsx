import React from 'react';
import LandingPagePart1 from './LandingPagePart1';
import LandingPagePart2 from './LandingPagePart2';
import LandingPagePart3 from './LandingPagePart3';

const LandingPage = () => {
  // Using a div with a className to ensure it renders properly
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <LandingPagePart1 />
      <LandingPagePart2 />
      <LandingPagePart3 />
    </div>
  );
};

export default LandingPage;