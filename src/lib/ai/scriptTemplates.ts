// ============================================================================
// EstateFlow CRM — Hinglish/English AI Script Templates
// Phase 3: AI Voice Agent — Script Template System
// ============================================================================
//
// Six call scenarios with rich Hinglish (Hindi + English) variants:
//   1. firstContact   — Initial outreach to fresh leads
//   2. followUp       — Follow-up after N days of no contact
//   3. siteVisitConfirm — Confirm a scheduled site visit
//   4. postVisit      — Post-site-visit feedback & next steps
//   5. negotiation    — Price negotiation & deal discussion
//   6. reEngagement   — Re-engage stale / cold leads
//
// Each scenario provides three tone variants:
//   - professional  — formal, respectful, trust-building
//   - friendly      — warm, conversational, rapport-building
//   - urgent        — time-sensitive, FOMO-triggering, action-driving
//
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScriptTemplateVariant {
  /** Hinglish (Hindi + English) version of the script */
  hinglish: string;
  /** Pure English version of the script */
  english: string;
}

export interface ScriptTemplateVariable {
  /** Variable name (used in {{mustache}} format) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this variable is required for the template to work properly */
  required: boolean;
  /** Optional default value if not provided */
  defaultValue?: string;
}

export interface ScriptToneMetadata {
  /** Friendly label for the tone variant */
  label: string;
  /** Brief description of when to use this tone */
  whenToUse: string;
}

export interface ScriptScenarioMetadata {
  /** Display name for the scenario */
  name: string;
  /** Short description of the scenario */
  description: string;
  /** Human-readable scenario key */
  key: string;
  /** All variables used across all variants of this scenario */
  variables: ScriptTemplateVariable[];
  /** Tone variant descriptions */
  tones: {
    professional: ScriptToneMetadata;
    friendly: ScriptToneMetadata;
    urgent: ScriptToneMetadata;
  };
  /** Recommended lead score range for using this scenario */
  recommendedScoreRange: {
    min: number;
    max: number;
  };
  /** Estimated call duration in seconds (per variant) */
  estimatedDurationSeconds: {
    professional: number;
    friendly: number;
    urgent: number;
  };
}

export interface ScriptTemplateEntry {
  /** Metadata about this scenario */
  metadata: ScriptScenarioMetadata;
  /** The three tone variants with Hinglish + English */
  variants: {
    professional: ScriptTemplateVariant;
    friendly: ScriptTemplateVariant;
    urgent: ScriptTemplateVariant;
  };
}

export type ScriptTemplatesMap = Record<string, ScriptTemplateEntry>;

// ---------------------------------------------------------------------------
// Helper to build a scenario entry
// ---------------------------------------------------------------------------

function scenario(
  key: string,
  name: string,
  description: string,
  variables: ScriptTemplateVariable[],
  professional: ScriptTemplateVariant,
  friendly: ScriptTemplateVariant,
  urgent: ScriptTemplateVariant,
  scoreMin: number = 0,
  scoreMax: number = 100,
  profDuration: number = 120,
  friendlyDuration: number = 90,
  urgentDuration: number = 60,
): ScriptTemplateEntry {
  return {
    metadata: {
      key,
      name,
      description,
      variables,
      tones: {
        professional: {
          label: 'Professional',
          whenToUse: 'High-value leads, senior prospects, first impressions',
        },
        friendly: {
          label: 'Friendly',
          whenToUse: 'Warm leads, repeat contacts, relationship building',
        },
        urgent: {
          label: 'Urgent',
          whenToUse: 'Hot leads, limited-time offers, expiry-bound deals',
        },
      },
      recommendedScoreRange: { min: scoreMin, max: scoreMax },
      estimatedDurationSeconds: {
        professional: profDuration,
        friendly: friendlyDuration,
        urgent: urgentDuration,
      },
    },
    variants: { professional, friendly, urgent },
  };
}

