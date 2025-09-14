import type {CustomThemeNamesFunColors} from '@/theme/tamaguiCustomThemes';
import type {
  MedicationVisualizationConfig,
  UserMedicationConfig,
  VisualizationMedication,
} from '@/types/medicationVisualization';

export const DEFAULT_MEDICATION_DURATION_HOURS = 6;

// Theme assignments for medications - using extended color palette
const THEMES: Record<string, CustomThemeNamesFunColors> = {
  acetaminophen: 'green',
  adderall: 'orange',
  alcohol: 'burgundy',
  aleve: 'red',
  cambia: 'jade',
  cannabis: 'forest',
  celebrex: 'purple',
  clonazepam: 'royalBlue',
  covid_vaccine: 'cyan',
  dextroamphetamine: 'orangeRed',
  diclofenac: 'teal',
  emgality: 'supreme',
  famotidine: 'pink',
  flexeril: 'tan',
  flu_vaccine: 'cyan',
  gabapentin: 'yellow',
  gaviscon: 'jade',
  hep_vaccine: 'cyan',
  ketamine: 'purple',
  loratidine: 'pink',
  lsd: 'supreme',
  mdma: 'orangeRed',
  miralax: 'teal',
  mucinex: 'forest',
  naproxen: 'red',
  omega3: 'yellow',
  ondansetron: 'blue',
  oxycodone: 'orange',
  percocet: 'orange',
  propranolol: 'royalBlue',
  qelbree: 'jade',
  rizatriptan: 'tan',
  sudafed: 'red',
  tramadol: 'blue',
  valium: 'royalBlue',
  vyvanse: 'yellow',
  xanax: 'cyan',
  xywav: 'purple',
};

