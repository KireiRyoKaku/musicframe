# YouTube Music Integration Setup Guide

## Quick Start

Your app now uses YouTube Music API to automatically search for albums and fetch cover art!

## What You Need To Do

### Get Your YouTube Data API Key

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Select your project** (the same one you used for OAuth)
3. **Enable the API**:
   - Click **APIs & Services** → **Library**
   - Search for "**YouTube Data API v3**"
   - Click on it and press **Enable**
4. **Create API Key**:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **API Key**
   - Copy the generated key
5. **Secure Your Key** (Recommended):
   - Click **Restrict Key** next to your new API key
   - Under **Application restrictions**, select **HTTP referrers**
   - Add your URLs:
     - `http://localhost:8000/*`
     - `http://127.0.0.1:8000/*`
     - `https://yourusername.github.io/*`
   - Under **API restrictions**, select **Restrict key**
   - Choose **YouTube Data API v3**
   - Click **Save**

### Add the API Key to Your Code

1. Open `script.js`
2. Find line 12:
   ```javascript
   const YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY_HERE';
   ```
3. Replace `YOUR_YOUTUBE_API_KEY_HERE` with your actual API key:
   ```javascript
   const YOUTUBE_API_KEY = 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
   ```
4. Save the file

## How It Works

### Adding an Album (New Flow)

1. User clicks "**+ Add Your Album**"
2. Enters:
   - **Album title** (e.g., "The Dark Side of the Moon")
   - **Artist name** (e.g., "Pink Floyd")
3. App automatically:
   - Searches YouTube with query: `{artist} {title} official audio`
   - Finds the best match
   - Extracts the video thumbnail (album cover)
   - Creates a YouTube Music link
4. Shows confirmation dialog with the found title
5. If user confirms:
   - Album is added to Firebase with cover art
   - Album card displays with the cover image
   - Card is clickable and opens YouTube Music in new tab
   - User's album has a **green border**

### What Changed

**Before:**
- Manual entry of title, artist, and cover URL
- No automatic cover art
- No YouTube links

**After:**
- Only title and artist needed
- Cover art automatically fetched
- Clickable links to YouTube Music
- Better user experience

## API Usage & Limits

- **Free Quota**: 10,000 units/day
- **Cost per search**: ~100 units
- **This means**: ~100 album searches per day for free
- **For small groups**: More than enough!

## Troubleshooting

### "YouTube API key not configured"
- You haven't replaced `YOUR_YOUTUBE_API_KEY_HERE` in script.js
- Solution: Add your actual API key

### "YouTube API request failed"
- Check browser console for specific error
- Common causes:
  - API key not valid
  - API not enabled in Google Cloud
  - Quota exceeded (unlikely for small use)
  - Key restrictions too strict

### "No results found"
- The search query didn't match anything
- Try different wording (artist name variations, album title spelling)

### Album cover doesn't show
- YouTube might not have a good thumbnail
- The video might not be the album
- Try searching with more specific terms

## API Key Security

**Is it safe to commit the API key?**

Yes, with proper restrictions:
- ✅ YouTube Data API keys are meant to be public (unlike OAuth secrets)
- ✅ Use HTTP referrer restrictions to limit where it can be used
- ✅ Set API restrictions to only YouTube Data API v3
- ❌ Never commit OAuth Client Secrets (but Client IDs are fine)

**Best Practices:**
1. Always add HTTP referrer restrictions
2. Only allow YouTube Data API v3
3. Monitor usage in Google Cloud Console
4. Regenerate key if you suspect abuse

## Alternative: Use MusicBrainz or Spotify

If you prefer not to use YouTube API, you could alternatively use:

1. **MusicBrainz API** (Free, no key required)
   - Music metadata database
   - Provides cover art URLs
   - No usage limits

2. **Spotify Web API** (Free with registration)
   - Better music data
   - High-quality cover art
   - Requires OAuth for some features

Let me know if you want to switch to either of these!