// ---------------------------------------------------------------------------
// SCENARIO 1: firstContact — Initial outreach to fresh leads
// ---------------------------------------------------------------------------

const _firstContact = scenario(
  'firstContact',
  'First Contact',
  'Initial outreach to a new lead who just enquired about a property. Focus on understanding requirements and building rapport.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'source', description: 'Where the lead came from (website, OLX, MagicBricks, 99acres, reference)', required: false, defaultValue: 'website' },
    { name: 'property_types', description: 'Types of property the lead is interested in (e.g., 2BHK, 3BHK, villa, plot)', required: false, defaultValue: 'residential property' },
    { name: 'budget', description: 'Lead budget range or amount', required: false, defaultValue: 'your budget' },
    { name: 'location', description: 'Preferred location(s) for the property', required: false, defaultValue: 'your preferred area' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, मैं {{agent_name}} बोल रही हूँ, {{company_name}} से।
      
Aapne {{source}} par property ke liye enquiry ki thi na? Bahut dhanyavad aapki interest ke liye.

Main aapki madad kar sakti hoon sahi property dhundhne mein. Kya aap mujhe bata sakte hain:
— Kis type ki property chahiye? Jaise {{property_types}}?
— Kya aapka koi preferred location hai — {{location}} mein?
— Aur aapka budget kya hai?

Main aapki requirements ke hisaab se kuch best options suggest kar sakti hoon. Kya main aapse 2 minute baat kar sakti hoon?`,
    english:
      `Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}.

You recently enquired about a property on {{source}}. Thank you for your interest.

I can help you find the right property. Could you tell me:
— What type of property are you looking for — {{property_types}}?
— Do you have any preferred location in {{location}}?
— And what is your budget?

I can suggest the best options based on your requirements. May I take 2 minutes of your time?`,
  },
  // Friendly variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Kaise hain aap? Main {{agent_name}} bol rahi hoon {{company_name}} se.

Aapne to {{source}} par property dekhi thi na? Achha, main soch rahi thi ki aapko kya chahiye exactly.

Batao na — kaisi property chahte ho? {{property_types}} ya kuch aur? Koi area pasand hai {{location}} mein? Aur haan, budget kya socha hai aapne?

Fikar mat karo, main aapke budget mein best property dhundh ke dungi. Bas 2 minute do mujhe, aapko kuch achha dikha dungi!`,
    english:
      `Hi {{lead_name}}! How are you? This is {{agent_name}} from {{company_name}}.

You saw a property on {{source}}, right? I was thinking about what exactly you need.

Tell me — what kind of property do you want? {{property_types}} or something else? Any preferred area in {{location}}? And yes, what budget have you planned?

Don't worry, I'll find the best property within your budget. Just give me 2 minutes, I'll show you something good!`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} {{company_name}} se bol rahi hoon. Aapne abhi abhi {{source}} par property enquiry ki thi — urgent update hai!

Hamare paas {{location}} mein kuch limited-period offers hain jo shayad kal tak hi available hain. {{property_types}} mein kamaal ke deals hain aapke budget ke andar.

Agar aapko property leni hai toh jaldi decision lena padega. Kya main aapko details bhej doon? Ya main abhi samjha doon — bas 1 minute!`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}} from {{company_name}}. You just enquired on {{source}} — I have an urgent update!

We have some limited-period offers in {{location}} that may only be available until tomorrow. Great deals in {{property_types}} within your budget.

If you want a property, you'll need to decide quickly. Should I send you the details? Or let me explain right now — just 1 minute!`,
  },
  0,   // score min
  100, // score max — all fresh leads
  150, // prof duration
  120, // friendly duration
  60,  // urgent duration
);

// ---------------------------------------------------------------------------
// SCENARIO 2: followUp — Follow-up after N days of no contact
// ---------------------------------------------------------------------------

