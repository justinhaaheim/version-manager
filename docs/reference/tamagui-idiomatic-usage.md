# Tamagui Idiomatic Usage Guide

> **Updated 2025-08-19**: This guide reflects the completed migration to Tamagui v4 default configuration. All custom tokens (`$danger`, `$primary`, `$cardBackground`, etc.) have been removed from the codebase.

## Core Principles

### 1. Think in Themes, Not Colors

Instead of manually specifying colors, use Tamagui's theme system to apply coordinated visual contexts.

### 2. Use the 12-Step Palette System

Each position in the palette has semantic meaning:

- **$color1-3**: Background colors (app bg → card bg)
- **$color4-8**: Interactive states (disabled → pressed)
- **$color9-12**: Foreground colors (solid bg → primary text)

### 3. Trust the Defaults

Tamagui components have well-designed defaults. Don't override unless necessary.

## The Palette System Explained

```
Light Mode:
$color1  = white        → App background
$color2  = gray 50      → Subtle backgrounds
$color3  = gray 100     → Card backgrounds
$color4  = gray 200     → Disabled borders
$color5  = gray 300     → Disabled elements
$color6  = gray 400     → Default borders
$color7  = gray 500     → Hover borders
$color8  = gray 600     → Active borders
$color9  = gray 700     → Solid backgrounds (buttons)
$color10 = gray 800     → Hover solid backgrounds
$color11 = gray 900     → Secondary text
$color12 = near black   → Primary text

Dark Mode (automatically inverted):
$color1  = near black   → App background
$color2  = gray 900     → Subtle backgrounds
...
$color12 = white        → Primary text
```

## Common UI Patterns

### Error/Danger States

#### ❌ WRONG - Manual colors (OLD approach):

```tsx
// OLD approach - no longer in codebase
<YStack
  backgroundColor="$danger"
  borderBottomColor="$borderColor"
  borderBottomWidth={1}>
  <H2 color="white">Test Mode</H2>
  <Text color="white">{scenarioName}</Text>
  <Button backgroundColor="white" color="$danger">
    Exit Test Mode
  </Button>
</YStack>
```

#### ✅ RIGHT - Theme-based approach:

```tsx
<Theme name="red">
  <YStack backgroundColor="$color9" padding="$4">
    <H2>Test Mode</H2> {/* Automatically white in red theme */}
    <Text>{scenarioName}</Text>
    <Button theme="white">Exit Test Mode</Button>
  </YStack>
</Theme>
```

### Cards and Containers

#### ❌ WRONG - Manual specification:

```tsx
// OLD approach - replaced with v4 patterns
<YStack backgroundColor="$cardBackground" borderRadius="$4" padding="$3">
  {/* content */}
</YStack>
```

#### ✅ RIGHT - Use Card component:

```tsx
<Card padding="$3">
  {/* content */}
</Card>

// Or for custom containers:
<YStack backgroundColor="$color3" padding="$3">
  {/* $color3 is the semantic card background */}
</YStack>
```

### Primary Actions (CTAs)

#### ❌ WRONG - Manual primary colors:

```tsx
// From HomeScreen.tsx
<Progress.Indicator backgroundColor="$primary" />
<Button backgroundColor="$primary" color="white">
  Save
</Button>
```

#### ✅ RIGHT - Use accent theme:

```tsx
<Progress.Indicator theme="accent" />
<Button theme="accent">Save</Button>
```

### Text Hierarchy

#### ❌ WRONG - Custom text tokens:

```tsx
<H1 color="$headingText">Title</H1>
<Text color="$text">Body text</Text>
<Text color="$secondaryText">Secondary info</Text>
```

#### ✅ RIGHT - Palette positions:

```tsx
<H1>Title</H1>  {/* H1 automatically uses $color12 */}
<Text>Body text</Text>  {/* Text uses $color12 by default */}
<Text color="$color11">Secondary info</Text>  {/* Explicitly muted */}
<Text color="$color10">Tertiary info</Text>  {/* More muted */}
```

### Dark Mode Support

#### ❌ WRONG - Manual dark mode handling:

```tsx
// From ThemeToggle.tsx
<Button
  backgroundColor={isDark ? '$secondaryBackground' : '$background'}
  color={isDark ? 'white' : 'black'}>
  Toggle
</Button>
```

#### ✅ RIGHT - Automatic adaptation:

```tsx
<Button>Toggle</Button>  {/* Colors adapt automatically */}

// Or use semantic palette positions:
<YStack backgroundColor="$color2">  {/* Subtle bg in both modes */}
  <Text>This adapts automatically</Text>
</YStack>
```