// Centralized medication definitions
const MEDICATIONS: VisualizationMedication[] = [
  // Pain Management - Acetaminophen
  {
    activeDuration: {
      citations: [
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC6084333/',
        'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3af22fc8-e4e0-4863-8696-6bc1257047cb',
      ],
      halfLife: 3.4,
      max: 8,
      min: 6,
      // Extended release formulation
      notes: 'Extended release formulation designed for q8hr dosing',

      typical: 8,
    },
    displayName: 'Acetaminophen 8hr',
    id: 'acetaminophen_8hr',
    ingredients: [{amountPerUnit: 650, name: 'acetaminophen', unit: 'mg'}],
    parser: {
      extractDose: (match: string) => {
        // Match various formats
        const patterns = [
          /(\d+)x\s+Acetaminophen 8hr Extended Release.*?\((\d+)mg acetaminophen\)/i,
          /Acetaminophen 8hr Extended Release.*?\((\d+)mg acetaminophen\)/i,
          /Acetaminophen 8hr Extended Release \(Tylenol\).*?(\d+)mg/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            // Get the mg amount from the last capture group
            const mgAmount = parseInt(result[result.length - 1]);
            return {amount: mgAmount, unit: 'mg'};
          }
        }

        // Handle tablet count patterns
        const tabletMatch =
          /(\d+)x?\s*Acetaminophen 8hr.*?\((\d+) tablets?\)/i.exec(match);
        if (tabletMatch) {
          const tablets = parseInt(tabletMatch[2]);
          return {amount: tablets * 650, unit: 'mg'};
        }

        return null;
      },
      patterns: [/Acetaminophen 8hr/i, /Tylenol.*8hr/i],
    },
    standardDoses: [
      {amount: 650, label: '1 tablet', unit: 'mg'},
      {amount: 1300, label: '2 tablets', unit: 'mg'},
      {amount: 1950, label: '3 tablets', unit: 'mg'},
    ],
    theme: THEMES.acetaminophen,
  },

  // Pain Management - Percocet (multiple strengths)
  {
    activeDuration: {
      citations: [
        'https://www.ncbi.nlm.nih.gov/books/NBK482226/',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2009/020553s060lbl.pdf',
      ],
      halfLife: 3.2,
      max: 6,
      min: 3,
      // Based on oxycodone component
      notes: 'Duration based on oxycodone immediate release',

      typical: 4,
    },
    displayName: 'Percocet 5/325',
    id: 'percocet_5_325',
    ingredients: [
      {amountPerUnit: 5, name: 'oxycodone', unit: 'mg'},
      {amountPerUnit: 325, name: 'acetaminophen', unit: 'mg'},
    ],
    parser: {
      extractDose: (match: string) => {
        const patterns = [
          /(\d+)x?\s*Percocet 5[-/]325.*?\((\d+) (?:tablets?|pills?)\)/i,
          /Percocet 5[-/]325.*?\((\d+) (?:tablets?|pills?)\)/i,
          /5[-/]325 [Pp]ercocet/i,
          /Percocet 2x 5[-/]325.*?\((\d+) (?:tablets?|pills?)\)/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            let tabletCount = 1;
            if (result[2]) {
              tabletCount = parseInt(result[2]);
            } else if (result[1] && !result[2]) {
              tabletCount = parseInt(result[1]);
            } else if (match.includes('2x')) {
              tabletCount = 2;
            }
            return {amount: tabletCount * 5, unit: 'mg oxy'};
          }
        }
        return null;
      },
      patterns: [/Percocet 5[-/]325/i, /5[-/]325 [Pp]ercocet/i],
    },
    standardDoses: [
      {amount: 5, label: '1 tablet', unit: 'mg oxy'},
      {amount: 10, label: '2 tablets', unit: 'mg oxy'},
    ],
    theme: THEMES.percocet,
  },
  {
    activeDuration: {
      citations: [
        'https://www.ncbi.nlm.nih.gov/books/NBK482226/',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2009/020553s060lbl.pdf',
      ],
      halfLife: 3.2,
      max: 6,
      min: 3,
      // Based on oxycodone component
      notes: 'Duration based on oxycodone immediate release',

      typical: 4,
    },
    displayName: 'Percocet 10/325',
    id: 'percocet_10_325',
    ingredients: [
      {amountPerUnit: 10, name: 'oxycodone', unit: 'mg'},
      {amountPerUnit: 325, name: 'acetaminophen', unit: 'mg'},
    ],
    parser: {
      extractDose: (match: string) => {
        const patterns = [
          /(\d+)x?\s*Percocet 10[-/]325.*?\((\d+) (?:tablets?|pills?)\)/i,
          /Percocet 10[-/]325.*?\((\d+) (?:tablets?|pills?)\)/i,
          /10[-/]325 [Pp]ercocet/i,
          /2x Percocet 10[-/]325.*?\((\d+) tablets?\)/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            let tabletCount = 1;
            if (result[2]) {
              tabletCount = parseInt(result[2]);
            } else if (result[1] && !result[2]) {
              tabletCount = parseInt(result[1]);
            } else if (match.includes('2x')) {
              tabletCount = 2;
            }
            return {amount: tabletCount * 10, unit: 'mg oxy'};
          }
        }
        return null;
      },
      patterns: [/Percocet 10[-/]325/i, /10[-/]325 [Pp]ercocet/i],
    },
    standardDoses: [
      {amount: 10, label: '1 tablet', unit: 'mg oxy'},
      {amount: 20, label: '2 tablets', unit: 'mg oxy'},
    ],
    theme: THEMES.percocet,
  },

  // Pain Management - Oxycodone
  {
    activeDuration: {
      citations: [
        'https://www.ncbi.nlm.nih.gov/books/NBK482226/',
        'https://go.drugbank.com/drugs/DB00497',
      ],
      halfLife: 3.2,
      max: 6,
      min: 3,
      notes: 'Immediate release formulation',
      typical: 4,
    },
    displayName: 'Oxycodone',
    id: 'oxycodone',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Oxycodone.*?(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Oxycodone/i],
    },
    standardDoses: [{amount: 5, label: '5mg', unit: 'mg'}],
    theme: THEMES.oxycodone,
  },

  // Pain Management - Tramadol
  {
    activeDuration: {
      citations: [
        'https://www.ncbi.nlm.nih.gov/books/NBK537060/',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2009/020281s032s033lbl.pdf',
      ],
      halfLife: 6.3,
      max: 6,
      min: 4,
      notes: 'Active metabolite (M1) has longer half-life of 7.4 hours',
      typical: 6,
    },
    displayName: 'Tramadol',
    id: 'tramadol',
    parser: {
      extractDose: (match: string) => {
        // Match "Tramadol Hcl 100mg (2 tablets)" or "Tramadol Hcl 50mg (1 tablet)"
        const doseMatch = /Tramadol.*?(\d+)mg.*?\((\d+) tablets?\)/i.exec(
          match,
        );
        if (doseMatch) {
          const mgPerTablet = parseInt(doseMatch[1]);
          const tabletCount = parseInt(doseMatch[2]);
          return {amount: mgPerTablet * tabletCount, unit: 'mg'};
        }

        // Match just "Tramadol Hcl 50mg"
        const mgMatch = /Tramadol.*?(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }

        return null;
      },
      patterns: [/Tramadol/i],
    },
    standardDoses: [
      {amount: 50, label: '1 tablet', unit: 'mg'},
      {amount: 100, label: '2 tablets', unit: 'mg'},
    ],
    theme: THEMES.tramadol,
  },

  // Anti-inflammatory
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2008/020998s026lbl.pdf',
        'https://go.drugbank.com/drugs/DB00482',
      ],
      halfLife: 11.2,
      notes: 'Typically dosed once or twice daily',
      typical: 12,
    },
    displayName: 'Celebrex',
    id: 'celebrex',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Celebrex\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Celebrex/i],
    },
    standardDoses: [
      {amount: 100, label: '100mg', unit: 'mg'},
      {amount: 200, label: '200mg', unit: 'mg'},
    ],
    theme: THEMES.celebrex,
  },

  // Anti-inflammatory - Aleve/Naproxen
  {
    activeDuration: {
      citations: [
        'https://www.ncbi.nlm.nih.gov/books/NBK525965/',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/017581s112,018164s062,020067s019lbl.pdf',
      ],
      halfLife: 13,
      notes: 'Elimination half-life 12-17 hours',
      typical: 12,
    },
    displayName: 'Aleve',
    id: 'naproxen',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /(?:Aleve|Naproxen)\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        // Default Aleve without dose specified
        if (/Aleve/i.test(match)) {
          return {amount: 220, unit: 'mg'};
        }
        return null;
      },
      patterns: [/Aleve/i, /Naproxen/i],
    },
    standardDoses: [
      {amount: 220, label: '1 tablet', unit: 'mg'},
      {amount: 440, label: '2 tablets', unit: 'mg'},
      {amount: 660, label: '3 tablets', unit: 'mg'},
    ],
    theme: THEMES.aleve,
  },

  // Migraine medications
  {
    activeDuration: {
      citations: [
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC2671815/',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2010/020864s013lbl.pdf',
      ],
      notes: 'Rapid onset triptan; redose possible after 2 hours if needed',
      typical: 2,
    },
    displayName: 'Rizatriptan',
    id: 'rizatriptan',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Rizatriptan\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Rizatriptan/i, /Maxalt/i],
    },
    standardDoses: [{amount: 10, label: '10mg', unit: 'mg'}],
    theme: THEMES.rizatriptan,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2009/021963lbl.pdf',
      ],
      notes: 'Diclofenac potassium for oral solution',
      typical: 2,
    },
    displayName: 'Cambia',
    id: 'cambia',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Cambia\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Cambia/i],
    },
    standardDoses: [{amount: 50, label: '50mg', unit: 'mg'}],
    theme: THEMES.cambia,
  },
  {
    activeDuration: null, // Monthly injection - duration not applicable for tracking
    displayName: 'Emgality',
    id: 'emgality',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Emgality\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Emgality/i, /galcanezumab/i],
    },
    standardDoses: [{amount: 120, label: '120mg injection', unit: 'mg'}],
    theme: THEMES.emgality,
  },
  {
    activeDuration: {
      citations: ['https://www.ncbi.nlm.nih.gov/books/NBK557801/'],
      halfLife: 4,
      notes: 'Prophylactic medication, typically dosed daily',
      typical: 24,
    },
    displayName: 'Propranolol',
    id: 'propranolol',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Propranolol\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Propranolol/i],
    },
    standardDoses: [{amount: 20, label: '20mg', unit: 'mg'}],
    theme: THEMES.propranolol,
  },

  // ADHD medications
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2007/011522s040lbl.pdf',
      ],
      max: 6,
      min: 4,
      notes: 'Immediate release formulation',
      typical: 4,
    },
    displayName: 'Adderall',
    id: 'adderall',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Adderall\s*(\d+(?:\.\d+)?)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseFloat(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Adderall/i],
    },
    standardDoses: [
      {amount: 2.5, label: '2.5mg', unit: 'mg'},
      {amount: 5, label: '5mg', unit: 'mg'},
      {amount: 7.5, label: '7.5mg', unit: 'mg'},
      {amount: 10, label: '10mg', unit: 'mg'},
      {amount: 15, label: '15mg', unit: 'mg'},
      {amount: 20, label: '20mg', unit: 'mg'},
    ],
    theme: THEMES.adderall,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/017078s045lbl.pdf',
      ],
      max: 6,
      min: 4,
      notes: 'Immediate release formulation',
      typical: 4,
    },
    displayName: 'Dextroamphetamine',
    id: 'dextroamphetamine',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Dextroamphetamine\s*(\d+(?:\.\d+)?)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseFloat(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Dextroamphetamine/i],
    },
    standardDoses: [
      {amount: 2.5, label: '2.5mg', unit: 'mg'},
      {amount: 5, label: '5mg', unit: 'mg'},
      {amount: 7.5, label: '7.5mg', unit: 'mg'},
      {amount: 10, label: '10mg', unit: 'mg'},
      {amount: 15, label: '15mg', unit: 'mg'},
      {amount: 20, label: '20mg', unit: 'mg'},
    ],
    theme: THEMES.dextroamphetamine,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/021977s045,208510s001lbl.pdf',
      ],
      max: 14,
      min: 10,
      notes: 'Lisdexamfetamine prodrug provides extended duration',
      typical: 12,
    },
    displayName: 'Vyvanse',
    id: 'vyvanse',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Vyvanse\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Vyvanse/i],
    },
    standardDoses: [
      {amount: 10, label: '10mg', unit: 'mg'},
      {amount: 20, label: '20mg', unit: 'mg'},
      {amount: 30, label: '30mg', unit: 'mg'},
      {amount: 40, label: '40mg', unit: 'mg'},
      {amount: 50, label: '50mg', unit: 'mg'},
      {amount: 60, label: '60mg', unit: 'mg'},
    ],
    theme: THEMES.vyvanse,
  },
  {
    activeDuration: null, // Viloxazine - requires more research for duration
    displayName: 'Qelbree',
    id: 'qelbree',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Qelbree\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Qelbree/i],
    },
    standardDoses: [{amount: 100, label: '100mg', unit: 'mg'}],
    theme: THEMES.qelbree,
  },

  // Anxiety/Sleep medications
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/018276s052lbl.pdf',
        'https://www.ncbi.nlm.nih.gov/books/NBK538165/',
      ],
      halfLife: 11.2,
      notes: 'Mean half-life 11.2 hours (range 6.3-26.9)',
      typical: 6,
    },
    displayName: 'Xanax',
    id: 'xanax',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Xanax\s*(\d+(?:\.\d+)?)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseFloat(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Xanax/i],
    },
    standardDoses: [
      {amount: 0.25, label: '0.25mg (1 tablet)', unit: 'mg'},
      {amount: 0.375, label: '0.375mg (1.5 tablets)', unit: 'mg'},
      {amount: 0.625, label: '0.625mg (2.5 tablets)', unit: 'mg'},
    ],
    theme: THEMES.xanax,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2013/017533s053,020813s009lbl.pdf',
        'https://www.ncbi.nlm.nih.gov/books/NBK556010/',
      ],
      halfLife: 35,
      max: 12,
      min: 8,
      notes: 'Long-acting benzodiazepine, half-life 30-40 hours',
      typical: 12,
    },
    displayName: 'Clonazepam',
    id: 'clonazepam',
    parser: {
      extractDose: (match: string) => {
        // Match various formats like "Clonazepam .5mg (1 tablet)" or "Clonazepam .25 (1/2 tablet)"
        const patterns = [
          /Clonazepam\s*(\d*\.?\d+)mg?\s*\((\d+(?:\/\d+)?)\s*tablets?\)/i,
          /Clonazepam\s*(\d*\.?\d+)\s*\((\d+)\s*tablets?\)/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            const dose = parseFloat(result[1]);
            let multiplier = 1;

            if (result[2]) {
              if (result[2].includes('/')) {
                // Handle fractions like "1/2"
                const [num, denom] = result[2].split('/').map(Number);
                multiplier = num / denom;
              } else {
                multiplier = parseFloat(result[2]);
              }
            }

            return {amount: dose * multiplier, unit: 'mg'};
          }
        }

        // Simple pattern
        const mgMatch = /Clonazepam\s*(\d*\.?\d+)/i.exec(match);
        if (mgMatch) {
          return {amount: parseFloat(mgMatch[1]), unit: 'mg'};
        }

        return null;
      },
      patterns: [/Clonazepam/i, /Klonopin/i, /Klonipin/i],
    },
    standardDoses: [
      {amount: 0.25, label: '0.25mg', unit: 'mg'},
      {amount: 0.5, label: '0.5mg', unit: 'mg'},
      {amount: 1, label: '1mg', unit: 'mg'},
      {amount: 1.5, label: '1.5mg', unit: 'mg'},
    ],
    theme: THEMES.clonazepam,
  },
  {
    activeDuration: null, // Suppository formulation - requires more research
    displayName: 'Valium Suppository',
    id: 'valium_suppository',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Valium.*?(\d+)\/(\d+)\/(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {
            amount: parseInt(mgMatch[1]),
            unit: 'mg diazepam',
          };
        }
        return null;
      },
      patterns: [/Valium.*Suppository/i],
    },
    standardDoses: [{amount: 5, label: '5/5/26mg', unit: 'mg diazepam'}],
    theme: THEMES.valium,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2020/212690s000lbl.pdf',
      ],
      halfLife: 0.5,
      max: 4,
      min: 2.5,
      notes: 'Sodium oxybate for narcolepsy, very short half-life',
      typical: 3,
    },
    displayName: 'Xywav',
    id: 'xywav',
    parser: {
      extractDose: (match: string) => {
        // Match various Xywav dose patterns
        const patterns = [
          /(\d+(?:\.\d+)?)g\s+Xywav/i,
          /Xywav.*?(\d+(?:\.\d+)?)g/i,
          /(?:Normal|Additional)\s+(\d+(?:\.\d+)?)g\s+Xywav/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            return {amount: parseFloat(result[1]), unit: 'g'};
          }
        }

        return null;
      },
      patterns: [/Xywav/i],
    },
    standardDoses: [
      {amount: 0.5, label: '0.5g', unit: 'g'},
      {amount: 0.75, label: '0.75g', unit: 'g'},
      {amount: 1, label: '1g', unit: 'g'},
      {amount: 1.5, label: '1.5g', unit: 'g'},
      {amount: 2, label: '2g', unit: 'g'},
      {amount: 2.5, label: '2.5g', unit: 'g'},
      {amount: 2.75, label: '2.75g', unit: 'g'},
      {amount: 3, label: '3g', unit: 'g'},
      {amount: 3.25, label: '3.25g', unit: 'g'},
      {amount: 3.5, label: '3.5g', unit: 'g'},
      {amount: 3.75, label: '3.75g', unit: 'g'},
      {amount: 4, label: '4g', unit: 'g'},
      {amount: 4.25, label: '4.25g', unit: 'g'},
      {amount: 4.5, label: '4.5g', unit: 'g'},
      {amount: 4.75, label: '4.75g', unit: 'g'},
      {amount: 5, label: '5g', unit: 'g'},
    ],
    theme: THEMES.xywav,
  },

  // Cannabis
  {
    activeDuration: {
      citations: ['https://www.ncbi.nlm.nih.gov/books/NBK563174/'],
      max: 6,
      min: 2,
      notes: 'Duration varies by route and individual metabolism',
      typical: 4,
    },
    displayName: 'Cannabis',
    id: 'cannabis',
    parser: {
      extractDose: (match: string) => {
        const patterns = [
          /Cannabis\s*(\d+)mg\s*THC/i,
          /Marijuana.*?(\d+)mg\s*THC/i,
          /(\d+)mg\s*THC.*?(?:Cannabis|Marijuana)/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            return {amount: parseInt(result[1]), unit: 'mg THC'};
          }
        }

        return null;
      },
      patterns: [/Cannabis/i, /Marijuana/i],
    },
    standardDoses: [
      {amount: 5, label: '5mg THC', unit: 'mg THC'},
      {amount: 10, label: '10mg THC', unit: 'mg THC'},
      {amount: 15, label: '15mg THC', unit: 'mg THC'},
      {amount: 20, label: '20mg THC', unit: 'mg THC'},
      {amount: 25, label: '25mg THC', unit: 'mg THC'},
      {amount: 30, label: '30mg THC', unit: 'mg THC'},
    ],
    theme: THEMES.cannabis,
  },

  // Psychedelics
  {
    activeDuration: null, // Psychedelic - not for medical dosing tracking
    displayName: 'LSD',
    id: 'lsd',
    parser: {
      extractDose: (match: string) => {
        const mcgMatch = /(\d+)mcg\s+LSD/i.exec(match);
        if (mcgMatch) {
          return {amount: parseInt(mcgMatch[1]), unit: 'mcg'};
        }
        return null;
      },
      patterns: [/LSD/i],
    },
    standardDoses: [
      {amount: 10, label: '10mcg microdose', unit: 'mcg'},
      {amount: 12, label: '12mcg microdose', unit: 'mcg'},
      {amount: 15, label: '15mcg microdose', unit: 'mcg'},
      {amount: 16, label: '16mcg microdose', unit: 'mcg'},
      {amount: 17, label: '17mcg microdose', unit: 'mcg'},
      {amount: 18, label: '18mcg microdose', unit: 'mcg'},
      {amount: 20, label: '20mcg', unit: 'mcg'},
      {amount: 50, label: '50mcg', unit: 'mcg'},
    ],
    theme: THEMES.lsd,
  },
  {
    activeDuration: null, // Not FDA-approved for medical use
    displayName: 'MDMA',
    id: 'mdma',
    parser: {
      extractDose: (match: string) => {
        const patterns = [
          /(\d+)mg\s+[Mm][Dd][Mm][Aa]/i,
          /[Mm][Dd][Mm][Aa]\s*(\d+)mg/i,
          /~?\s*(\d+)mg\s+MDMA/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            return {amount: parseInt(result[1]), unit: 'mg'};
          }
        }

        return null;
      },
      patterns: [/mdma/i],
    },
    standardDoses: [
      {amount: 200, label: '200mg', unit: 'mg'},
      {amount: 220, label: '220mg', unit: 'mg'},
      {amount: 250, label: '250mg', unit: 'mg'},
      {amount: 350, label: '350mg', unit: 'mg'},
    ],
    theme: THEMES.mdma,
  },
  {
    activeDuration: null, // Requires specialized medical monitoring
    displayName: 'Ketamine',
    id: 'ketamine',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /(\d+)mg\s+Ketamine/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Ketamine/i],
    },
    standardDoses: [
      {amount: 50, label: '50mg', unit: 'mg'},
      {amount: 100, label: '100mg', unit: 'mg'},
      {amount: 150, label: '150mg', unit: 'mg'},
      {amount: 200, label: '200mg', unit: 'mg'},
    ],
    theme: THEMES.ketamine,
  },

  // Nausea
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/020103s035lbl.pdf',
      ],
      halfLife: 3.5,
      max: 8,
      min: 4,
      notes: 'Ondansetron half-life 3-5 hours',
      typical: 8,
    },
    displayName: 'Zofran',
    id: 'ondansetron',
    parser: {
      extractDose: (match: string) => {
        // Match "Zofran ODT 8mg (2 tablets)" or "Ondansetron 8mg (Zofran)"
        const patterns = [
          /(?:Zofran|Ondansetron).*?(\d+)mg.*?\((\d+) tablets?\)/i,
          /(?:Zofran|Ondansetron).*?(\d+)mg/i,
        ];

        for (const pattern of patterns) {
          const result = pattern.exec(match);
          if (result) {
            if (result[2]) {
              const mgPerTablet = parseInt(result[1]);
              const tabletCount = parseInt(result[2]);
              return {amount: mgPerTablet * tabletCount, unit: 'mg'};
            } else {
              return {amount: parseInt(result[1]), unit: 'mg'};
            }
          }
        }

        return null;
      },
      patterns: [/Zofran/i, /Ondansetron/i],
    },
    standardDoses: [
      {amount: 4, label: '4mg', unit: 'mg'},
      {amount: 8, label: '8mg', unit: 'mg'},
      {amount: 16, label: '16mg (2 tablets)', unit: 'mg'},
    ],
    theme: THEMES.ondansetron,
  },

  // GI medications
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2011/019462s037lbl.pdf',
      ],
      halfLife: 3,
      notes: 'H2 receptor antagonist, typically dosed once or twice daily',
      typical: 24,
    },
    displayName: 'Famotidine',
    id: 'famotidine',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Famotidine\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Famotidine/i],
    },
    standardDoses: [{amount: 20, label: '20mg', unit: 'mg'}],
    theme: THEMES.famotidine,
  },
  {
    activeDuration: {
      citations: [
        'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7d0e5d91-388e-42de-abba-a38e088e6d78',
      ],
      notes: 'Antacid/alginate, provides symptom relief for up to 4 hours',
      typical: 4,
    },
    displayName: 'Gaviscon',
    id: 'gaviscon',
    parser: {
      extractDose: (match: string) => {
        if (/Gaviscon/i.test(match)) {
          return {amount: 1, unit: 'dose'};
        }
        return null;
      },
      patterns: [/Gaviscon/i],
    },
    standardDoses: [{amount: 1, label: '2-4 tsp', unit: 'dose'}],
    theme: THEMES.gaviscon,
  },

  // Muscle relaxants
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2003/017821s045lbl.pdf',
      ],
      halfLife: 18,
      notes: 'Cyclobenzaprine, typically dosed three times daily',
      typical: 8,
    },
    displayName: 'Flexeril',
    id: 'flexeril',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Flexeril\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Flexeril/i],
    },
    standardDoses: [{amount: 5, label: '5mg', unit: 'mg'}],
    theme: THEMES.flexeril,
  },

  // Topical
  {
    activeDuration: null, // Topical application - systemic duration not applicable
    displayName: 'Diclofenac Gel',
    id: 'diclofenac',
    parser: {
      extractDose: (match: string) => {
        if (/Diclofenac/i.test(match)) {
          return {amount: 1, unit: 'application'};
        }
        return null;
      },
      patterns: [/Diclofenac/i],
    },
    standardDoses: [{amount: 1, label: '1 application', unit: 'application'}],
    theme: THEMES.diclofenac,
  },

  // Other medications
  {
    activeDuration: null, // Pseudoephedrine - requires more research
    displayName: 'Sudafed',
    id: 'sudafed',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Sudafed.*?(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Sudafed/i],
    },
    standardDoses: [{amount: 10, label: '10mg', unit: 'mg'}],
    theme: THEMES.sudafed,
  },
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/020641s025lbl.pdf',
      ],
      halfLife: 8,
      notes: 'Non-sedating antihistamine, once daily dosing',
      typical: 24,
    },
    displayName: 'Loratadine',
    id: 'loratadine',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /(?:Loratadine|Loratidine|Claritin)\s*(\d+)mg/i.exec(
          match,
        );
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Loratadine/i, /Loratidine/i, /Claritin/i],
    },
    standardDoses: [{amount: 10, label: '10mg', unit: 'mg'}],
    theme: THEMES.loratidine,
  },
  {
    activeDuration: null, // Guaifenesin - duration varies by formulation
    displayName: 'Mucinex',
    id: 'mucinex',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Mucinex.*?(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Mucinex/i, /guaifenesin/i],
    },
    standardDoses: [{amount: 1200, label: '1200mg', unit: 'mg'}],
    theme: THEMES.mucinex,
  },
  {
    activeDuration: null, // Polyethylene glycol - laxative effect timing varies
    displayName: 'Miralax',
    id: 'miralax',
    parser: {
      extractDose: (match: string) => {
        const gMatch = /Miralax\s*(\d+)g/i.exec(match);
        if (gMatch) {
          return {amount: parseInt(gMatch[1]), unit: 'g'};
        }
        return null;
      },
      patterns: [/Miralax/i],
    },
    standardDoses: [{amount: 34, label: '34g (2 capfuls)', unit: 'g'}],
    theme: THEMES.miralax,
  },

  // Supplements
  {
    activeDuration: null, // Supplement - not applicable for acute dosing
    displayName: 'Omega-3',
    id: 'omega3',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /(\d+)mg\s+Omega-3/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Omega-3/i],
    },
    standardDoses: [{amount: 1040, label: '1040mg', unit: 'mg'}],
    theme: THEMES.omega3,
  },

  // Vaccines (informational only)
  {
    activeDuration: null,
    displayName: 'Flu Vaccine',
    id: 'flu_vaccine',
    parser: {
      extractDose: (match: string) => {
        if (/Flu shot|Flu vaccine/i.test(match)) {
          return {amount: 1, unit: 'dose'};
        }
        return null;
      },
      patterns: [/Flu shot/i, /Flu vaccine/i],
    },
    standardDoses: [{amount: 1, label: '1 dose', unit: 'dose'}],
    theme: THEMES.flu_vaccine,
  },
  {
    activeDuration: null,
    displayName: 'COVID Vaccine',
    id: 'covid_vaccine',
    parser: {
      extractDose: (match: string) => {
        if (/Covid shot|Covid vaccine/i.test(match)) {
          return {amount: 1, unit: 'dose'};
        }
        return null;
      },
      patterns: [/Covid shot/i, /Covid vaccine/i],
    },
    standardDoses: [{amount: 1, label: '1 dose', unit: 'dose'}],
    theme: THEMES.covid_vaccine,
  },
  {
    activeDuration: null,
    displayName: 'Hep B Vaccine',
    id: 'hep_vaccine',
    parser: {
      extractDose: (match: string) => {
        if (/Hep B/i.test(match)) {
          return {amount: 1, unit: 'dose'};
        }
        return null;
      },
      patterns: [/Hep B/i],
    },
    standardDoses: [{amount: 1, label: '1 dose', unit: 'dose'}],
    theme: THEMES.hep_vaccine,
  },

  // Alcohol
  {
    activeDuration: null, // Ethanol - complex metabolism, varies by amount
    displayName: 'Alcohol',
    id: 'alcohol',
    parser: {
      extractDose: (match: string) => {
        if (/Alcohol/i.test(match)) {
          return {amount: 1, unit: 'drink'};
        }
        return null;
      },
      patterns: [/Alcohol/i],
    },
    standardDoses: [{amount: 1, label: '1 drink', unit: 'drink'}],
    theme: THEMES.alcohol,
  },

  // Gabapentin (was in original)
  {
    activeDuration: {
      citations: [
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/020235s064_020882s047_021129s046lbl.pdf',
      ],
      halfLife: 6,
      max: 8,
      min: 5,
      notes: 'Typically dosed three times daily',
      typical: 8,
    },
    displayName: 'Gabapentin',
    id: 'gabapentin',
    parser: {
      extractDose: (match: string) => {
        const mgMatch = /Gabapentin\s*(\d+)mg/i.exec(match);
        if (mgMatch) {
          return {amount: parseInt(mgMatch[1]), unit: 'mg'};
        }
        return null;
      },
      patterns: [/Gabapentin/i, /Neurontin/i],
    },
    standardDoses: [
      {amount: 300, label: '1 capsule', unit: 'mg'},
      {amount: 600, label: '2 capsules', unit: 'mg'},
    ],
    theme: THEMES.gabapentin,
  },
];

