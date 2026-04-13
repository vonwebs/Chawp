# Chawp - Night Delivery App

A React Native food delivery app for late-night cravings, built with Expo.

## Features

- **Home Page**: Browse featured restaurants, categories, and quick bites
- **Discovery Page**: Explore curated collections, trending searches, and editor picks
- **Orders Page**: Track active orders, view upcoming deliveries, and check order history
- **Profile Page**: Manage account settings, rewards, payment methods, and preferences
- **Shopping Cart**: Add items, adjust quantities, and checkout

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your mobile device (optional)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

If you're on Linux and `expo start` fails while installing React Native DevTools (Chromium `chrome-sandbox` permissions), use:

```bash
pnpm start:headless
```

### Running the App

After starting the server, you can:

- Press `a` to open in Android emulator
- Press `i` to open in iOS simulator
- Scan the QR code with Expo Go app on your phone

## Project Structure

```
Chawp/
├── App.js                  # Main app component with navigation
├── src/
│   ├── pages/
│   │   ├── DiscoveryPage.js
│   │   ├── OrdersPage.js
│   │   └── ProfilePage.js
│   ├── hooks/
│   │   └── useDataFetching.js  # Custom hooks for data fetching
│   ├── services/
│   │   └── api.js              # API service layer (backend-ready)
│   └── theme.js                # Color scheme and typography
├── assets/                 # Images and icons
└── package.json
```

## Backend Integration

The app is structured to easily integrate with a backend API:

1. **API Service** (`src/services/api.js`):
   - Contains all API endpoint functions
   - Currently returns mock data
   - Replace `BASE_URL` and uncomment actual API calls when backend is ready

2. **Data Fetching Hooks** (`src/hooks/useDataFetching.js`):
   - `useDataFetching`: Standard data fetching with loading/error states
   - `usePaginatedData`: For paginated lists (order history, etc.)

3. **Usage Example**:

```javascript
import { useDataFetching } from "./src/hooks/useDataFetching";
import { fetchFeaturedRestaurants } from "./src/services/api";

function MyComponent() {
  const { data, loading, error, refresh } = useDataFetching(
    fetchFeaturedRestaurants,
  );

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error}</Text>;

  return <RestaurantList data={data} />;
}
```

## Environment Variables

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_API_URL=https://your-backend-api.com
```

## Navigation

The app uses a simple bottom tab navigation:

- **Home**: Featured content and quick bites
- **Discover**: Curated collections and trending items
- **Orders**: Active and historical orders
- **Profile**: User settings and account info

## Theme

Customizable dark theme with neon accents:

- Background: `#070B16`
- Primary: `#2E6BFF` (blue)
- Accent: `#FFB547` (gold)
- Text colors optimized for dark mode

Edit `src/theme.js` to customize colors, spacing, and typography.

## Technologies

- **React Native** - Mobile framework
- **Expo** - Development platform
- **expo-linear-gradient** - Gradient backgrounds
- **@expo/vector-icons** - Icon library

## Future Enhancements

- [ ] Connect to backend API
- [ ] Add authentication flow
- [ ] Implement real-time order tracking
- [ ] Add search functionality
- [ ] Integrate payment gateway
- [ ] Push notifications for order updates
- [ ] Add restaurant detail pages
- [ ] Implement favorites system

## License

MIT
