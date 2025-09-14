# Health Logger App - Project Roadmap

## Executive Summary

A React Native iOS app that replaces the current Google Forms/Sheets health logging system with a native experience, featuring medication tracking, smart dosing recommendations, and Live Activities integration. Built specifically for Justin and Kesa to better manage chronic pain, migraines, ADHD, and other health conditions through improved medication tracking and awareness.

**Starting Point:** Recreate the existing recent-meds web app as a React Native app to immediately fix the unreliable CSV endpoint issue while establishing the technical foundation (Google auth, Sheets API) for all future features.

## Project Vision & Success Metrics

The app transforms health tracking from passive data collection into active health improvement through systematic experimentation and real-time decision support.

### Primary Success Metrics

1. **Kesa's Improved Pain Management**
   - More consistent logging of all pain medications (not just Percocet)
   - Reduced cognitive load when deciding what medication to take
   - Better pain control by staying ahead of pain cycles
   - 10-15% improvement in overall pain management

2. **Justin's Daily Navigation & Time Awareness**
   - Clear visibility of stimulant medication timing throughout the day
   - Better Xywav timing awareness for consistent bedtime
   - Improved migraine management through proactive dosing reminders
   - Reduced ADHD-related time perception issues

3. **System Reliability**
   - Eliminate 30+ second load times from current Vercel app
   - Fix dangerous bug where recent entries don't appear for 5-10 minutes
   - Instant access to "what did I just take?" information

4. **Enhanced Health Insights Through Systematic Tracking**
   - Enable controlled experiments with treatments (supplements, dosage changes)
   - Distinguish real headache patterns from observation bias
   - Measure medication effectiveness with post-dose check-ins
   - Track functional impact (e.g., "did I skip exercise?")
   - Finally answer: "What actually helps after 15 years of trying?"

## Current System Overview

### 1. Google Form Structure

The current Google Form includes comprehensive tracking for:

**Symptom Tracking:**

- Headache intensity (0-10 pain scale with descriptive symptoms)
- Acid reflux, daytime fatigue, nausea levels
- Depression and anxiety experiences
- "Noticings" free text field

**Medication Categories (100+ options):**

- **Pain Relief:** Acetaminophen (various doses), Aleve, Vicodin, Percocet, Cannabis
- **Migraine Relief:** Rizatriptan, Emgality, Sumatriptan, Cambia, devices
- **ADHD:** Dextroamphetamine (2.5-20mg), Vyvanse (10-60mg), Adderall
- **Sleep:** Xywav doses (3.75-5g normal, 0.5-5g additional)
- **Other:** Anti-nausea, anti-anxiety, gastro, entheogens, misc

**Special Features:**

- Backdate functionality for delayed logging
- Medicine staging checkbox for ADHD memory support
- Medicine change tracking field

### 2. Google Sheets Data Structure

**Core Data Columns (User Input):**

- Timestamp
- Symptom severity ratings
- Medicine Taken (comma-separated list, e.g., "Aleve 440mg, Acetaminophen 8hr 1300mg")
- Noticings, weight, blood pressure, etc.

**Computed Columns (After "unique code" markers):**

- Aleve Doses (regex parsing of medication list)
- Acetaminophen amounts
- Other medication-specific calculations

**Current Volume:** ~7,000 entries over 10 years

### 3. Recent Meds Vercel App

**Current Features:**

- Shows medications taken with time elapsed (e.g., "5h 20m ago")
- Groups by time for easy scanning
- Color-coded medication categories
- Version display and cache clearing

**Current Issues:**

- Uses slow Google Sheets published CSV endpoint
- 30+ second load times
- Critical bug: Missing entries from last 5-10 minutes
- Frequent failures to load

**MVP Requirements for React Native Recreation:**

- Google OAuth integration for Sheets API access
- Configuration screen to paste/save spreadsheet URL
- Main view showing medications with elapsed time
- Auto-refresh elapsed times every minute
- Pull-to-refresh for manual updates
- Color coding by medication category
- Reliable sub-second data fetching
- Proper handling of timezone (America/Los_Angeles)

## Technical Architecture

### Frontend

