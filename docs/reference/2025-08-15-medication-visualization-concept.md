# Medication Timeline Widget - Concept Brief

## Vision

A compact medication tracking widget that answers the critical question **"What can I safely take right now?"** at a single glance. The interface combines visualization and input into one unified experience, occupying roughly the same space as a video player in a mobile app.

---

## Core Concept

### The Problem

People managing multiple medications need to constantly track:

- What's currently in their system
- When medications were taken
- How long until they wear off
- When it's safe to take more

Current solutions require mental math, checking multiple screens, or maintaining written logs. This cognitive load is especially challenging when dealing with pain or other symptoms.

### The Solution

A horizontal timeline that displays medications as iOS-style "pills" — rounded rectangular bars that show when doses were taken and how long they remain effective. Each medication gets its own horizontal track, stacked vertically like a Gantt chart.

**The key innovation**: Every row displays a dotted outline showing exactly what can be taken and when — either "650mg now" or "600mg +2h" — eliminating all guesswork.

---

## Design Principles

### Information Hierarchy

1. **The "Now" line** — A clear vertical marker separating past from future
2. **Active medications** — Solid colored bars showing what's currently in your system
3. **Available doses** — Dotted outlines indicating what you can take and when
4. **Wearing off indicators** — Visual fade showing medications losing effectiveness

### Visual Language

- Adopts iOS toggle switch aesthetics for immediate familiarity
- Each medication has a distinct color for quick recognition
- Progressive transparency indicates medication effectiveness over time
- No gaps between rows to maximize information density

### Interaction Philosophy

The visualization IS the interface. Users tap directly on the dotted "available" indicators to log doses. What you see is where you interact — no separate input screens or modes.

---

## Key Features

### Partial Dosing Support

The widget understands that medications can be taken in varying amounts. If someone takes half their maximum allowable dose of Tylenol, the interface shows they can take more immediately, with the dotted outline indicating the remaining allowable amount.

### Safety Without Obstruction

Rather than blocking actions with red warnings or disabled states, the interface simply shows when the next dose becomes available. Users maintain agency while being fully informed.

### Time Compression

The timeline shows roughly 6 hours of history and 4 hours into the future — enough context to understand patterns without overwhelming detail. The "Now" line sits off-center, emphasizing recent history while still showing upcoming availability.

---

## Use Cases

### Primary: Chronic Pain Management

Users managing multiple pain medications can see their complete coverage at a glance, identify gaps before they become problematic, and make informed decisions about which medication to take next.

### Secondary: Migraine Tracking

The clear visualization of medication timing helps users manage rescue medications, prophylactics, and avoid medication overuse headaches.

### Tertiary: Caregiver Coordination

When multiple people help manage medications, the widget provides a shared understanding of what's been taken and what's available.

---

## Success Metrics

### Comprehension Speed

Users should understand their complete medication status within 2 seconds of viewing the widget.

### Decision Confidence

Users should never wonder "Can I take this now?" or "How much can I take?" — the interface provides explicit answers.

### Input Efficiency

Logging a dose should require only a single tap, with smart defaults eliminating additional configuration.

### Adherence Improvement

By removing friction and uncertainty, users should demonstrate better medication schedule compliance.

---

## What "Executed Well" Looks Like

### Visual Clarity

- Every element has a clear purpose
- No decoration without function
- Consistent visual language throughout
- Comfortable information density without feeling cramped

### Behavioral Predictability

- Tapping where you'd expect to add something adds it
- Dragging what looks draggable adjusts timing
- Visual states (solid/fading/dotted) have obvious meanings

### Emotional Design

- Feels medical enough to trust, friendly enough to use daily
- Reduces anxiety about medication safety
- Provides confidence through clarity
- Respects user agency while providing guardrails

### Technical Excellence

- Instant response to interactions
- Smooth transitions that aid comprehension
- Reliable state management
- Graceful handling of edge cases

---

## Design Freedom

While the core concept is defined, implementation should embrace platform conventions and creative solutions for:

- Animation and transition styles
- Specific color palettes that ensure accessibility
- Touch gesture vocabulary
- Responsive scaling across device sizes
- Dark mode adaptations
- Notification and reminder integration
- Historical data visualization

The design should feel native to its platform while maintaining the core principle: **making medication safety visible and actionable at a glance**.

---

## Conclusion

This widget succeeds when users stop thinking about medication math and start trusting what they see. By showing rather than telling, and by making the interface itself the input method, we remove the cognitive burden from a task that people perform while potentially impaired by pain or other symptoms.

The dotted outline innovation — showing exactly what can be taken and when — transforms medication management from a memory and calculation exercise into a simple visual check. This is particularly valuable for people managing chronic conditions who need reliable, friction-free tools that work every day.
