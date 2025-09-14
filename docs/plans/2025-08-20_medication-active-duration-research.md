# Medication Active Duration Research Plan

## Objective

Research credible, trustworthy sources for active duration of each medication in the config file. Update each medication with:

1. Accurate activeDuration based on research with min/max ranges
2. Citation links in comments
3. Clear flagging of any uncertainty
4. Additional pharmacokinetic data (half-life, etc.)

## Refactor Plan

Update the activeDuration structure to capture more comprehensive information:

```typescript
activeDuration: {
  typical: number;      // The typical/usual duration (what we'll use for calculations)
  min?: number;         // Minimum duration from research
  max?: number;         // Maximum duration from research
  halfLife?: number;    // Plasma half-life if relevant
  notes?: string;       // Any important notes about duration
  citations: string[];  // Array of citation URLs
}
```

Steps:

1. Update type definitions in `src/types/medicationVisualization.ts`
2. Research each medication thoroughly
3. Update config with new structure and citations
4. Ensure all code uses the `typical` value for now

## Health Impact Considerations

- This data has direct health implications
- Must use only reputable medical sources (FDA, Mayo Clinic, medical journals, drug manufacturers)
- When ranges exist, choose conservative/safe values
- Flag ANY uncertainty clearly

## Medications to Research

### Pain Management

- [ ] Acetaminophen 8hr Extended Release - Currently 8 hours
- [ ] Percocet (5/325 and 10/325) - Currently 4 hours
- [ ] Oxycodone - Currently 4 hours
- [ ] Tramadol - Currently 6 hours
- [ ] Celebrex - Currently 12 hours
- [ ] Aleve/Naproxen - Currently 12 hours

### Migraine Medications

- [ ] Rizatriptan - Currently 2 hours
- [ ] Cambia - Currently 2 hours
- [ ] Emgality - Currently null (monthly injection)
- [ ] Propranolol - Currently 24 hours

### ADHD Medications

- [ ] Adderall - Currently 4 hours
- [ ] Dextroamphetamine - Currently 4 hours
- [ ] Vyvanse - Currently 12 hours
- [ ] Qelbree - Currently null

### Anxiety/Sleep

- [ ] Xanax - Currently 6 hours
- [ ] Clonazepam - Currently 12 hours
- [ ] Valium Suppository - Currently null
- [ ] Xywav - Currently 3 hours

### Cannabis/Psychedelics

- [ ] Cannabis - Currently 4 hours
- [ ] LSD - Currently null
- [ ] MDMA - Currently null
- [ ] Ketamine - Currently null

### GI/Nausea

- [ ] Zofran/Ondansetron - Currently 8 hours
- [ ] Famotidine - Currently 24 hours
- [ ] Gaviscon - Currently 4 hours

### Other Medications

- [ ] Flexeril - Currently 8 hours
- [ ] Diclofenac Gel - Currently null (topical)
- [ ] Sudafed - Currently null
- [ ] Loratadine - Currently 24 hours
- [ ] Mucinex - Currently null
- [ ] Miralax - Currently null
- [ ] Gabapentin - Currently 8 hours

### Supplements/Vaccines

- [ ] Omega-3 - Currently null
- [ ] Flu Vaccine - Currently null (not applicable)
- [ ] COVID Vaccine - Currently null (not applicable)
- [ ] Hep B Vaccine - Currently null (not applicable)
- [ ] Alcohol - Currently null

## Research Progress

Starting research now...
