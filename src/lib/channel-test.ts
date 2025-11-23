/**
 * Test file to verify YouTube channel parsing and validation
 */

import { parseChannelInput, isValidChannelInput, getDisplayText } from './youtube-parser';

// Test cases for different YouTube channel formats
const testCases = [
  // Channel IDs
  'UCxxxxxxxxxxxxxxxxxxxxxx',
  'UCuAXFkgsw1L7xaCfnd5JJOw',
  
  // Handles
  '@channelname',
  '@linustechtips',
  '@veritasium',
  
  // Custom URLs
  'channelname',
  'linustechtips',
  'veritasium',
  
  // Full URLs
  'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
  'https://www.youtube.com/@channelname',
  'https://www.youtube.com/c/channelname',
  'https://youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
  'https://youtube.com/@channelname',
  'https://youtube.com/c/channelname',
  'youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
  'youtube.com/@channelname',
  'youtube.com/c/channelname',
  
  // Invalid cases
  '',
  'invalid',
  'https://google.com',
  'not-a-url',
];

/**
 * Run tests and log results
 */
export function runChannelTests() {
  console.log('🧪 Running YouTube channel parser tests...\n');
  
  testCases.forEach((testCase, index) => {
    const parsed = parseChannelInput(testCase);
    const isValid = isValidChannelInput(testCase);
    const displayText = getDisplayText(parsed);
    
    console.log(`Test ${index + 1}: "${testCase}"`);
    console.log(`  Valid: ${isValid}`);
    console.log(`  Type: ${parsed.type}`);
    console.log(`  Value: ${parsed.value}`);
    console.log(`  Display: ${displayText}`);
    console.log(`  ---`);
  });
  
  console.log('✅ Channel parser tests completed!');
}

/**
 * Test specific known channels
 */
export function testKnownChannels() {
  console.log('🎯 Testing known YouTube channels...\n');
  
  const knownChannels = [
    'UCuAXFkgsw1L7xaCfnd5JJOw', // MKBHD
    '@linustechtips',              // Linus Tech Tips
    'https://www.youtube.com/c/veritasium', // Veritasium
  ];
  
  knownChannels.forEach((channel, index) => {
    const parsed = parseChannelInput(channel);
    console.log(`Channel ${index + 1}: "${channel}"`);
    console.log(`  Type: ${parsed.type}`);
    console.log(`  Value: ${parsed.value}`);
    console.log(`  Display: ${getDisplayText(parsed)}`);
    console.log(`  ---`);
  });
  
  console.log('✅ Known channel tests completed!');
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  // In browser environment
  (window as any).runChannelTests = runChannelTests;
  (window as any).testKnownChannels = testKnownChannels;
  console.log('🔧 Test functions available in console:');
  console.log('  runChannelTests() - Test all input formats');
  console.log('  testKnownChannels() - Test known channels');
}