const _followUp = scenario(
  'followUp',
  'Follow-Up',
  'Follow up with a lead who contacted us a few days ago but hasn\'t converted yet. Re-ignite interest.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'days_ago', description: 'Number of days since last contact or enquiry', required: true, defaultValue: '3' },
    { name: 'previous_interest', description: 'What the lead was interested in previously', required: false, defaultValue: 'property' },
    { name: 'n_offerings', description: 'New listings or options available', required: false, defaultValue: 'kuch naye options' },
    { name: 'location', description: 'Preferred location(s)', required: false, defaultValue: 'your area' },
    { name: 'budget', description: 'Lead budget', required: false, defaultValue: 'your budget' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, main {{agent_name}} bol rahi hoon {{company_name}} se.

Aapne {{days_ago}} din pehle hamari website par visit kiya tha aur {{previous_interest}} mein interest dikhaya tha. Kya aapko abhi bhi property dhundhni hai ya aapne decide kar liya?

Main sirf yeh batane ke liye call kar rahi hoon ki hamare paas kuch naye options aaye hain jo aapke budget mein fit ho sakte hain — specially {{location}} mein. Kya main aapko details bhej doon?

Aapka time waste nahi karungi — bas ek quick update dena chahti thi.`,
    english:
      `Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}.

You visited our website {{days_ago}} days ago and showed interest in {{previous_interest}}. Are you still looking for a property, or have you already decided?

I'm calling just to let you know we have some new options that might fit your budget — especially in {{location}}. Should I send you the details?

I won't waste your time — just wanted to give you a quick update.`,
  },
  // Friendly variant
  {
    hinglish:
      `Hi {{lead_name}} ji! Main {{agent_name}} {{company_name}} se bol rahi hoon. Yaad hai na?

Aapne {{days_ago}} din pehle {{previous_interest}} dekha tha. Uske baad se koi update nahi mila toh main soch rahi thi — shayad aap abhi bhi dhundh rahe hain?

Achha hua maine call kiya — hamare paas {{location}} mein kuch mazedar options aaye hain! Aur aapke budget ke hisaab se bhi hain. Kya main aapko WhatsApp par bhej doon?

Aur haan, koi tension nahi — agar aapne decide kar liya hai toh bhi bata do, main disturb nahi karungi.`,
    english:
      `Hi {{lead_name}}! This is {{agent_name}} from {{company_name}}. Remember me?

You looked at {{previous_interest}} {{days_ago}} days ago. I didn't hear from you after that, so I thought — maybe you're still looking?

Good thing I called — we've got some interesting new options in {{location}}! And they fit your budget too. Should I send them to you on WhatsApp?

And hey, no pressure — if you've already decided, just let me know and I won't bother you.`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} {{company_name}} se urgent baat kar rahi hoon.

Aapne {{days_ago}} din pehle hamare yahan enquiry ki thi. Main aaj isliye call kar rahi hoon kyunki {{location}} mein ek property hai jo aapki requirement se match karti hai — aur uspar special discount abhi available hai.

Lekin jaldi batao — kyuki yeh deal limited hai aur doosre log bhi interested hain. Kya main aapko details batadoon? Agar aapne interest dikhaya to main aapke liye hold karwa sakti hoon.

{{days_ago}} din mein market badal gaya hai — rates bhi badh sakte hain. Socho mat, abhi lo!`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}} from {{company_name}} with an urgent update.

You enquired with us {{days_ago}} days ago. I'm calling because there's a property in {{location}} matching your requirements — and it has a special discount available right now.

But tell me quickly — because this deal is limited and others are interested too. Should I share the details? If you show interest, I can hold it for you.

In {{days_ago}} days the market has changed — rates could go up. Don't think too much, grab it now!`,
  },
  21,  // score min — moderate to high scores for follow-up
  75,  // score max
  120, // prof duration
  100, // friendly duration
  50,  // urgent duration
);

