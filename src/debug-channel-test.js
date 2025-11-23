// Debug script to test @TheYoungTurks channel resolution

console.log('=== Testing @TheYoungTurks channel resolution ===');

// Test the parser logic directly
function testParserLogic() {
  const testInput = '@TheYoungTurks';
  
  // Manual regex test
  const handlePattern = /^@([a-zA-Z0-9_-]+)$/;
  const handleMatch = testInput.match(handlePattern);

  console.log('Input:', testInput);
  console.log('Handle pattern match:', handleMatch);
  
  if (handleMatch) {
    console.log('✅ Handle detected:', handleMatch[1]);
    console.log('✅ Extracted handle:', handleMatch[1]);
    console.log('✅ Title would be:', handleMatch[1]);
  } else {
    console.log('❌ Handle pattern failed');
  }
  
  // Test the tempChannelId logic
  const tempChannelId = 'handle_' + handleMatch[1];
  console.log('Generated tempChannelId:', tempChannelId);
  
  const searchTerm = tempChannelId.replace(/^(handle_|custom_)/, '');
  console.log('Extracted search term:', searchTerm);
  
  const title = searchTerm.charAt(0) === '@' ? searchTerm.substring(1) : searchTerm;
  console.log('Generated title:', title);
  
  return {
    tempChannelId,
    searchTerm,
    title
  };
}

// Test the resolution result
function testBasicResolution() {
  const { tempChannelId, searchTerm, title } = testParserLogic();
  
  console.log('=== Testing Basic Resolution ===');
  
  const result = {
    id: tempChannelId,
    title,
    thumbnail: `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random&color=fff`
  };
  
  console.log('Basic resolution result:', result);
  return result;
}

// Run tests
testParserLogic();
testBasicResolution();

console.log('=== Debug Complete ===');
