# Musicframe - Music Review Website

A collaborative music review website with Google authentication and cloud-based participant tracking.

## Features

- **Google Sign-In**: Secure authentication with Google Identity Services
- **Join Monthly Discussions**: Click to participate in each month's music review
- **Firebase Cloud Storage**: Participants and albums synced across all users in real-time
- **YouTube Music Integration**: Automatically search and add albums with cover art
- **User Restrictions**: Only approved users can sign in (configurable)
- **Monthly Navigation**: Browse through different months with arrow buttons
- **Avatar Display**: See profile pictures of all participants
- **Album Grid**: Display album covers with titles and artists, clickable to YouTube Music
- **One Album Per User**: Each participant can add one album per month
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Session Persistence**: Stays logged in across page refreshes

## Setup Instructions

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure the OAuth consent screen:
   - Choose **External** user type
   - Set to **Testing** mode (not Production)
   - Add test users (emails of people who can access the app)
6. For Application type, select **Web application**
7. Add authorized JavaScript origins:
   - `http://localhost:8000` (for local testing)
   - `http://127.0.0.1:8000`
   - Your GitHub Pages URL: `https://yourusername.github.io`
8. Copy your **Client ID**

### 2. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** and name it (e.g., "musicframe")
3. Disable Google Analytics (optional)
4. Click **Create project**
5. Click the **Web icon** `</>` to add a web app
6. Register app with nickname (e.g., "Musicframe Web")
7. Copy the Firebase config object
8. Go to **Firestore Database** → **Create database**
9. Choose **Start in test mode**
10. Select a region and click **Enable**

### 3. Get YouTube Data API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Use the same project from Step 1
3. Go to **APIs & Services** → **Library**
4. Search for "YouTube Data API v3"
5. Click on it and click **Enable**
6. Go to **APIs & Services** → **Credentials**
7. Click **Create Credentials** → **API Key**
8. Copy your API key
9. (Recommended) Click **Restrict Key** and add:
   - Application restrictions: HTTP referrers
   - Add your website URLs (localhost and GitHub Pages)
   - API restrictions: YouTube Data API v3

### 4. Configure the Website

1. Open `index.html` and replace the placeholder with your actual Google Client ID (line 17):
```html
data-client_id="YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com"
```

2. Open `script.js` and update the YouTube API key (line 12):
```javascript
const YOUTUBE_API_KEY = 'YOUR_ACTUAL_YOUTUBE_API_KEY';
```

3. Update the `ALLOWED_USERS` array (lines 22-26) with authorized emails:
```javascript
const ALLOWED_USERS = [
    'your.email@gmail.com',
    'friend@gmail.com'
];
```

### 4. Set Firebase Security Rules

1. In Firebase Console, go to **Firestore Database** → **Rules**
2. Replace with these rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /participants/{participantId} {
      allow read: if true;
      allow create: if true;
      allow delete: if false;
    }
    match /albums/{albumId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if true;
    }
  }
}
```
**Note:** These rules allow anyone to write to the database. For production, you should implement proper Firebase Authentication and restrict access. For now, we're using client-side validation with the allowed users list.

3. Click **Publish**

### 5. Run Locally

Since this uses Google Sign-In, you need to serve it over HTTP (not file://):

```bash
# Using Python 3
python -m http.server 8000

# OR using Node.js
npx http-server -p 8000
```

Then open: http://localhost:8000

## How It Works

### Adding Albums

1. Click the "**+ Add Your Album**" button
2. Enter the **album title** and **artist name**
3. The app automatically searches YouTube Music using the YouTube Data API
4. It finds the most relevant result and shows you the title for confirmation
5. If correct, click OK to add it with:
   - Album cover art (automatically fetched)
   - Clickable link to YouTube Music
6. Your album appears in the grid with a **green border** to highlight it
7. Each user can only add **one album per month**

### Participants

- Click "**Join Discussion**" to add yourself to the current month
- Your profile picture appears as a circular avatar
- Hover over avatars to see names
- Your own avatar has a **green glow**

### 6. Deploy to GitHub Pages

1. Create a GitHub repository
2. Push your code:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/musicreview.git
git push -u origin main
```
3. Go to repository **Settings** → **Pages**
4. Under **Source**, select **main** branch
5. Click **Save**
6. Your site will be live at: `https://yourusername.github.io/musicreview`
7. **Important**: Add this URL to your Google OAuth authorized origins!

## File Structure

- `index.html` - Main HTML structure with Firebase SDK
- `styles.css` - All styling and responsive design
- `script.js` - Authentication, Firebase integration, and app logic
- `README.md` - This file

## How to Use

1. Sign in with your Google account
2. Click **"+ Join This Month's Discussion"** to participate
3. Your avatar and name will appear in the participants list
4. All users see the same participants in real-time
5. Navigate months with arrow buttons
6. Sign out when done

## Customization

### Add Albums for a Month

Edit the `monthData` object in `script.js`:

```javascript
const monthData = {
    '2025-12': {
        participants: [],  // Loaded from Firebase
        albums: [
            { 
                title: 'Album Name', 
                artist: 'Artist Name', 
                gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
            }
        ]
    }
};
```

### Add New Months

Just add a new key to `monthData` with the format `YYYY-MM`:

```javascript
'2026-02': {
    participants: [],
    albums: [...]
}
```

## Security Notes

✅ **Safe to commit to GitHub:**
- Google Client ID (public by design)
- Firebase config (public API keys)
- All HTML/CSS/JS code

❌ **Never commit:**
- Client Secret (you don't have one for client-side auth)
- Firebase Admin SDK credentials

**Security is enforced by:**
- Google OAuth test user restrictions
- Client-side email allowlist
- Firebase security rules
- Domain restrictions in Google Cloud Console

## Troubleshooting

**Error 401: invalid_client**
- Make sure you replaced `YOUR_GOOGLE_CLIENT_ID` in `index.html` with your actual Client ID

**Error 400: origin_mismatch**
- Add the exact URL you're using to Google Cloud Console authorized origins
- Wait 1-2 minutes for changes to propagate

**"Access denied" message**
- Add your email to the `ALLOWED_USERS` array in `script.js`
- Or add yourself as a test user in Google OAuth consent screen

**Participants not showing**
- Check browser console for Firebase errors
- Verify Firebase security rules are published
- Make sure Firestore database is created and enabled
