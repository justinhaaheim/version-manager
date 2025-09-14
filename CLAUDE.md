# CLAUDE.md

## Project Overview

Health Logger is a React Native iOS app that replaces an unreliable Google Forms/Sheets health logging system with a native experience. Built for Justin and Kesa to track medications, migraines, chronic pain, and other health conditions through improved medication tracking and awareness.

**Current Phase**: Recreating the recent-meds web app functionality to fix the unreliable CSV endpoint issue while establishing the technical foundation (Google auth, Sheets API) for future features.

## Development Commands

### Core Development
- `bun run start` - Start Expo development server with development variant

### Building
- `bun run build:development` - Development build for device
- `bun run build:preview` - Preview build with release configuration
- `bun run build:production` - Production build with release configuration

### Code Quality (ALWAYS RUN AFTER CHANGES)
- `bun run signal` - Run all checks sequentially (TypeScript, ESLint, Prettier)

- `bun run ts-check` - TypeScript compilation check (no emit)
- `bun run lint` - ESLint with max 0 warnings
- `bun run lint:fix` - Auto-fix ESLint issues
- `bun run prettier` - Format code with Prettier

### Testing
- `bun run test-e2e:all` - Run all e2e screenshot tests


## Architecture

### App Variants
The app supports three build variants controlled by `APP_VARIANT` environment variable:
- `development` - com.jhaa.healthlogger.dev bundle ID
- `preview` - com.jhaa.healthlogger.preview bundle ID  
- `production` - com.jhaa.healthlogger bundle ID

### Core Libraries
- **Expo Router**: File-based navigation with typed routes
- **Zustand**: State management

### State Management
- Zustand store actions should ALWAYS be namespaced under `actions` property
- **ALWAYS use `usePrimaryStoreActions` hook** and destructure needed actions
- ALWAYS use a dedicated hook to access state properties instead of exporting and using the overall zustand state hook (this prevents unnecessary react rerenders by ensuring components only ever subscribe to the properties they explicitly need)

### Navigation Structure
```
app/
├── (tabs)/           # Tab navigator
│   ├── index.tsx     # Home
│   └── settings.tsx  # Settings screen
└── _layout.tsx       # Root layout
```

### File Organization
- `src/components/`: Reusable UI components (using Tamagui)
- `src/services/`: Business logic and external integrations (Google Sheets API, medication parsing)
- `src/helpers/`: Utility functions and platform-specific code
- `src/store/`: Zustand state management
- `src/theme/`: Theme configuration and providers

### Module Organization
- **NO barrel files**: Never use `index.{ts,tsx,js,jsx}` files that only re-export other modules
- **Direct imports only**: Always import directly from the specific module file
- **No directory index pattern**: Don't create a directory with an index file when a single module file would suffice (e.g., use `scenarios.ts` instead of `scenarios/index.ts`)
- **Exception**: Only use index files for Expo Router pages in `src/app/` where required by the framework

## Development Guidelines

### Platform Support
- Primary target: iOS (device + simulator) 
- Apple Silicon Mac support
- Web support [TBD]
- Android support not implemented

### Data Integration
- **Database**: Google Sheets (existing 10+ years of data)
- **Authentication**: Google OAuth
- **APIs**: Google Sheets API v4, Google Forms API (future)
- **Data Format**: Comma-separated medication entries (maintaining compatibility)

### Path Aliases
- `@/*` maps to `src/*` for cleaner imports
- Configured in tsconfig.json and Metro bundler

## Key Features (Planned Phases)

### Phase 0: Recent Meds Recreation (Current)
- Display medications with elapsed time 
- Google OAuth and Sheets API integration
- Sub-second load times (fixing 30+ second delays)
- Pull-to-refresh and auto-refresh

### Future Phases
- Form replacement for medication entry
- "What Can I Take?" smart dosing calculator
- Medication timeline visualization
- iOS Live Activities integration
- Experimental tracking and analytics

## Important General Guidelines

Always follow the important guidelines in @docs/prompts/IMPORTANT_GUIDELINES_INLINED.md 

Be aware that messages from the user may contain speech-to-text (S2T) artifacts. Ask for clarification if something seems ambiguous or inconsistent with other parts of the message/project, especially if it is a consequential to the overall message. S2T Guidelines: @docs/prompts/S2T_GUIDELINES.md