// ---------------------------------------------------------------------------
// SCENARIO 3: siteVisitConfirm — Confirm a scheduled site visit
// ---------------------------------------------------------------------------

const _siteVisitConfirm = scenario(
  'siteVisitConfirm',
  'Site Visit Confirmation',
  'Confirm a scheduled property site visit. Provide location details and answer questions.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'time', description: 'Scheduled visit time', required: true, defaultValue: '11 AM' },
    { name: 'date', description: 'Scheduled visit date', required: false, defaultValue: 'kal' },
    { name: 'location', description: 'Property address / project name', required: true },
    { name: 'property_name', description: 'Name of the property being visited', required: false, defaultValue: 'the property' },
    { name: 'contact_number', description: 'On-site contact person number', required: false, defaultValue: 'our team member' },
    { name: 'documents', description: 'Documents to bring', required: false, defaultValue: 'ID proof' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, main {{agent_name}} {{company_name}} se bol rahi hoon.

Aapka site visit {{date}} ko {{time}} baje {{location}} par confirm hai. Location clear hai ya main aapko Google Maps link bhej doon?

Kripya {{documents}} saath le aayein agar aap serious hain to. Wahan hamare {{contact_number}} aapka swagat karenge.

Koi specific questions hain jo aap property ke baare mein poochna chahte hain? Jaise — floor plan, possession date, ya amenities ke baare mein? Main pehle se bata sakti hoon agar chahein to.

Dhanyavad! Visit ke baad main aapko zaroor follow-up karungi.`,
    english:
      `Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}.

Your site visit is confirmed for {{date}} at {{time}} at {{location}}. Is the location clear, or should I send you a Google Maps link?

Please bring {{documents}} along if you're serious. Our {{contact_number}} will welcome you there.

Do you have any specific questions about the property you'd like to ask? Like — floor plan, possession date, or amenities? I can answer them beforehand if you'd like.

Thank you! I will follow up with you after the visit.`,
  },
  // Friendly variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} bol rahi hoon.

Bas confirm kar rahi thi — aapka {{date}} ko {{time}} baje {{location}} par site visit pakka hai na? Achha!

Location aapko pata hai? Nahi pata to main Google Maps link bhej deti hoon WhatsApp par. Aise hi {{property_name}} bahut achhi property hai — aapko pasand aayegi!

Jo bhi documents chahiye, main list bhej deti hoon. Aur haan, garam paani saath rakhna, thoda ghoomna padega site par. 😊

Koi doubt ho to mujhe call kar lena. Bahut maza aayega!`,
    english:
      `Hi {{lead_name}}! This is {{agent_name}} calling.

Just confirming — your visit to {{location}} on {{date}} at {{time}} is confirmed, right? Great!

Do you know the location? If not, I'll send you a Google Maps link on WhatsApp. Trust me, {{property_name}} is a really nice property — you'll love it!

I'll send a list of documents you need. And yes, carry some water — you might need to walk around a bit. 😊

Any doubts, just call me. It'll be fun!`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} bol rahi hoon — urgent call hai!

Aapka {{date}} {{time}} baje {{location}} par site visit hai. Lekin main aapko warning dena chahti hoon — is property par doosre 3 log bhi interested hain. Agar aapko pasand aayi toh turant booking karni padegi.

Isliye {{documents}} aur token amount ready rakhna. Aaj hi deal final ho sakti hai agar aap ready hain to.

Time par pahunchiyega — deri hui to property kisi aur ko mil sakti hai. Kya aap confirm hain ki aa rahe hain?`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}} — urgent call!

Your site visit is scheduled at {{location}} on {{date}} at {{time}}. But I need to warn you — 3 other people are also interested in this property. If you like it, you'll need to book immediately.

So keep {{documents}} and a token amount ready. The deal could be finalized today if you're ready.

Please arrive on time — if you're late, someone else might take it. Can you confirm you're coming?`,
  },
  40,  // score min — only hot leads worth sending
  100, // score max
  90,  // prof duration
  75,  // friendly duration
  55,  // urgent duration
);

