# Medication Config Refactor Plan

## Goal

Refactor medication config to create a centralized medication database that:

1. Defines medications themselves (not per-person)
2. Handles medications that both Justin and Kesa take
3. Uses nullable fields for unknown information
4. Expands parsers to handle different formats
5. Uses the expanded color palette from tamagui-custom-themes

## Current State

- Medications are defined per-person (justin, kesa configs)
- Limited color palette
- Some medications appear in both lists with slight variations

## Implementation Plan

### ✅ Step 1: Analyze medication lists

- Extract unique medications from both lists
- Identify common medications with different formats
- Group by medication type/category

### ✅ Step 2: Review theme colors

- Check tamagui-custom-themes.ts for available colors
- Map medications to appropriate colors

### ✅ Step 3: Refactor medicationConfig.ts

- Create centralized medication definitions
- Make fields nullable where information is unknown
- Expand parsers to handle format variations
- Comment out per-person configs
- Extend color themes

### ✅ Step 4: Test and validate

- Ensure parsers handle all formats
- Verify nullable fields work correctly
- Fixed TypeScript issues with nullable activeDuration
- Fixed linting issues with regex escapes
- All checks pass with `npm run signal`

## Medication Categories Identified

### Stimulants/ADHD

- Adderall (various doses)
- Vyvanse (various doses)
- Dextroamphetamine (various doses)
- Qelbree

### Pain Management

- Percocet (5/325, 10/325)
- Oxycodone
- Tramadol
- Acetaminophen (various forms)
- Aleve/Naproxen

### Anxiety/Sleep

- Xanax
- Clonazepam/Klonopin
- Xywav (various doses)
- Valium suppository

### Migraine

- Rizatriptan
- Cambia
- Emgality
- Propranolol

### Cannabis/Psychedelics

- Cannabis/Marijuana (various THC doses)
- LSD (microdose and regular dose)
- MDMA
- Ketamine

### Anti-inflammatory

- Celebrex
- Diclofenac

### Other

- Zofran/Ondansetron
- Famotidine
- Gaviscon
- Various vaccines
- Supplements

## TODOs

- Add active duration for medications where known
- Add contraindications system later
- Add per-person dosage configs later