- **Framework**: React Native with Expo
- **UI Components**: Gluestack UI
- **State Management**: React Context + AsyncStorage
- **Platform**: iOS primary, Apple Silicon Mac support
- **Notifications**: iOS local notifications (no backend needed)

### Backend

- **Database**: Google Sheets (existing, maintained)
- **Authentication**: Google OAuth
- **APIs**: Google Sheets API v4, Google Forms API

### Data Model Decisions

**Short-term (MVP):** Keep comma-separated medication format

- Avoids migration complexity
- Uses existing regex parsing patterns
- Maintains continuity with 10 years of data

**Long-term:** Consider one medication per row

- Simpler aggregation and queries
- Better for advanced analytics
- Migration can be automated when ready

## Feature Development Phases

### Phase 0: Recent Meds Recreation (Week 1) - START HERE

#### Recreate existing recent-meds functionality as React Native app

**Core Features:**

- Google OAuth authentication flow
- Spreadsheet URL configuration (paste & save)
- Direct Google Sheets API integration (no CSV endpoint)
- Display medications with elapsed time
- Color-coded categories
- Pull-to-refresh
- Sub-second load times

**Key Improvements over current version:**

- Fix 5-10 minute delay bug
- Eliminate 30+ second load times
- Native iOS performance
- Reliable data fetching

**Technical Foundation:**

- Establish Google auth pattern
- Build Sheets API service layer
- Create medication parsing utilities
- Set up data caching strategy

### Phase 1: Core Functionality (Weeks 2-3)

#### 1.1 Form Replacement

- Fetch form structure from Google Forms API
- Generate native iOS form dynamically
- Include all field types from current form
- Implement backdate functionality
- Add medication staging checkbox

#### 1.2 Enhanced Recent Entries

- Integrate form submission
- Instant updates after logging
- Expand time range options
- Add search/filter capabilities

### Phase 2: Smart Features (Weeks 4-5)

#### 2.1 "What Can I Take?" Calculator

**Top Section of Dashboard**

- Accordion UI: "What can I take for headaches? ..."
- List available medications with status:
  - ✅ "Aleve - Available now"
  - ⏱️ "Tylenol - Available in 2h 15m"
  - ❌ "Percocet - Wait 4h 30m"

**Algorithm Requirements:**

- Minimum intervals between doses
- Daily maximum limits
- 24-hour rolling windows
- User-specific configurations

#### 2.2 Quick Entry Presets

- "Nightly meds" one-tap button
- Common combinations
- Personalized per user
- Reduces form friction

### Phase 3: Visualizations (Weeks 6-7)

#### 3.1 Medication Timeline

- Horizontal timeline visualization
- X-axis: Time (24-48 hour view)
- Y-axis: Different medications
- Visual bars showing coverage periods:
  - Tylenol: 8-hour bars
  - Aleve: 12-hour bars
  - Color-coded by category

#### 3.2 Smart Notifications

- "Don't get behind the pain" reminders
- Set when logging medication
- Local iOS notifications
- Configurable lead time (e.g., 10 min before)

### Phase 4: Live Activities & Dashboard (Weeks 8-9)

#### 4.1 iOS Live Activities

- Dynamic Island integration
- Show most recent medications
- Real-time elapsed timers
- Replace manual stopwatch usage
- Configurable medication priorities

#### 4.2 Health Metrics Dashboard

**Rolling Metrics:**

- 7-day Aleve usage vs. target
- Recent headache trends
- Week-over-week comparisons

**Comparative Analytics:**

- "How were my headaches this week vs last week?"
- "How does this compare to a year ago?"
- Visual charts and trends

### Phase 5: Experimental Tracking & Analytics (Weeks 10-11)

#### 5.1 Scheduled Check-ins

- **Regular Headache Assessments**
  - 2-3 daily check-ins at consistent times
  - Quick form: "Do you have a headache right now?"
  - Log even when no headache present
  - Reduces observation bias in data

#### 5.2 Medication Effectiveness Tracking

- **Post-Dose Follow-ups**
  - Checkbox: "Check effectiveness in 60 minutes"
  - Automated notification with quick form
  - Track: Did it help? How much? Side effects?
  - Build database of what actually works

#### 5.3 Functional Impact Metrics