// ---------------------------------------------------------------------------
// SCENARIO 4: postVisit — Post-site-visit feedback & next steps
// ---------------------------------------------------------------------------

const _postVisit = scenario(
  'postVisit',
  'Post-Visit Follow-Up',
  'Follow up after a site visit. Gauge interest, answer questions, negotiate or move forward.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'property_name', description: 'Name of the visited property', required: true },
    { name: 'property_type', description: 'Type of property visited', required: false, defaultValue: 'property' },
    { name: 'location', description: 'Property location', required: false, defaultValue: 'the location' },
    { name: 'price', description: 'Current asking price', required: false, defaultValue: 'the current price' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, main {{agent_name}} {{company_name}} se bol rahi hoon.

Aapne kal {{property_name}} visit kiya tha. Main aapse feedback lena chahti thi — kaisi lagi aapko {{property_type}}?

Koi specific questions hain jo aapke man mein hain? Jaise — pricing, payment plan, amenities, ya legal documents ke baare mein? Main aapki saari confusion door kar sakti hoon.

Agar aapko pasand aayi hai, toh main aapki price negotiation mein bhi madad kar sakti hoon. Kya aap aage badhna chahenge? Agar haan, toh main aapko next steps bata doon.

Aapke time ka shukriya.`,
    english:
      `Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}.

You visited {{property_name}} yesterday. I wanted to get your feedback — how did you find the {{property_type}}?

Do you have any specific questions on your mind? Like — pricing, payment plan, amenities, or legal documentation? I can clear up all your confusion.

If you liked it, I can also help you with price negotiation. Would you like to move forward? If yes, I can walk you through the next steps.

Thank you for your time.`,
  },
  // Friendly variant
  {
    hinglish:
      `Hi {{lead_name}} ji! Main {{agent_name}} bol rahi hoon. Batao, {{property_name}} kaisi lagi?

Mujhe ummeed hai ki aapko visit achha laga hoga. Kya aapko woh spacious living room pasand aaya? Aur location kaise lagi?

Koi sawaal ho to poochho — main yahi hoon. Agar aap interested ho, toh main owner se baat kar ke aapke liye best price la sakti hoon. Aap bas haan bolo!

Aur haan, agar nahi pasand aayi toh bhi koi baat nahi — hamare paas {{location}} mein aur bhi options hain jo aapko pasand aa sakte hain.`,
    english:
      `Hi {{lead_name}}! This is {{agent_name}} calling. So, how did you find {{property_name}}?

I hope you enjoyed the visit. Did you like the spacious living room? And how was the location?

If you have any questions, ask away — I'm right here. If you're interested, I can talk to the owner and get you the best price. Just say yes!

And hey, if you didn't like it — no problem at all! We have more options in {{location}} that you might like.`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}}. Aapne kal {{property_name}} visit kiya tha — urgent feedback chahiye.

Baat yeh hai ki is property par ek aur family ne bhi interest dikhaya hai. Agar aapko pasand aayi hai toh humein aaj hi decide karna hoga.

Price {{price}} hai, lekin main owner se baat kar ke thoda discount dilwa sakti hoon — agar aap aaj token amount de rahe hain to.

Socho mat — aisi property {{location}} mein milna mushkil hai. Kya main aapke liye hold kar doon? Haan ya naa, batao!`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}}. You visited {{property_name}} yesterday — I need urgent feedback.

Another family has also shown interest in this property. If you liked it, we need to decide today.

The price is {{price}}, but I can negotiate a discount with the owner — if you pay the token amount today.

Don't overthink — it's hard to find a property like this in {{location}}. Should I hold it for you? Yes or no, tell me!`,
  },
  50,  // score min — only qualified leads who actually visited
  100, // score max
  120, // prof duration
  100, // friendly duration
  60,  // urgent duration
);

