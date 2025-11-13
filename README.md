# 📺 YouTube Subscriptions Manager

A **blazing-fast**, **beautiful** YouTube subscriptions manager built with modern web technologies. Manage and explore your YouTube subscriptions with style!

![React](https://img.shields.io/badge/React-18-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-3-cyan?logo=tailwindcss)

## ✨ Features

### Performance 🚀
- ⚡ **Virtual scrolling** for smooth handling of 1000+ subscriptions
- 🎯 **Code splitting** and lazy loading for optimal bundle size
- 💾 **Smart caching** with React Query (5-min stale time)
- 🗜️ **Gzip compression** for production builds
- 🖼️ **Lazy image loading** with blur placeholders
- 📦 **Optimized chunks** - separate vendor bundles

### UI/UX 🎨
- 🌓 **Dark/Light theme** with smooth transitions
- ✨ **Smooth animations** powered by Framer Motion
- 📱 **Fully responsive** - mobile-first design
- 🎭 **Beautiful gradients** and glass-morphism effects
- 🔍 **Real-time search** and filtering
- 📊 **Grid/List view** toggle
- 🎪 **Hover effects** and micro-interactions

### Features 🎯
- 📺 View all your YouTube subscriptions in one place
- 🔥 Latest videos from your subscriptions
- 🔍 Search and filter channels
- 📱 Click to open channels/videos on YouTube
- 🎨 Channel thumbnails and descriptions
- 📊 Subscriber and video counts (when available)
- ⚡ OAuth 2.0 authentication via Google

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with concurrent features |
| **TypeScript** | Type safety and better DX |
| **Vite** | Lightning-fast build tool and dev server |
| **Tailwind CSS** | Utility-first styling |
| **Framer Motion** | Smooth, performant animations |
| **React Query** | Data fetching, caching, and state management |
| **Zustand** | Lightweight state management |
| **TanStack Virtual** | Virtual scrolling for performance |
| **YouTube Data API v3** | Access to YouTube data |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Google Cloud account
- YouTube Data API v3 credentials

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd youtube-subscriptions
npm install
```

### 2. Set up YouTube API

#### Step-by-step guide:

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**

2. **Create a new project** (or use an existing one)
   - Click "Select a Project" → "New Project"
   - Name it (e.g., "YouTube Subscriptions Manager")
   - Click "Create"

3. **Enable YouTube Data API v3**
   - Go to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click on it and press "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Configure consent screen if prompted:
     - User Type: External
     - App name: YouTube Subscriptions Manager
     - User support email: your email
     - Developer contact: your email
     - Add scope: `../auth/youtube.readonly`
   - Application type: **Web application**
   - Name: YouTube Subscriptions Manager
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for development)
     - Add your production URL if deploying
   - Click "Create"
   - **Copy the Client ID**

5. **Create API Key** (Optional but recommended)
   - Click "Create Credentials" → "API Key"
   - Copy the API key
   - Click "Restrict Key" for security:
     - API restrictions → "YouTube Data API v3"

### 3. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your credentials
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
VITE_YOUTUBE_API_KEY=your_api_key_here
```

### 4. Run the Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173` 🎉

### 5. Build for Production

```bash
npm run build
npm run preview
```

## 📖 Usage

1. **Sign in** with your Google account
2. **Grant permissions** to read your YouTube subscriptions
3. **Explore** your subscriptions in a beautiful interface
4. **Search** for specific channels
5. **Toggle** between grid and list views
6. **Switch** to dark mode for late-night browsing
7. **View** latest videos from your subscriptions

## 🎨 Performance Optimizations

### Virtual Scrolling
- Renders only visible items
- Handles 1000+ subscriptions smoothly
- 5-10 item overscan for smooth scrolling

### Code Splitting
```
react-vendor.js      - React core
query-vendor.js      - React Query
animation-vendor.js  - Framer Motion
ui-vendor.js         - UI libraries
```

### Image Optimization
- Lazy loading with Intersection Observer
- Blur placeholder during load
- Optimized thumbnail sizes from YouTube

### Caching Strategy
- **Subscriptions**: 5-min stale time, 30-min cache
- **Videos**: 2-min stale time, 10-min cache
- LocalStorage persistence for theme/preferences

## 🔧 Configuration

### Tailwind Theme
Customize colors in `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      youtube: {
        red: '#FF0000',
        // ... add your colors
      }
    }
  }
}
```

### Query Cache
Adjust cache times in `src/App.tsx`:
```ts
staleTime: 1000 * 60 * 5, // 5 minutes
gcTime: 1000 * 60 * 30,   // 30 minutes
```

## 🐛 Troubleshooting

### "Failed to authenticate"
- Check if your Client ID is correct in `.env`
- Ensure `http://localhost:5173` is in authorized origins
- Clear browser cache and try again

### "YouTube API error: 403"
- Make sure YouTube Data API v3 is enabled
- Check if you've exceeded API quota (10,000 units/day free)
- Verify API key restrictions aren't too strict

### "No subscriptions found"
- Make sure you've actually subscribed to channels on YouTube
- Try refreshing the page
- Check browser console for errors

## 📊 API Quota Usage

YouTube Data API v3 has a quota limit of **10,000 units/day** (free tier).

| Operation | Cost |
|-----------|------|
| List subscriptions (50 items) | ~1 unit |
| List activities | ~1 unit |
| Channel details | ~1 unit |

**Typical usage**: ~10-50 units per session (well within limits!)

## 🚀 Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Add environment variables in Vercel dashboard.

### Netlify

```bash
npm run build
# Upload dist/ folder to Netlify
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "preview"]
```

## 📝 License

MIT License - feel free to use this project however you like!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⭐ Show Your Support

If you like this project, please give it a ⭐ on GitHub!

---

**Built with ❤️ and ⚡ by Claude Code**
