/**
 * Utility to test CORS proxy functionality
 */

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

/**
 * Test if the CORS proxy is working
 */
export async function testCORSProxy(): Promise<boolean> {
  const testUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ'; // YouTube's official channel
  
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    try {
      console.log(`🔍 Testing CORS proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
      const proxiedUrl = `${proxy}${encodeURIComponent(testUrl)}`;
      
      console.log(`📡 Testing with URL: ${proxiedUrl}`);
      
      const response = await fetch(proxiedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      if (text.includes('<?xml') && text.includes('<feed')) {
        console.log(`✅ CORS proxy ${i + 1} is working correctly`);
        return true;
      } else {
        console.error(`❌ CORS proxy ${i + 1} returned invalid content`);
        console.log('Response preview:', text.substring(0, 200));
      }
    } catch (error) {
      console.error(`❌ CORS proxy ${i + 1} test error:`, error);
      
      if (i < CORS_PROXIES.length - 1) {
        // Add delay before trying next proxy
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.error('❌ All CORS proxies failed');
  return false;
}

/**
 * Test different YouTube thumbnail URL formats
 */
export function testThumbnailFormats(channelId: string): string[] {
  const formats = [
    `https://i.ytimg.com/i/${channelId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${channelId}/hqdefault.jpg`,
    `https://i.ytimg.com/channel/${channelId}/hqdefault.jpg`,
    `https://yt3.ggpht.com/a/${channelId}=s176-c-k-c0x00ffffff-no-rj-mo`,
    `https://yt3.ggpht.com/a/${channelId}=s100-c-k-c0x00ffffff-no-rj-mo`
  ];
  
  console.log(`🖼️ Testing thumbnail formats for channel ${channelId}:`);
  formats.forEach((format, index) => {
    console.log(`  ${index + 1}. ${format}`);
  });
  
  return formats;
}

/**
 * Test a specific thumbnail URL
 */
export async function testThumbnailUrl(url: string): Promise<boolean> {
  try {
    console.log(`🖼️ Testing thumbnail URL: ${url}`);
    
    const response = await fetch(url, { method: 'HEAD' });
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      console.log(`✅ Thumbnail accessible: ${contentType}`);
      return true;
    } else {
      console.error(`❌ Thumbnail failed: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Thumbnail test error:`, error);
    return false;
  }
}