// ---------------------------------------------------------------------------
// SCENARIO 5: negotiation — Price negotiation & deal discussion
// ---------------------------------------------------------------------------

const _negotiation = scenario(
  'negotiation',
  'Negotiation & Deal',
  'Discuss pricing, negotiate terms, and close the deal. Handle objections and offer discounts.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'property_name', description: 'Name of the property under negotiation', required: true },
    { name: 'price', description: 'Current asking price (formatted, e.g., ₹85,00,000)', required: true },
    { name: 'budget', description: "Lead's budget (formatted)", required: true },
    { name: 'max_discount', description: 'Maximum possible discount percentage', required: false, defaultValue: '5' },
    { name: 'token_amount', description: 'Token amount for booking', required: false, defaultValue: '₹50,000' },
    { name: 'emi_option', description: 'EMI option available', required: false, defaultValue: 'affordable EMI' },
    { name: 'location', description: 'Property location', required: false, defaultValue: 'the area' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, main {{agent_name}} {{company_name}} se bol rahi hoon.

Aapne {{property_name}} mein interest dikhaya tha. Main aapke saath pricing aur terms par discuss karna chahti hoon.

Property ka price {{price}} hai aur aapka budget {{budget}} hai. Main owner se baat kar ke aapke liye ek best deal la sakti hoon. Maximum {{max_discount}}% discount possible hai — but iske liye aapko aaj confirm karna hoga.

Aur haan, payment options bhi flexible hain — {{emi_option}} bhi available hai. Kya aap token amount {{token_amount}} dekar property hold karwana chahenge?

Main aapki taraf se poora support karungi. Aapka kya kehna hai?`,
    english:
      `Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}.

You showed interest in {{property_name}}. I'd like to discuss the pricing and terms with you.

The property price is {{price}} and your budget is {{budget}}. I can talk to the owner and get you the best deal. A maximum of {{max_discount}}% discount is possible — but you'd need to confirm today to avail it.

And yes, payment options are flexible — {{emi_option}} is also available. Would you like to pay a token amount of {{token_amount}} to hold the property?

I'll support you all the way. What do you say?`,
  },
  // Friendly variant
  {
    hinglish:
      `Hi {{lead_name}} ji! Main {{agent_name}} bol rahi hoon. Chaliye, {{property_name}} ki baat karte hain!

Dekho, property ka price {{price}} hai aur aapka budget {{budget}} hai. Dono mein thoda gap hai na? Main owner se baat kar sakti hoon. Mera unke saath achha relationship hai — shayad main aapke liye {{max_discount}}% discount nikalwa doon!

Aur tension mat lo — aap token amount {{token_amount}} dekar property hold karwa sakte hain. Baad mein loan ya EMI bhi arrange kar sakte hain.

Mujhe bharosa hai ki hum kuch na kuch final kar lenge. Aap batao — kya karna chahenge?`,
    english:
      `Hi {{lead_name}}! This is {{agent_name}} calling. Let's talk about {{property_name}}!

Look, the property price is {{price}} and your budget is {{budget}}. There's a gap, right? I can talk to the owner. I have a good relationship with them — maybe I can get you a {{max_discount}}% discount!

And don't worry — you can hold the property by paying a token amount of {{token_amount}}. You can arrange for a loan or EMI later.

I'm confident we can work something out. What would you like to do?`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} — {{property_name}} ki deal ka last call hai.

Price {{price}} hai, aapka budget {{budget}} hai. Main seedha baat karti hoon — owner ko maine samjha liya hai. Agar aap aaj token amount {{token_amount}} de dete hain, toh main {{max_discount}}% discount dilwa sakti hoon. Lekin yeh kal tak nahi chalega — aaj ka offer hai.

Aur bata doon — ek aur party bhi deal ke liye ready hai. Agar aapne aaj nahi liya, to kal property unki ho sakti hai.