// Export centralized medication list
export const CENTRALIZED_MEDICATIONS = MEDICATIONS;

// Helper function to get medication by ID
export function getMedicationById(id: string): VisualizationMedication | null {
  return MEDICATIONS.find((med) => med.id === id) ?? null;
}

// Helper function to parse medication from text
export function parseMedicationFromText(text: string): {
  dose: {amount: number; unit: string} | null;
  medication: VisualizationMedication;
} | null {
  for (const medication of MEDICATIONS) {
    for (const pattern of medication.parser.patterns) {
      // TODO: Why do we have both patterns AND parsers? Let's consolidate to parsers.
      if (pattern.test(text)) {
        const dose = medication.parser.extractDose(text);
        return {dose, medication};
      }
    }
  }
  return null;
}

// Legacy config structure (commented out as requested)
// const justinConfig: UserMedicationConfig = {
//   globalLimits: [
//     {
//       ingredientName: 'acetaminophen',
//       maxAmount: 4000,
//       unit: 'mg',
//       windowHours: 24,
//     },
//   ],
//   visualizedMedications: MEDICATIONS,
// };

// const kesaConfig: UserMedicationConfig = {
//   globalLimits: [
//     {
//       ingredientName: 'acetaminophen',
//       maxAmount: 4000,
//       unit: 'mg',
//       windowHours: 24,
//     },
//   ],
//   visualizedMedications: MEDICATIONS,
// };

// Temporary unified config for both users
const unifiedConfig: UserMedicationConfig = {
  globalLimits: [
    {
      ingredientName: 'acetaminophen',
      maxAmount: 4000,
      unit: 'mg',
      windowHours: 24,
    },
  ],
  visualizedMedications: MEDICATIONS,
};

export const MEDICATION_CONFIG: MedicationVisualizationConfig = {
  users: {
    justin: unifiedConfig,
    kesa: unifiedConfig,
    // justin: justinConfig,
    // kesa: kesaConfig,
  },
};

// Helper to get config for current user
export function getUserMedicationConfig(
  userId: string,
): UserMedicationConfig | null {
  return MEDICATION_CONFIG.users[userId] ?? null;
}