### Loading States

#### ❌ WRONG - Manual opacity:

```tsx
// From HomeScreen.tsx
<YStack opacity={isLoading ? 0.5 : 1}>{/* content */}</YStack>
```

#### ✅ RIGHT - Disabled prop:

```tsx
<YStack disabled={isLoading}>
  {/* Tamagui handles opacity and interaction */}
</YStack>
```

### Form Inputs

#### ❌ WRONG - Over-specified:

```tsx
<Input
  backgroundColor="$background"
  borderColor="$borderColor"
  borderWidth={1}
  color="$text"
  placeholderTextColor="$secondaryText"
/>
```

#### ✅ RIGHT - Trust defaults:

```tsx
<Input placeholder="Enter text" />;
{
  /* Input component already has proper styling */
}
```

## Theme Usage Patterns

### 1. Single Component Theming

Use the `theme` prop for individual components:

```tsx
<Button theme="red">Delete</Button>
<Button theme="green">Confirm</Button>
<Button theme="accent">Primary Action</Button>
```

### 2. Section Theming

Wrap sections in Theme components for consistent coloring:

```tsx
<Theme name="blue">
  <Card>
    <H3>Blue Section</H3>
    <Text>All text here uses blue palette</Text>
    <Button>This button is blue-themed</Button>
  </Card>
</Theme>
```

### 3. Inverted Sections

Use accent theme for sections that need to stand out:

```tsx
<Theme name="accent">
  <YStack padding="$4">
    <H2>Important Notice</H2>
    <Text>This section has inverted colors</Text>
  </YStack>
</Theme>
```

### 4. Nested Themes

Themes can be nested for complex layouts:

```tsx
<Theme name="blue">
  <Card>
    <Text>Blue themed content</Text>
    <Theme name="red">
      <Button>Red button in blue context</Button>
    </Theme>
  </Card>
</Theme>
```

## Component-Specific Guidelines

### Buttons

```tsx
// Primary action
<Button theme="accent">Save Changes</Button>

// Danger action
<Button theme="red">Delete</Button>

// Secondary action
<Button>Cancel</Button>  {/* Default styling */}

// Disabled state
<Button disabled>Unavailable</Button>

// Custom colored button
<Theme name="green">
  <Button>Success Action</Button>
</Theme>
```

### Cards

```tsx
// Basic card
<Card>
  <Card.Header>
    <H3>Card Title</H3>
  </Card.Header>
  <Text>Card content</Text>
</Card>

// Colored card
<Theme name="blue">
  <Card>
    <Text>Blue-tinted card</Text>
  </Card>
</Theme>

// Alert card
<Theme name="red">
  <Card backgroundColor="$color3">  {/* Subtle red background */}
    <Text>Error message</Text>
  </Card>
</Theme>
```

### Lists

```tsx
// From MedicationList.tsx - current approach
<YStack space="$2">
  {medications.map(med => (
    <Card key={med.id}>
      <Text>{med.name}</Text>
    </Card>
  ))}
</YStack>

// Idiomatic approach
<YStack space="$2">
  {medications.map(med => (
    <Card key={med.id} pressable hoverStyle={{ scale: 0.98 }}>
      <Text>{med.name}</Text>
      <Text color="$color11" fontSize="$3">
        {med.dosage}
      </Text>
    </Card>
  ))}
</YStack>
```

### Forms

```tsx
// Complete form example
<YStack space="$4" padding="$4">
  <YStack space="$2">
    <Label htmlFor="name">Medication Name</Label>
    <Input id="name" placeholder="Enter medication name" />
  </YStack>

  <YStack space="$2">
    <Label htmlFor="dosage">Dosage</Label>
    <Input id="dosage" placeholder="e.g., 10mg" />
  </YStack>

  <XStack space="$2" justifyContent="flex-end">
    <Button>Cancel</Button>
    <Button theme="accent">Save</Button>
  </XStack>
</YStack>
```

## Real Examples from This Codebase (Now Updated!)

### UpdateInfo Component

```tsx
// ✅ NOW USES: Palette positions
<YStack backgroundColor={backgroundColor} padding="$3">
  <Text color="$color">Version {version}</Text>
</YStack>
```

### Settings Screen

```tsx
// ✅ NOW USES: Palette colors
<YStack>
  <Text color="$red11" fontSize="$3">
    This will delete all data
  </Text>
</YStack>
```

### TestMedicationView Component