Aap life mein ek baar property lete hain — sahi decision lo. Kya main aapke liye deal final kar doon?`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}} — this is the last call about the {{property_name}} deal.

The price is {{price}}, your budget is {{budget}}. Let me be direct — I've convinced the owner. If you pay the token amount {{token_amount}} today, I can get you a {{max_discount}}% discount. But this won't last till tomorrow — it's today's offer.

And I should tell you — another party is also ready to deal. If you don't take it today, the property could be theirs tomorrow.

You buy a property once in your life — make the right decision. Should I finalize the deal for you?`,
  },
  60,  // score min — high scores only for negotiation
  100, // score max
  150, // prof duration — negotiation takes time
  130, // friendly duration
  75,  // urgent duration
);

// ---------------------------------------------------------------------------
// SCENARIO 6: reEngagement — Re-engage stale / cold leads
// ---------------------------------------------------------------------------

const _reEngagement = scenario(
  'reEngagement',
  'Re-Engagement',
  'Re-engage stale leads who haven\'t responded in months. Warm re-introduction with fresh offerings.',
  [
    { name: 'lead_name', description: 'Full name of the lead', required: true },
    { name: 'agent_name', description: "AI agent's name", required: true },
    { name: 'company_name', description: 'Real estate company or tenant name', required: true },
    { name: 'months_ago', description: 'Number of months since last contact', required: true, defaultValue: '3' },
    { name: 'previous_interest', description: "What the lead enquired about before", required: false, defaultValue: 'property' },
    { name: 'new_listings', description: 'New property listings available', required: false, defaultValue: 'kafi naye options' },
    { name: 'location', description: 'Preferred location', required: false, defaultValue: 'your area' },
    { name: 'market_update', description: 'Market trend / price update', required: false, defaultValue: 'market achha hai' },
  ],
  // Professional variant
  {
    hinglish:
      `नमस्ते {{lead_name}} जी, bahut din baad! Main {{agent_name}} bol rahi hoon {{company_name}} se.

Aapne {{months_ago}} mahine pehle {{previous_interest}} ke liye enquiry ki thi main aapko yaad dilaa doon. Uss samay shayad timing sahi nahi thi ya aapko kuch aur chahiye tha.

Ab main yeh batane ke liye call kar rahi hoon ki hamare paas kuch naye options aaye hain — {{location}} mein {{new_listings}} hain jo budget-friendly bhi hain. Aur {{market_update}} — abhi invest karne ka achha time hai.

Kya main aapko latest listings bhej doon WhatsApp par? Ho sakta hai is baar kuch achha mil jaaye.`,
    english:
      `Hello {{lead_name}}, long time! This is {{agent_name}} from {{company_name}}.

You enquired about {{previous_interest}} {{months_ago}} months ago — just refreshing your memory. Perhaps the timing wasn't right then, or you were looking for something else.

I'm calling to let you know we have some new options — {{new_listings}} in {{location}} that are budget-friendly. And {{market_update}} — it's a good time to invest now.

Should I send you the latest listings on WhatsApp? Maybe this time we'll find something good.`,
  },
  // Friendly variant
  {
    hinglish:
      `Hi {{lead_name}} ji! Bahut din baad! Main {{agent_name}} {{company_name}} se bol rahi hoon. Kya haal chaal?

Yaad hai aapne {{months_ago}} mahine pehle humse baat ki thi {{previous_interest}} ke liye? Uske baad maine aapko disturb nahi kiya kyunki main chahti thi ki jab sahi time aaye tab baat karein.

Aur ab sahi time aa gaya hai! {{location}} mein kamaal ke naye options aaye hain — aur prices bhi reasonable hain. Market abhi stable hai aur {{new_listings}} hain.

Kya main aapko photos aur details bhej doon? Bina pressure ke, bus dekho — pasand aaye to aage badho!`,
    english:
      `Hi {{lead_name}}! Long time! This is {{agent_name}} from {{company_name}}. How have you been?

Remember, you spoke with us {{months_ago}} months ago about {{previous_interest}}? I didn't disturb you after that because I wanted to wait for the right time.

And now the right time has come! Amazing new options in {{location}} — and prices are reasonable too. The market is stable now, and {{new_listings}} are available.

Should I send you photos and details? No pressure — just take a look, and if you like it, move forward!`,
  },
  // Urgent variant
  {
    hinglish:
      `Namaste {{lead_name}} ji! Main {{agent_name}} {{company_name}} se.

Bahut din baad call kar rahi hoon — {{months_ago}} mahine ho gaye! Aapne {{previous_interest}} mein interest dikhaya tha aur main aaj urgent news lekar aayi hoon.

{{location}} mein property prices upar ja rahe hain. Jo {{new_listings}} aaye hain, woh current market rate se kam price mein hain kyonki builder ko urgent funds chahiye. Agar aapne pehle property nahi li toh ab mauka hai.

Lekin jaldi karo — yeh deals jaldi nahi aati. Kya main aapko detail bhej doon? Ya aaj hi baat karte hain?`,
    english:
      `Hello {{lead_name}}! This is {{agent_name}} from {{company_name}}.

I'm calling after a long time — it's been {{months_ago}} months! You showed interest in {{previous_interest}} and I have urgent news today.

Property prices in {{location}} are going up. The {{new_listings}} that have come in are priced below current market rates because the builder needs urgent funds. If you didn't buy before, this is your chance.

But hurry — these deals don't come often. Should I send you the details? Or shall we talk today?`,
  },
  0,   // score min — re-engage even cold leads
  40,  // score max — only cold/stale leads
  120, // prof duration
  100, // friendly duration
  55,  // urgent duration
);

