/**
 * AI Pet-Care Assistant Service (Supports Google Gemini & OpenRouter)
 * Includes clinical disclaimers and structured prompts.
 */
const { query } = require('../config/db');

const VET_DISCLAIMER = "\n\n⚠️ *Clinical Disclaimer: PetCare Passport AI is an educational reference tool only and is not a licensed veterinarian. It cannot diagnose illnesses, interpret medical emergencies, or prescribe medications and dosages. If your pet shows acute signs of distress (lethargy, respiratory difficulty, collapse, bleeding, or acute pain), contact an emergency veterinary hospital immediately.*";

async function generatePetCareResponse({
  prompt,
  petContext = null,
  topic = 'general'
}) {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct';

  const systemPrompt = `You are the PetCare Passport AI Assistant, an empathetic, highly knowledgeable pet care advisor.
Role & Ethical Guidelines:
1. Provide practical, accurate, evidence-based pet care guidance (nutrition, grooming, behavioral enrichment, routine wellness, questions to ask the vet, vet visit preparation).
2. NEVER diagnose medical conditions or interpret symptoms as a definitive diagnosis.
3. NEVER prescribe drug dosages or recommend prescription medication changes.
4. Always recommend consulting a licensed veterinarian for medical issues or physical examinations.
5. Emphasize preventative health care, scheduled vaccinations, and dental hygiene.
${petContext ? `\nPet Profile Context:\nName: ${petContext.name}\nSpecies: ${petContext.species}\nBreed: ${petContext.breed || 'Unknown'}\nAge: ${petContext.dob_or_age || 'Unknown'}\nKnown Allergies: ${petContext.allergies || 'None'}\nConditions: ${petContext.medical_conditions || 'None'}` : ''}`;

  const userQuery = `${systemPrompt}\n\nUser Question: ${prompt}`;

  // Try Google Gemini if configured
  if (provider === 'gemini' && geminiKey && geminiKey.trim() !== '') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return {
            success: true,
            provider: 'gemini',
            model: geminiModel,
            answer: text + VET_DISCLAIMER
          };
        }
      }
    } catch (err) {
      console.warn('[AIService] Gemini request failed, using intelligent advisor engine:', err.message);
    }
  }

  // Try OpenRouter if configured
  if ((provider === 'openrouter' || (!geminiKey && openRouterKey)) && openRouterKey && openRouterKey.trim() !== '') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://petcarepassport.local',
          'X-Title': 'PetCare Passport'
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          return {
            success: true,
            provider: 'openrouter',
            model: openRouterModel,
            answer: text + VET_DISCLAIMER
          };
        }
      }
    } catch (err) {
      console.warn('[AIService] OpenRouter request failed, using intelligent advisor engine:', err.message);
    }
  }

  // Intelligent fallback expert engine: produces rich, structured, domain-specific guidance
  return {
    success: true,
    provider: 'local-knowledge-engine',
    model: 'PetCare Knowledge Engine v1.0',
    answer: generateLocalCareGuidance(prompt, petContext) + VET_DISCLAIMER
  };
}

