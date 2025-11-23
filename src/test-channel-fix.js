// Quick test to verify channel parsing works correctly
import { parseChannelInput, getDisplayText } from './lib/youtube-parser.js';

// Test the specific case mentioned by user
const testInput = 'channelname';
const parsed = parseChannelInput(testInput);

console.log('Testing channelname input:');
console.log('Input:', testInput);
console.log('Parsed:', parsed);
console.log('Type:', parsed.type);
console.log('Value:', parsed.value);
console.log('Display:', getDisplayText(parsed));

// Test handle case
const handleTest = '@channelname';
const handleParsed = parseChannelInput(handleTest);

console.log('\nTesting @channelname input:');
console.log('Input:', handleTest);
console.log('Parsed:', handleParsed);
console.log('Type:', handleParsed.type);
console.log('Value:', handleParsed.value);
console.log('Display:', getDisplayText(handleParsed));

// Test channel ID case
const idTest = 'UC1yBKRuGpC1tSM73A0ZjYjQ';
const idParsed = parseChannelInput(idTest);

console.log('\nTesting UC ID input:');
console.log('Input:', idTest);
console.log('Parsed:', idParsed);
console.log('Type:', idParsed.type);
console.log('Value:', idParsed.value);
console.log('Display:', getDisplayText(idParsed));