// ---------------------------------------------------------------------------
// Exported script templates map
// ---------------------------------------------------------------------------

export const SCRIPT_TEMPLATES: ScriptTemplatesMap = {
  firstContact: _firstContact,
  followUp: _followUp,
  siteVisitConfirm: _siteVisitConfirm,
  postVisit: _postVisit,
  negotiation: _negotiation,
  reEngagement: _reEngagement,
};

// ---------------------------------------------------------------------------
// Convenience helper: get template by scenario, tone, and language
// ---------------------------------------------------------------------------

export function getTemplate(
  scenarioKey: keyof ScriptTemplatesMap,
  tone: 'professional' | 'friendly' | 'urgent' = 'friendly',
  language: 'hinglish' | 'english' = 'hinglish',
): string | null {
  const entry = SCRIPT_TEMPLATES[scenarioKey];
  if (!entry) return null;

  const variant = entry.variants[tone];
  if (variant == null) return null;

  return variant[language] ?? null;
}

// ---------------------------------------------------------------------------
// Convenience helper: get metadata for all scenarios
// ---------------------------------------------------------------------------

export function getAllScenarioMetadata(): ScriptScenarioMetadata[] {
  return Object.values(SCRIPT_TEMPLATES).map((entry) => entry.metadata);
}

// ---------------------------------------------------------------------------
// Convenience helper: get metadata for a specific scenario
// ---------------------------------------------------------------------------

export function getScenarioMetadata(
  scenarioKey: keyof ScriptTemplatesMap,
): ScriptScenarioMetadata | null {
  const entry = SCRIPT_TEMPLATES[scenarioKey];
  if (!entry) return null;
  return entry.metadata;
}

// ---------------------------------------------------------------------------
// Convenience helper: get all variable names for a scenario
// ---------------------------------------------------------------------------

export function getScenarioVariables(
  scenarioKey: keyof ScriptTemplatesMap,
): string[] {
  const entry = SCRIPT_TEMPLATES[scenarioKey];
  if (!entry) return [];
  return entry.metadata.variables.map((v) => v.name);
}