- **Disability/Impact Scoring**
  - "Is this affecting daily activities?"
  - "Did you skip exercise/walk?"
  - "Can you work normally?"
  - Quantify real-world impact beyond pain scores

#### 5.4 Treatment Experiment Support

- **A/B Testing Framework**
  - Baseline period tracking
  - Intervention tracking (new supplement, dose change)
  - Statistical comparison tools
  - Clear visualization of changes

**Example Experiments:**

- Amitriptyline dosage optimization
- CoQ10 supplementation trial
- Magnesium glycinate vs L-threonate
- Rizatriptan effectiveness assessment

### Future Enhancements

- Historical data analysis tools
- Medication change tracking
- Advanced Google Apps Script integration
- Doctor visit report generation
- Cross-device sync considerations
- Machine learning for pattern detection
- Integration with wearables for objective data
- Export tools for sharing with healthcare providers

## User Configuration Schema

```javascript
{
  userId: "justin", // or "kesa"
  spreadsheetId: "1abc...",
  formId: "1def...",

  medications: {
    "acetaminophen_8hr": {
      displayName: "Tylenol 8-hour",
      activeIngredient: "acetaminophen",
      doses: [650, 1300, 1950],
      defaultDose: 1300,
      maxDaily: 4000,
      minInterval: 8,
      duration: 8,
      unit: "mg",
      category: "pain",
      showInLiveActivity: true,
      liveActivityPriority: 2
    },
    "aleve": {
      displayName: "Aleve",
      activeIngredient: "naproxen",
      doses: [220, 440, 660],
      defaultDose: 440,
      maxDaily: 1320,
      minInterval: 12,
      duration: 12,
      unit: "mg",
      category: "pain",
      showInLiveActivity: true,
      liveActivityPriority: 3
    },
    "dextroamphetamine": {
      displayName: "Dextroamphetamine",
      doses: [5, 10, 15, 20],
      defaultDose: 5,
      minInterval: 4,
      duration: 4,
      category: "adhd",
      showInLiveActivity: true,
      liveActivityPriority: 1
    },
    "xywav": {
      displayName: "Xywav",
      doses: [3.75, 4, 4.25, 4.5, 4.75, 5],
      additionalDoses: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, 4.5],
      category: "sleep",
      showInLiveActivity: true,
      liveActivityPriority: 1,
      specialRules: {
        requiresBedtimeReminder: true,
        effectDuration: 2.5
      }
    }
  },

  quickPresets: [
    {
      name: "Morning Routine",
      entries: [
        { medication: "vyvanse", dose: 50 },
        { medication: "dextroamphetamine", dose: 5 }
      ]
    },
    {
      name: "Nightly Xywav",
      entries: [
        { medication: "xywav", dose: 4.25, type: "normal" }
      ]
    }
  ],

  dashboardMetrics: {
    showAleveWeekly: true,
    aleveWeeklyTarget: 2200,
    showHeadacheTrends: true,
    trendPeriodDays: 14
  },

  experimentalTracking: {
    scheduledCheckIns: {
      enabled: false,
      times: ["08:00", "14:00", "20:00"],
      questions: ["headache_presence", "pain_level", "functional_impact"]
    },

    medicationEffectiveness: {
      enabled: true,
      defaultCheckInDelay: 60, // minutes
      medications: {
        "rizatriptan": { checkInDelay: 90 },
        "acetaminophen_8hr": { checkInDelay: 60 },
        "cambia": { checkInDelay: 45 }
      }
    },

    currentExperiments: [
      {
        name: "Amitriptyline Optimization",
        type: "dose_change",
        baselineDays: 14,
        interventionDays: 30,
        metrics: ["headache_frequency", "headache_severity", "functional_impact"]
      }
    ]
  }
}
```

## Engineering Implementation Plan

### Week 1: Recent Meds MVP

- [ ] Set up Expo project with TypeScript
- [ ] Port recent-meds UI to React Native
- [ ] Implement Google OAuth for mobile
- [ ] Add spreadsheet URL configuration screen
- [ ] Build Google Sheets API integration
- [ ] Parse medication data with existing regex patterns
- [ ] Display elapsed times with auto-refresh
- [ ] Implement pull-to-refresh
- [ ] Test on physical iOS device
- [ ] Deploy to TestFlight for immediate use