```tsx
// ✅ NOW USES: Theme wrapper pattern
<Theme name="red">
  <YStack backgroundColor="$color9" padding="$4">
    <H2>Test Mode</H2>
    <Text>{scenarioName}</Text>
    <Button theme="white">Exit Test Mode</Button>
  </YStack>
</Theme>
```

## Migration Checklist

When refactoring a component, check for these anti-patterns:

- [ ] `backgroundColor="$danger"` → Use `theme="red"`
- [ ] `backgroundColor="$primary"` → Use `theme="accent"`
- [ ] `backgroundColor="$cardBackground"` → Use `Card` component
- [ ] `color="$text"` → Remove (default)
- [ ] `color="$headingText"` → Remove (headings handle this)
- [ ] `color="$secondaryText"` → Use `color="$color11"`
- [ ] `color="white"` → Use theme context or `$color1`
- [ ] `borderColor="$borderColor"` → Use `$color6` or remove
- [ ] Manual dark mode checks → Use palette positions

## Quick Reference

### Color Tokens to Palette Mapping

| Purpose           | Token      | Light Mode  | Dark Mode   |
| ----------------- | ---------- | ----------- | ----------- |
| App background    | `$color1`  | white       | near-black  |
| Card background   | `$color3`  | light gray  | dark gray   |
| Default border    | `$color6`  | medium gray | medium gray |
| Button background | `$color9`  | dark gray   | light gray  |
| Secondary text    | `$color11` | dark gray   | light gray  |
| Primary text      | `$color12` | near-black  | white       |

### Theme Names

- `"accent"` - Primary actions, CTAs
- `"red"` - Errors, destructive actions
- `"green"` - Success states
- `"blue"` - Information
- `"yellow"` - Warnings
- `"white"` - Always white (ignores dark mode)
- `"black"` - Always black (ignores dark mode)

### Component Defaults

- `Button` - Already styled, just add `theme` prop
- `Card` - Has background, padding, shadows
- `Input` - Has borders, padding, focus states
- `Text` - Uses `$color12` by default
- `H1-H6` - Uses `$color12` with appropriate sizing

## For AI Assistants

When writing Tamagui code:

1. **Never create custom tokens** - Use only tokens from default v4 config
2. **Prefer theme props** over manual colors
3. **Use Theme wrappers** for sections needing consistent coloring
4. **Trust component defaults** - Don't override unless necessary
5. **Use palette positions** (`$color1-12`) for semantic meaning
6. **Avoid hardcoded colors** like "white" or "#fff"
7. **Let dark mode work automatically** through the palette system

Example refactoring process:

1. Identify custom tokens (like `$danger`)
2. Replace with theme usage (`theme="red"`)
3. Remove unnecessary color specifications
4. Wrap related components in Theme if needed
5. Test in both light and dark modes

## Common Mistakes to Avoid

### ❌ Creating Bootstrap-style variants

```tsx
// Don't do this:
<Button variant="danger">Delete</Button> // variant doesn't exist
```

### ✅ Use themes instead

```tsx
<Button theme="red">Delete</Button>
```

### ❌ Fighting the system

```tsx
// Don't manually specify every color:
<Card
  backgroundColor="$cardBackground"
  borderColor="$borderColor"
  shadowColor="$shadowColor">
```

### ✅ Trust the defaults

```tsx
<Card>  {/* All styling handled automatically */}
```

### ❌ Using non-existent tokens

```tsx
<Text color="$muted">  {/* $muted doesn't exist */}
```

### ✅ Use palette positions

```tsx
<Text color="$color11">  {/* Semantic muted text */}
```

## Theme System Architecture (Post-Cleanup)

### What We Removed

- Custom color schemes (like "polished")
- Color scheme switching functionality
- Custom token definitions (`$danger`, `$primary`, etc.)
- Complex theme builder system

### What We Kept

- Light/Dark mode switching
- System mode preference
- Appearance mode persistence
- Simple theme toggle

### Current Architecture

```
TamaguiProvider (uses 'light' or 'dark' theme)
  └── Uses default v4 configuration
  └── Theme determined by useThemeManager().theme
  └── Automatically handles all palette inversions
```

## Summary

The key to idiomatic Tamagui usage is to **think in themes and semantic relationships** rather than individual color tokens. Use the theme system to apply coordinated visual contexts, trust component defaults, and leverage the 12-step palette system for consistent, maintainable styling that automatically adapts to dark mode.

When in doubt:

1. Check if a component default handles it
2. Use a theme prop if available
3. Use palette positions for semantic meaning
4. Wrap in Theme component for sections
5. Never create custom tokens