function generateLocalCareGuidance(prompt, petContext) {
  const p = prompt.toLowerCase();
  const petName = petContext ? petContext.name : 'your pet';
  const species = petContext ? petContext.species : 'pet';

  if (p.includes('vet') || p.includes('appointment') || p.includes('prepare') || p.includes('checklist')) {
    return `### 📋 Comprehensive Vet Visit Preparation Checklist for ${petName}

1. **Medical History & Health Log:**
   - Bring your PetCare Passport digital records or QR passport showing up-to-date vaccinations and recent treatments.
   - Note any changes in appetite, water consumption, energy levels, or litter box / bathroom habits over the past 14 days.

2. **Medication & Supplement Review:**
   - Note down all active medications (e.g., ${petContext?.current_medications || 'supplements or preventative treatments'}).
   - Check flea, tick, and heartworm preventative renewal dates.

3. **Key Questions to Ask Your Veterinarian:**
   - *"Is ${petName}'s current weight optimal for their age and frame?"*
   - *"Are there any breed-specific wellness screenings we should plan for this year?"*
   - *"What is our vaccination booster schedule for the next 6 to 12 months?"*
   - *"How do ${petName}'s teeth and gums look, and do you recommend a dental prophylaxis cleaning?"*

4. **Stress-Reduction Tips for Transport:**
   - Use a sturdy carrier lined with familiar bedding for cats and small dogs.
   - Avoid heavy meals 2 hours prior to transport to prevent car sickness.`;
  }

  if (p.includes('vaccin') || p.includes('shot') || p.includes('booster')) {
    return `### 💉 Understanding Routine Vaccination Protocols for ${petName}

Vaccinations protect ${species.toLowerCase()}s from debilitating and fatal infectious pathogens:

1. **Core Canine Vaccines:**
   - **Rabies:** Legally mandated in most jurisdictions. Typically administered at 12-16 weeks, boosted at 1 year, then every 1 to 3 years.
   - **DHPP / DA2PP:** Protects against Distemper, Hepatitis (Adenovirus), Parvovirus, and Parainfluenza.
2. **Core Feline Vaccines:**
   - **FVRCP:** Protects against Feline Viral Rhinotracheitis, Calicivirus, and Panleukopenia (feline distemper).
   - **Rabies:** Recommended for all cats, even indoor companions.
3. **Non-Core / Lifestyle Vaccines:**
   - Bordetella (kennel cough), Leptospirosis, and Lyme disease for dogs visiting daycare, boarding, or wooded areas.
   - Feline Leukemia Virus (FeLV) for cats with outdoor access.

*Check your PetCare Passport Vaccinations tab to view your exact entered due dates.*`;
  }

  if (p.includes('diet') || p.includes('food') || p.includes('feed') || p.includes('nutrition')) {
    return `### 🥗 Nutrition & Feeding Guidelines for ${petName}

1. **Balanced Life-Stage Nutrition:**
   - Choose complete and balanced diets formulated for ${petName}'s specific life stage (puppy/kitten, adult, or senior).
   - Look for diets adhering to AAFCO (Association of American Feed Control Officials) nutritional adequacy standards.

2. **Hydration & Portion Control:**
   - Measure daily portions with a standard measuring cup or kitchen scale to prevent obesity.
   - Provide fresh, clean drinking water at all times; cat water fountains can encourage better feline hydration.

3. **Foods Toxic to Pets (Never Feed):**
   - Chocolate, cocoa, caffeine, xylitol / birch sugar (extremely toxic to dogs).
   - Onions, garlic, chives, leeks (causes red blood cell damage).
   - Grapes, raisins, macadamia nuts, and bread dough with active yeast.`;
  }

  // General pet care overview
  return `### 🐾 Practical Care & Wellness Recommendations for ${petName}

Thank you for prioritizing ${petName}'s health and comfort! Here are evidence-based wellness guidelines tailored to ${species.toLowerCase()}s:

1. **Routine Preventative Health:**
   - Schedule annual wellness exams (semi-annual for seniors over 7 years).
   - Maintain year-round parasite prevention (fleas, ticks, and intestinal worms).
   - Ensure your digital passport QR code is updated with emergency contact details.

2. **Daily Enrichment & Activity:**
   - Provide daily mental stimulation (puzzle toys, scent work, or interactive feather wands).
   - Maintain a predictable daily routine for feeding, exercise, and rest.

3. **Monitoring Vitals & Subtle Signs of Discomfort:**
   - Watch for changes in posture, coat luster, water consumption, or bathroom habits.
   - Use PetCare Passport's Daily Care Tracker to stay consistent with grooming, coat checks, and supplements.`;
}

module.exports = {
  generatePetCareResponse,
  VET_DISCLAIMER
};