### Week 2: Foundation & Form Prep

- [ ] Refactor auth flow for reusability
- [ ] Create robust Sheets API service layer
- [ ] Add error handling and offline support
- [ ] Begin Google Forms API exploration
- [ ] Design form component architecture

### Week 3: Form Generation & Submission

- [ ] Google Forms API integration
- [ ] Dynamic form component builder
- [ ] Form submission to Sheets
- [ ] Offline queue for submissions
- [ ] Integration with recent entries view

### Week 4: Medication Intelligence

- [ ] Medication configuration system
- [ ] "What can I take?" algorithm
- [ ] Dosing interval calculations
- [ ] Daily limit tracking
- [ ] Accordion UI implementation

### Week 5: User Experience

- [ ] Quick preset system
- [ ] Form validation
- [ ] Error handling
- [ ] Loading states
- [ ] Pull-to-refresh

### Week 6: Timeline Visualization

- [ ] Timeline component design
- [ ] Medication duration mapping
- [ ] Gesture controls
- [ ] Time range selection
- [ ] Visual overlap detection

### Week 7: Notifications

- [ ] iOS notification permissions
- [ ] Scheduling logic
- [ ] User preferences UI
- [ ] Notification testing
- [ ] Reliability improvements

### Week 8: Live Activities

- [ ] Live Activities API research
- [ ] Dynamic Island design
- [ ] Update triggers
- [ ] Priority configuration
- [ ] Testing on physical devices

### Week 9: Dashboard & Polish

- [ ] Metrics calculation engine
- [ ] Chart components
- [ ] Performance optimization
- [ ] Final UI polish
- [ ] User testing with Kesa

### Weeks 10-11: Experimental Tracking

- [ ] Scheduled check-in system
- [ ] Post-medication effectiveness tracking
- [ ] Functional impact metrics
- [ ] A/B testing framework
- [ ] Statistical analysis tools

## Risk Mitigation

| Risk                            | Impact | Mitigation                                      |
| ------------------------------- | ------ | ----------------------------------------------- |
| Google API rate limits          | High   | Implement intelligent caching, batch requests   |
| Forms API limitations           | Medium | Fallback to hardcoded form structure if needed  |
| Complex medication interactions | Medium | Start with simple rules, iterate based on usage |
| Live Activities complexity      | Low    | Can ship without, add in update                 |
| Notification reliability        | Medium | Extensive testing, clear user expectations      |

## Key Technical Decisions

1. **Start with Recent-Meds Recreation** - Immediate value, establishes foundation
2. **No Backend Server** - Simplifies deployment and maintenance
3. **Local Medication Config** - Start simple, can sync later
4. **Keep Current Data Format** - Minimize migration risk
5. **iOS-First Development** - Optimize for primary use case
6. **Incremental Feature Rollout** - Get core value quickly

**Why Start with Recent-Meds:**

- Solves immediate pain point (flaky CSV endpoint)
- Establishes Google auth and Sheets API patterns
- Can be built and deployed in ~1 week
- Provides daily value while building other features
- Lower risk than starting with form replacement
- Creates foundation for all future features

## Open Questions

1. Should quick presets be stored locally or in Sheets?
2. How to handle timezone changes for medication schedules?
3. What level of medication interaction warnings to include?
4. Should dashboard metrics sync between devices?

## Next Steps

1. **Immediate Action - Recent Meds MVP**
   - Port existing recent-meds React project to React Native
   - Focus on Google Sheets API integration
   - Get working version on TestFlight ASAP
   - Start using immediately to validate approach

2. **Technical Validation**
   - Test Google Forms API capabilities
   - Verify Sheets API performance
   - Prototype Live Activities

3. **Design**
   - Create UI mockups for key screens
   - Design medication timeline component
   - Plan notification flows

This roadmap prioritizes solving real pain points: Starting with the recent-meds recreation provides immediate value by fixing the unreliable CSV endpoint while establishing the technical foundation for all future features. Once you're using a fast, reliable version of recent-meds daily, we can incrementally add the form, smart features, and experimental tracking capabilities.
