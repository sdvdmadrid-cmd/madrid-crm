/**
 * Industry-aware website builder packs — copy, visuals, image prompts, and defaults.
 */

import { normalizeContractorServices, scrubHomeownerFacingCopy } from "@/lib/website-lead-form";
import { sanitizeWebsiteTestimonials } from "@/lib/website-content-purity";
import {
  buildLandscapingDefaultServices,
  getLandscapingRequestServiceOptions,
} from "@/lib/landscaping-services-catalog";

const PACKS = {
  cleaning: {
    key: "cleaning",
    label: "Cleaning Services",
    icon: "✨",
    tone: "fresh, trustworthy, spotless",
    defaultThemeColor: "#0ea5e9",
    themeColors: [
      { label: "Fresh Blue", value: "#0ea5e9" },
      { label: "Mint Clean", value: "#14b8a6" },
      { label: "Soft Sky", value: "#38bdf8" },
      { label: "Lavender Fresh", value: "#8b5cf6" },
    ],
    ctaOptions: ["Book a Cleaning", "Get Free Quote", "Schedule Service"],
    trustBadges: ["Licensed & Insured", "Eco-Friendly Products", "Background-Checked Team", "Satisfaction Guaranteed"],
    testimonials: [
      { quote: "Our home has never looked this clean. They are thorough, friendly, and always on time.", name: "Sarah M.", role: "Homeowner" },
      { quote: "We use them for our office every week. Reliable, professional, and easy to work with.", name: "David K.", role: "Office Manager" },
    ],
    defaultHeadline: "Spotless spaces. Zero stress.",
    defaultSubheadline: "Residential and commercial cleaning with eco-friendly products and dependable crews.",
    defaultAbout: "We deliver detailed, consistent cleaning for homes and businesses. From recurring maintenance to deep cleans and move-outs, our team treats your space like our own.",
    defaultServices: [
      { name: "Recurring Home Cleaning", description: "Weekly or bi-weekly maintenance plans tailored to your home.", price: "From $129" },
      { name: "Deep Cleaning", description: "Top-to-bottom detail for kitchens, baths, baseboards, and more.", price: "From $249" },
      { name: "Move-In / Move-Out", description: "Make your property shine for the next chapter.", price: "Custom quote" },
      { name: "Commercial Cleaning", description: "Offices, retail, and facilities cleaned after hours.", price: "Custom quote" },
    ],
    imagePresets: [
      "sparkling modern kitchen with natural light, professional maid service aesthetic",
      "bright clean bathroom with white tiles and fresh towels, spotless finish",
      "happy family in immaculate living room, warm natural lighting",
      "eco-friendly cleaning supplies on marble counter, soft premium look",
    ],
    imagePromptPrefix: "Professional residential or commercial cleaning company photo",
    requestServices: ["Deep Cleaning", "Recurring Cleaning", "Move-In / Move-Out", "Post-Construction", "Office Cleaning"],
  },

  landscaping_hardscaping: {
    key: "landscaping_hardscaping",
    label: "Landscaping & Outdoor",
    icon: "🌿",
    tone: "outdoor, premium, earthy",
    defaultThemeColor: "#15803d",
    themeColors: [
      { label: "Forest Green", value: "#15803d" },
      { label: "Earth Brown", value: "#92400e" },
      { label: "Stone Gray", value: "#57534e" },
      { label: "Sunset Amber", value: "#d97706" },
    ],
    ctaOptions: ["Request Landscape Quote", "Book Site Visit", "Start Your Project"],
    trustBadges: ["Licensed & Insured", "Free Estimates", "Satisfaction Guaranteed"],
    testimonials: [],
    defaultHeadline: "Outdoor spaces that wow.",
    defaultSubheadline:
      "Professional landscaping, lawn care, and hardscaping for lasting curb appeal.",
    defaultAbout:
      "We design and maintain outdoor spaces — from lawn care and seasonal cleanups to paver patios, retaining walls, mulch, sod, grading, and drainage. Your property gets a crew that plans ahead and delivers quality work.",
    defaultServices: buildLandscapingDefaultServices().slice(0, 12),
    imagePresets: [
      "luxury backyard patio at sunset with outdoor fire pit and landscaping",
      "fresh sod installation on suburban lawn, professional crew at work",
      "stone retaining wall with landscaped beds, golden hour lighting",
      "modern outdoor kitchen and paver patio, upscale residential",
    ],
    imagePromptPrefix: "Professional landscaping and hardscaping project photo",
    requestServices: getLandscapingRequestServiceOptions(),
  },

  roofing: {
    key: "roofing",
    label: "Roofing",
    icon: "🏠",
    tone: "bold, protective, storm-ready",
    defaultThemeColor: "#1e3a5f",
    themeColors: [
      { label: "Storm Navy", value: "#1e3a5f" },
      { label: "Slate Gray", value: "#475569" },
      { label: "Brick Red", value: "#b91c1c" },
      { label: "Charcoal", value: "#334155" },
    ],
    ctaOptions: ["Free Roof Inspection", "Storm Damage Help", "Get Roofing Quote"],
    trustBadges: ["Licensed & Insured", "Storm Response", "Manufacturer Warranties", "Local Crews"],
    testimonials: [
      { quote: "Fast response after the storm. Clear communication and a roof we trust.", name: "Mike T.", role: "Homeowner" },
      { quote: "They replaced our entire roof in two days. Clean job site and solid workmanship.", name: "Angela S.", role: "Homeowner" },
    ],
    defaultHeadline: "Roofs built to weather anything.",
    defaultSubheadline: "Inspections, repairs, and full replacements with honest assessments and durable materials.",
    defaultAbout: "We protect homes and businesses with roofing systems engineered for your climate. From leak repairs and shingle replacement to full tear-offs, our crews deliver craftsmanship you can see from the curb.",
    defaultServices: [
      { name: "Roof Inspection", description: "Photo-documented report with clear next steps.", price: "From $149" },
      { name: "Shingle Repair", description: "Targeted fixes for leaks, flashing, and storm damage.", price: "Custom quote" },
      { name: "Full Roof Replacement", description: "Complete systems with premium underlayment and ventilation.", price: "Custom quote" },
      { name: "Emergency Leak Service", description: "Rapid tarping and temporary dry-in when storms hit.", price: "Call 24/7" },
    ],
    imagePresets: [
      "roofing crew installing architectural shingles on suburban home, overcast sky",
      "aerial view of completed roof replacement, clean lines and ridge caps",
      "storm damaged roof with emergency tarp, professional contractor onsite",
      "close-up of new shingle roof texture, high quality installation",
    ],
    imagePromptPrefix: "Professional roofing contractor project photo",
    requestServices: ["Roof Inspection", "Leak Repair", "Shingle Repair", "Full Replacement", "Emergency Service"],
  },

  painting: {
    key: "painting",
    label: "Painting",
    icon: "🎨",
    tone: "clean, colorful, refined",
    defaultThemeColor: "#2563eb",
    themeColors: [
      { label: "Classic Blue", value: "#2563eb" },
      { label: "Warm Terracotta", value: "#c2410c" },
      { label: "Modern Charcoal", value: "#334155" },
      { label: "Sage Green", value: "#059669" },
    ],
    ctaOptions: ["Get Color Consultation", "Request Estimate", "Book Painters"],
    trustBadges: ["Licensed & Insured", "Premium Paints", "Clean Job Sites", "Color Matching"],
    testimonials: [
      { quote: "Crisp lines, zero mess, and the exterior looks brand new.", name: "Rachel H.", role: "Homeowner" },
      { quote: "They finished our entire interior ahead of schedule. Highly professional crew.", name: "Tom B.", role: "Property Owner" },
    ],
    defaultHeadline: "Color that transforms your space.",
    defaultSubheadline: "Interior and exterior painting with meticulous prep and finishes that last.",
    defaultAbout: "We bring walls, trim, and exteriors to life with careful surface prep and premium coatings. Whether refreshing a single room or repainting an entire property, we deliver sharp lines and durable color.",
    defaultServices: [
      { name: "Interior Painting", description: "Walls, ceilings, trim, and cabinets with low-VOC options.", price: "Free estimate" },
      { name: "Exterior Painting", description: "Weather-ready finishes that boost curb appeal.", price: "Free estimate" },
      { name: "Cabinet Refinishing", description: "Factory-smooth finishes without full replacement.", price: "Custom quote" },
      { name: "Commercial Repaint", description: "Minimal disruption scheduling for offices and retail.", price: "Custom quote" },
    ],
    imagePresets: [
      "freshly painted modern living room with accent wall, natural daylight",
      "professional painters rolling exterior siding on two-story home",
      "before and after cabinet painting kitchen, crisp white finish",
      "commercial interior office repaint, clean modern aesthetic",
    ],
    imagePromptPrefix: "Professional house painting project photo",
    requestServices: ["Interior Painting", "Exterior Painting", "Cabinet Painting", "Drywall + Paint", "Commercial Painting"],
  },

  plumbing: {
    key: "plumbing",
    label: "Plumbing",
    icon: "🔧",
    tone: "reliable, urgent-capable, expert",
    defaultThemeColor: "#0284c7",
    themeColors: [
      { label: "Plumber Blue", value: "#0284c7" },
      { label: "Steel Gray", value: "#475569" },
      { label: "Trust Teal", value: "#0d9488" },
      { label: "Safety Orange", value: "#ea580c" },
    ],
    ctaOptions: ["Call for Service", "Schedule Repair", "Get Plumbing Quote"],
    trustBadges: ["Licensed Plumbers", "Same-Day Service", "Upfront Pricing", "Emergency Available"],
    testimonials: [
      { quote: "They found the leak fast and fixed it the same day. Transparent pricing.", name: "Kevin L.", role: "Homeowner" },
      { quote: "Our water heater install was seamless. Professional from start to finish.", name: "Nina C.", role: "Homeowner" },
    ],
    defaultHeadline: "Plumbing problems solved fast.",
    defaultSubheadline: "Repairs, installations, and emergency service from licensed plumbers you can trust.",
    defaultAbout: "We keep water flowing where it should and stop it where it shouldn't. From dripping faucets and clogged drains to water heaters and repipes, our team diagnoses accurately and fixes it right the first time.",
    defaultServices: [
      { name: "Leak & Pipe Repair", description: "Fast diagnostics for leaks, bursts, and corrosion.", price: "From $125" },
      { name: "Drain Cleaning", description: "Clear tough clogs with professional equipment.", price: "From $149" },
      { name: "Water Heater Service", description: "Repair or replace tank and tankless systems.", price: "Custom quote" },
      { name: "Fixture Installation", description: "Sinks, toilets, showers, and disposal installs.", price: "Custom quote" },
    ],
    imagePresets: [
      "licensed plumber repairing under-sink pipes in modern kitchen",
      "new tankless water heater installation clean utility room",
      "professional plumber with tools at residential service call",
      "shiny chrome bathroom fixtures after renovation, bright lighting",
    ],
    imagePromptPrefix: "Professional residential plumbing service photo",
    requestServices: ["Leak Repair", "Drain Cleaning", "Water Heater", "Fixture Install", "Emergency Plumbing"],
  },

  hvac: {
    key: "hvac",
    label: "HVAC",
    icon: "❄️",
    tone: "comfort-focused, technical, reassuring",
    defaultThemeColor: "#0369a1",
    themeColors: [
      { label: "Cool Blue", value: "#0369a1" },
      { label: "Heat Orange", value: "#ea580c" },
      { label: "Arctic Teal", value: "#0e7490" },
      { label: "Graphite", value: "#334155" },
    ],
    ctaOptions: ["Schedule Service", "Book Tune-Up", "Get HVAC Quote"],
    trustBadges: ["NATE-Certified Techs", "Same-Day Comfort", "Energy Efficient", "Maintenance Plans"],
    testimonials: [
      { quote: "AC was back on in hours during a heat wave. Lifesavers.", name: "Jordan W.", role: "Homeowner" },
      { quote: "Honest recommendation on our system replacement — no upsell pressure.", name: "Patricia G.", role: "Homeowner" },
    ],
    defaultHeadline: "Comfort in every season.",
    defaultSubheadline: "Heating, cooling, and maintenance plans that keep your home efficient year-round.",
    defaultAbout: "We install, repair, and maintain HVAC systems for reliable comfort. Our technicians explain options clearly, optimize performance, and stand behind every tune-up and installation.",
    defaultServices: [
      { name: "AC Repair", description: "Fast cooling restoration and refrigerant diagnostics.", price: "From $129" },
      { name: "Heating Repair", description: "Furnace and heat pump service when temperatures drop.", price: "From $129" },
      { name: "System Replacement", description: "Right-sized equipment with financing options.", price: "Free estimate" },
      { name: "Maintenance Plans", description: "Seasonal tune-ups that prevent costly breakdowns.", price: "From $19/mo" },
    ],
    imagePresets: [
      "hvac technician servicing outdoor ac condenser unit suburban home",
      "modern smart thermostat on wall bright living room comfort",
      "new furnace installation clean basement mechanical room",
      "technician inspecting ductwork attic, professional safety gear",
    ],
    imagePromptPrefix: "Professional HVAC heating and cooling service photo",
    requestServices: ["AC Repair", "Heating Repair", "Maintenance", "Replacement Quote", "Ductwork"],
  },

  electrical: {
    key: "electrical",
    label: "Electrical",
    icon: "⚡",
    tone: "safe, precise, code-compliant",
    defaultThemeColor: "#ca8a04",
    themeColors: [
      { label: "Electric Gold", value: "#ca8a04" },
      { label: "Power Blue", value: "#1d4ed8" },
      { label: "Safety Orange", value: "#ea580c" },
      { label: "Industrial Gray", value: "#475569" },
    ],
    ctaOptions: ["Request Service", "Book Inspection", "Get Electrical Quote"],
    trustBadges: ["Licensed Electricians", "Code Compliant", "Panel Upgrades", "Safety First"],
    testimonials: [
      { quote: "Panel upgrade was done cleanly with permits pulled. Great communication.", name: "Eric D.", role: "Homeowner" },
      { quote: "They wired our kitchen remodel perfectly. Inspection passed first try.", name: "Amy F.", role: "Homeowner" },
    ],
    defaultHeadline: "Power done right.",
    defaultSubheadline: "Residential and commercial electrical service — safe, code-compliant, and built to last.",
    defaultAbout: "We solve electrical issues and upgrades with precision and safety. From troubleshooting and lighting installs to panel upgrades and EV chargers, licensed electricians deliver work you can trust.",
    defaultServices: [
      { name: "Panel Upgrade", description: "200A service for modern loads and safety.", price: "Free estimate" },
      { name: "Lighting Installation", description: "Recessed, pendant, and outdoor lighting design.", price: "Custom quote" },
      { name: "Outlet & Switch Service", description: "Repairs, GFCI upgrades, and additions.", price: "From $140" },
      { name: "Troubleshooting", description: "Find and fix intermittent issues fast.", price: "From $140" },
    ],
    imagePresets: [
      "licensed electrician installing recessed lighting modern kitchen",
      "electrical panel upgrade clean organized wiring",
      "ev charger installation residential garage professional",
      "electrician testing outlet with multimeter bright home",
    ],
    imagePromptPrefix: "Professional licensed electrician service photo",
    requestServices: ["Panel Upgrade", "Wiring Repair", "Lighting Install", "Outlet / Switch", "Electrical Troubleshooting"],
  },

  general: {
    key: "general",
    label: "Construction & Remodeling",
    icon: "🏗️",
    tone: "premium contractor, bold, trustworthy",
    defaultThemeColor: "#1d4ed8",
    themeColors: [
      { label: "Contractor Blue", value: "#1d4ed8" },
      { label: "Steel", value: "#475569" },
      { label: "Build Orange", value: "#c2410c" },
      { label: "Concrete Gray", value: "#57534e" },
    ],
    ctaOptions: ["Start Your Project", "Request Bid", "Book Consultation"],
    trustBadges: ["Licensed & Bonded", "Project Management", "Before/After Portfolio", "On-Time Delivery"],
    testimonials: [
      { quote: "They managed our remodel like true pros — clear timeline and quality finish.", name: "Robert M.", role: "Homeowner" },
      { quote: "Our addition came in on budget. Communication was excellent throughout.", name: "Helen J.", role: "Homeowner" },
    ],
    defaultHeadline: "Built to exceed expectations.",
    defaultSubheadline: "Full-service contracting for remodels, additions, and commercial build-outs.",
    defaultAbout: "We partner with property owners to plan and build projects that last. From kitchens and baths to structural improvements, our team coordinates trades, timelines, and quality control so you can focus on the result.",
    defaultServices: [
      { name: "Kitchen Remodel", description: "Layout, cabinetry, surfaces, and coordinated trades.", price: "Custom bid" },
      { name: "Bathroom Renovation", description: "Waterproofing, tile, fixtures, and lighting.", price: "Custom bid" },
      { name: "Additions & Structural", description: "Expand living space with engineered plans.", price: "Custom bid" },
      { name: "Commercial Build-Out", description: "Tenant improvements on schedule and spec.", price: "Custom bid" },
    ],
    imagePresets: [
      "luxury kitchen remodel before and after bright modern finishes",
      "construction crew framing residential addition sunny day",
      "commercial build-out interior progress professional jobsite",
      "bathroom renovation marble tile walk-in shower premium",
    ],
    imagePromptPrefix: "Professional general contractor construction project photo",
    requestServices: ["General Repair", "Remodel", "Installation", "Maintenance", "Other"],
  },

  tree_care: {
    key: "tree_care",
    label: "Tree Service",
    icon: "🌳",
    tone: "safety-first, arborist, outdoor",
    defaultThemeColor: "#166534",
    themeColors: [
      { label: "Canopy Green", value: "#166534" },
      { label: "Wood Brown", value: "#78350f" },
      { label: "Safety Orange", value: "#ea580c" },
    ],
    ctaOptions: ["Schedule Tree Service", "Storm Cleanup", "Get Arborist Quote"],
    trustBadges: ["ISA-Certified", "Fully Insured", "Crane Service", "Emergency Response"],
    testimonials: [
      { quote: "They removed a hazardous tree safely and left the yard spotless.", name: "Greg N.", role: "Homeowner" },
      { quote: "Professional pruning transformed our oak trees. Highly recommend.", name: "Diane W.", role: "Homeowner" },
    ],
    defaultHeadline: "Healthy trees. Safer properties.",
    defaultSubheadline: "Pruning, removal, stump grinding, and storm cleanup by certified arborists.",
    defaultAbout: "We care for trees that define your landscape. Our crews combine proper pruning techniques, safe removals, and emergency response to protect people and property.",
    defaultServices: [
      { name: "Tree Trimming", description: "Structural pruning for health and clearance.", price: "Free estimate" },
      { name: "Tree Removal", description: "Safe takedowns with crane service when needed.", price: "Custom quote" },
      { name: "Stump Grinding", description: "Restore usable lawn after removal.", price: "From $149" },
      { name: "Storm Cleanup", description: "Rapid response for fallen limbs and hazards.", price: "24/7" },
    ],
    imagePresets: [
      "arborist pruning large oak tree with safety gear suburban property",
      "tree removal crew with bucket truck residential street",
      "freshly cleared yard after stump grinding clean mulch",
      "storm damaged tree branch on roof emergency response",
    ],
    imagePromptPrefix: "Professional tree service and arborist photo",
    requestServices: ["Tree Trimming", "Tree Removal", "Stump Grinding", "Storm Cleanup", "Other"],
  },

  handyman: {
    key: "handyman",
    label: "Handyman",
    icon: "🛠️",
    tone: "friendly, versatile, local",
    defaultThemeColor: "#ea580c",
    themeColors: [
      { label: "Handyman Orange", value: "#ea580c" },
      { label: "Toolbox Blue", value: "#2563eb" },
      { label: "Workshop Gray", value: "#57534e" },
    ],
    ctaOptions: ["Book a Handyman", "Same-Week Service", "Get Quote"],
    trustBadges: ["Background Checked", "No Job Too Small", "Fair Hourly Rates", "Local & Reliable"],
    testimonials: [
      { quote: "They knocked out my entire honey-do list in one visit. Super handy.", name: "Mark S.", role: "Homeowner" },
      { quote: "Reliable, skilled, and fair pricing. Our go-to for small repairs.", name: "Julie A.", role: "Homeowner" },
    ],
    defaultHeadline: "Your to-do list, done.",
    defaultSubheadline: "Repairs, installs, and small projects handled by one trusted local pro.",
    defaultAbout: "We tackle the jobs that keep your home running smoothly — drywall patches, fixture installs, assembly, and seasonal maintenance. One call covers dozens of tasks.",
    defaultServices: [
      { name: "Home Repairs", description: "Doors, drywall, trim, and general fixes.", price: "From $95/hr" },
      { name: "TV & Mounting", description: "Secure mounting with clean cable management.", price: "From $89" },
      { name: "Fixture Installation", description: "Faucets, fans, blinds, and hardware.", price: "From $95/hr" },
      { name: "Seasonal Maintenance", description: "Gutter cleaning, caulking, and weather prep.", price: "Custom quote" },
    ],
    imagePresets: [
      "handyman installing shelving in bright modern home workshop aesthetic",
      "repairing interior door hinge residential hallway natural light",
      "mounting flat screen tv on living room wall clean finish",
      "toolbox and drill on kitchen counter friendly local service vibe",
    ],
    imagePromptPrefix: "Professional handyman home repair service photo",
    requestServices: ["General Handyman", "Repairs", "Installations", "Maintenance", "Other"],
  },

  junk_removal: {
    key: "junk_removal",
    label: "Junk Removal",
    icon: "🚛",
    tone: "fast, friendly, no-hassle hauling",
    defaultThemeColor: "#ea580c",
    themeColors: [
      { label: "Haul Orange", value: "#ea580c" },
      { label: "Fleet Blue", value: "#2563eb" },
      { label: "Recycling Green", value: "#16a34a" },
    ],
    ctaOptions: ["Book Pickup", "Get Junk Quote", "Same-Day Removal"],
    trustBadges: ["Licensed & Insured", "Upfront Pricing", "Eco Disposal", "Same-Day Service"],
    testimonials: [
      { quote: "They cleared our garage and attic in one trip. Fast, polite, fair price.", name: "Brian T.", role: "Homeowner" },
      { quote: "Estate cleanout handled with care. Would hire again.", name: "Susan K.", role: "Homeowner" },
    ],
    defaultHeadline: "Junk gone. Space restored.",
    defaultSubheadline: "Residential and commercial junk removal, hauling, and cleanouts with upfront pricing.",
    defaultAbout: "We make unwanted items disappear — from single bulky pickups to full property cleanouts. Our crews load, haul, and dispose responsibly so you get your space back fast.",
    defaultServices: [
      { name: "Furniture & Appliance Haul", description: "Single items or full rooms cleared quickly.", price: "From $99" },
      { name: "Garage Cleanout", description: "Sort, load, and haul with sweep-up included.", price: "Custom quote" },
      { name: "Estate Cleanout", description: "Sensitive, efficient clearing for transitions.", price: "Custom quote" },
      { name: "Construction Debris", description: "Jobsite and renovation debris hauling.", price: "Custom quote" },
    ],
    imagePresets: [
      "junk removal crew loading truck with furniture suburban driveway",
      "before and after garage cleanout bright organized space",
      "dumpster alternative full truck load curbside pickup",
      "commercial property cleanout team professional uniforms",
    ],
    imagePromptPrefix: "Professional junk removal and hauling service photo",
    requestServices: ["Furniture Removal", "Garage Cleanout", "Estate Cleanout", "Yard Debris", "Construction Debris"],
  },

  concrete: {
    key: "concrete",
    label: "Concrete",
    icon: "🧱",
    tone: "durable, structural, professional",
    defaultThemeColor: "#57534e",
    themeColors: [
      { label: "Concrete Gray", value: "#57534e" },
      { label: "Steel Blue", value: "#1d4ed8" },
      { label: "Earth Tan", value: "#92400e" },
    ],
    ctaOptions: ["Request Concrete Bid", "Schedule Pour", "Get Free Estimate"],
    trustBadges: ["Licensed & Insured", "Structural Quality", "Commercial + Residential", "On-Time Pours"],
    testimonials: [
      { quote: "Our new driveway looks incredible and drains perfectly.", name: "Paul R.", role: "Homeowner" },
      { quote: "Commercial flatwork finished on schedule. Solid crew.", name: "Nina V.", role: "Property Manager" },
    ],
    defaultHeadline: "Built on solid concrete.",
    defaultSubheadline: "Driveways, patios, foundations, and flatwork poured with precision and lasting strength.",
    defaultAbout: "We deliver concrete solutions that stand up to daily use and weather. From decorative patios to structural slabs, our team handles prep, pour, and finish with professional equipment.",
    defaultServices: [
      { name: "Driveways", description: "Durable residential driveways with proper base prep.", price: "Free estimate" },
      { name: "Patios & Walkways", description: "Stamped, broom finish, and custom layouts.", price: "Free estimate" },
      { name: "Foundations & Slabs", description: "Structural pours for additions and builds.", price: "Custom bid" },
      { name: "Repair & Resurface", description: "Crack repair, leveling, and surface restoration.", price: "From $450" },
    ],
    imagePresets: [
      "freshly poured concrete driveway smooth broom finish suburban home",
      "concrete crew finishing patio slab with tools sunny jobsite",
      "stamped concrete patio decorative pattern upscale backyard",
      "commercial concrete flatwork warehouse floor professional pour",
    ],
    imagePromptPrefix: "Professional concrete contractor pour and flatwork photo",
    requestServices: ["Driveway", "Patio / Walkway", "Foundation / Slab", "Repair", "Commercial Flatwork"],
  },

  remodeling: {
    key: "remodeling",
    label: "Remodeling",
    icon: "🏡",
    tone: "premium renovation, design-forward",
    defaultThemeColor: "#1d4ed8",
    themeColors: [
      { label: "Renovation Blue", value: "#1d4ed8" },
      { label: "Warm Walnut", value: "#78350f" },
      { label: "Modern Slate", value: "#334155" },
    ],
    ctaOptions: ["Start Your Remodel", "Book Consultation", "Request Bid"],
    trustBadges: ["Licensed & Insured", "Design + Build", "Before/After Portfolio", "On-Time Milestones"],
    testimonials: [
      { quote: "Our kitchen remodel exceeded expectations. Beautiful finishes and clear communication.", name: "Laura M.", role: "Homeowner" },
      { quote: "Bathroom renovation done right — waterproofing, tile, and fixtures perfect.", name: "James H.", role: "Homeowner" },
    ],
    defaultHeadline: "Remodels that elevate your home.",
    defaultSubheadline: "Kitchen, bath, and whole-home renovations with premium finishes and expert project management.",
    defaultAbout: "We transform dated spaces into rooms you love. Our remodeling team coordinates design selections, trades, and inspections so your project stays on track and on budget.",
    defaultServices: [
      { name: "Kitchen Remodel", description: "Cabinets, countertops, lighting, and layout upgrades.", price: "Custom bid" },
      { name: "Bathroom Renovation", description: "Tile, vanities, showers, and waterproofing done right.", price: "Custom bid" },
      { name: "Basement Finish", description: "Living space, egress, and mechanical coordination.", price: "Custom bid" },
      { name: "Whole-Home Refresh", description: "Multi-room updates with cohesive design.", price: "Custom bid" },
    ],
    imagePresets: [
      "luxury kitchen remodel white cabinets quartz counters bright natural light",
      "modern bathroom renovation walk-in shower marble tile premium",
      "basement finishing cozy family room built-in lighting",
      "before and after home renovation open concept living space",
    ],
    imagePromptPrefix: "Professional home remodeling and renovation photo",
    requestServices: ["Kitchen Remodel", "Bathroom Renovation", "Basement Finish", "Whole-Home", "Other"],
  },
};

/** Curated Unsplash URLs for instant preview — no OpenAI wait. */
const INDUSTRY_STOCK_IMAGES = {
  cleaning: [
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1527515637462-cff94ee9661?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200&h=800&fit=crop&q=80",
  ],
  landscaping_hardscaping: [
    "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1598902108854-10e335adac99?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1585320806291-8a20410a9dea?w=1200&h=800&fit=crop&q=80",
  ],
  roofing: [
    "https://images.unsplash.com/photo-1632776675305-f0c8d2f4a086?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop&q=80",
  ],
  painting: [
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1589939705382-41e0207a4270?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1565182999561-18d7dc1c56c8?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&h=800&fit=crop&q=80",
  ],
  plumbing: [
    "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1585704032915-c3400ca276e9?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=800&fit=crop&q=80",
  ],
  hvac: [
    "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&h=800&fit=crop&q=80",
  ],
  electrical: [
    "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1473341304170-971d2125aba1?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=800&fit=crop&q=80",
  ],
};

const DEFAULT_STOCK_IMAGES = [
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=800&fit=crop&q=80",
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop&q=80",
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&h=800&fit=crop&q=80",
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&h=800&fit=crop&q=80",
];

/** Stock photo URL for instant website preview (no AI image generation). */
export function getIndustryStockImageUrl(pack, index = 0) {
  const key = pack?.key || "";
  const list = INDUSTRY_STOCK_IMAGES[key] || DEFAULT_STOCK_IMAGES;
  const idx = Math.max(0, Number(index) || 0);
  return list[idx % list.length] || DEFAULT_STOCK_IMAGES[0];
}

/** Terms that indicate the WRONG industry when found in copy for a given pack key */
const CROSS_INDUSTRY_FORBIDDEN = {
  cleaning: [
    "landscap", "lawn", "hardscape", "patio", "retaining wall", "sod", "mulch", "irrigation",
    "roof", "shingle", "gutter install", "hvac", "furnace", "plumb", "electric panel",
    "construction crew", "job site framing", "concrete pour", "tree removal", "arborist",
    "outdoor spaces that wow", "tradespeople", "general contractor",
  ],
  landscaping_hardscaping: [
    "maid service", "deep clean", "disinfect", "janitorial", "housekeeping", "carpet clean",
    "roof replace", "shingle", "hvac tune", "pipe leak", "electrical panel", "junk haul",
    "remodel", "renovation", "construction", "kitchen remodel", "bathroom renovation",
    "general contractor", "home addition", "build-out",
  ],
  roofing: [
    "maid", "housekeeping", "lawn mowing", "mulch", "kitchen remodel", "cabinet refin",
    "deep cleaning", "carpet", "junk removal",
  ],
  plumbing: [
    "landscap", "lawn care", "roof shingle", "maid service", "tree trimming", "kitchen remodel",
  ],
  hvac: [
    "landscap", "roofing", "maid", "plumb fixture only", "tree service", "junk haul",
  ],
  electrical: [
    "landscap", "maid", "roofing", "lawn", "cleaning service", "tree removal",
  ],
  painting: [
    "landscap", "roof shingle", "maid", "hvac repair", "tree trimming",
  ],
  general: [
    "maid service", "housekeeping", "janitorial", "disinfecting", "carpet cleaning",
    "lawn mowing only", "tree trimming only",
  ],
  tree_care: [
    "maid", "kitchen remodel", "roof shingle", "deep cleaning", "hvac",
  ],
  handyman: [
    "full roof replacement", "landscape design", "maid service", "commercial janitorial",
  ],
  junk_removal: [
    "landscap", "roof shingle", "maid service", "kitchen remodel", "tree pruning",
  ],
  concrete: [
    "maid", "housekeeping", "tree trimming", "roof repair", "landscape design",
  ],
  remodeling: [
    "maid service", "lawn mowing", "roof shingle", "junk haul", "tree removal",
  ],
};

const NAME_INDUSTRY_HINTS = [
  { pattern: /\b(clean(ing|ers?)?|maid|janitorial|housekeeping|sanitize)\b/i, key: "cleaning" },
  { pattern: /\b(landscap|lawn care|hardscape|lawn service)\b/i, key: "landscaping_hardscaping" },
  { pattern: /\b(roof(ing|ers?)?|shingle|gutter)\b/i, key: "roofing" },
  { pattern: /\b(plumb(ing|ers?)?|drain|sewer)\b/i, key: "plumbing" },
  { pattern: /\b(hvac|heating|cooling|air condition)\b/i, key: "hvac" },
  { pattern: /\b(electric(al|ian)?|wiring)\b/i, key: "electrical" },
  { pattern: /\b(paint(ing|ers?)?)\b/i, key: "painting" },
  { pattern: /\b(tree (service|care)|arborist)\b/i, key: "tree_care" },
  { pattern: /\b(junk|haul(ing)?|debris removal)\b/i, key: "junk_removal" },
  { pattern: /\b(concrete|cement|flatwork)\b/i, key: "concrete" },
  { pattern: /\b(remodel(ing)?|renovation|kitchen bath)\b/i, key: "remodeling" },
  { pattern: /\b(construction|contractor|build(er)?)\b/i, key: "general" },
  { pattern: /\bhandyman\b/i, key: "handyman" },
];

const ALIASES = {
  general_contractor: "general",
  construction: "general",
  cleaning_services: "cleaning",
  cleaning_service: "cleaning",
  landscape: "landscaping_hardscaping",
  landscaping: "landscaping_hardscaping",
  tree_service: "tree_care",
  other: "general",
};

const DEFAULT_KEY = "general";

const HERO_SLOT_COUNT = 4;

export function resolveWebsiteIndustryKey(raw, companyProfile = null) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (PACKS[normalized]) return normalized;
  if (ALIASES[normalized]) return ALIASES[normalized];

  const inferred = inferIndustryKeyFromCompanyName(
    companyProfile?.publicDisplayName || companyProfile?.companyName || "",
  );
  if (inferred) return inferred;

  return DEFAULT_KEY;
}

export function resolveWebsiteIndustryFromProfile(companyProfile = {}) {
  const fromName = inferIndustryKeyFromCompanyName(
    companyProfile?.publicDisplayName || companyProfile?.companyName || "",
  );
  if (fromName) return fromName;
  return resolveWebsiteIndustryKey(companyProfile?.businessType, companyProfile);
}

/**
 * Effective industry for a tenant website: manual override in site_meta, else company profile.
 */
export function resolveWebsiteIndustryForWebsite(companyProfile = {}, siteMeta = null) {
  const meta =
    siteMeta && typeof siteMeta === "object" ? siteMeta : {};
  const override = String(meta.industryKeyOverride || "").trim();
  if (override) {
    return resolveWebsiteIndustryKey(override, companyProfile);
  }
  return resolveWebsiteIndustryFromProfile(companyProfile);
}

export function listWebsiteIndustryPackOptions() {
  return Object.values(PACKS).map((pack) => ({
    key: pack.key,
    label: pack.label,
    icon: pack.icon,
  }));
}

function inferIndustryKeyFromCompanyName(companyName) {
  const name = String(companyName || "").trim();
  if (!name) return null;
  for (const hint of NAME_INDUSTRY_HINTS) {
    if (hint.pattern.test(name)) return hint.key;
  }
  return null;
}

export function textViolatesIndustryPack(text, packKey) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) return false;
  const forbidden = CROSS_INDUSTRY_FORBIDDEN[packKey] || [];
  return forbidden.some((term) => haystack.includes(term.toLowerCase()));
}

export function detectWebsiteContentMismatch(content, packKey) {
  const fields = [
    content?.headline,
    content?.subheadline,
    content?.aboutText,
    ...(Array.isArray(content?.services) ? content.services.map((s) => `${s?.name} ${s?.description}`) : []),
  ];
  return fields.some((f) => textViolatesIndustryPack(f, packKey));
}

export function sanitizeIndustryWebsiteContent(content, pack, companyProfile = {}) {
  const packKey = pack.key;
  const defaults = buildIndustryWebsiteDefaults(pack, companyProfile);
  const pick = (value, fallback, max) => {
    const v = String(value || "").trim();
    if (!v || textViolatesIndustryPack(v, packKey)) return fallback;
    return v.slice(0, max);
  };

  let services = Array.isArray(content?.services) ? content.services : [];
  services = services
    .filter((s) => !textViolatesIndustryPack(`${s?.name} ${s?.description}`, packKey))
    .slice(0, 8)
    .map((s) => ({
      name: pick(s?.name, "", 100),
      description: pick(s?.description, "", 400),
      price: String(s?.price || "").slice(0, 50),
    }))
    .filter((s) => s.name);

  if (!services.length) services = defaults.services.map((s) => ({ ...s }));

  const testimonials = sanitizeWebsiteTestimonials(content?.testimonials);

  let trustBadges = Array.isArray(content?.trustBadges) ? content.trustBadges : [];
  trustBadges = trustBadges
    .map((b) => scrubHomeownerFacingCopy(String(b).slice(0, 80)))
    .filter((b) => b && !textViolatesIndustryPack(b, packKey));
  if (!trustBadges.length) trustBadges = [...defaults.trustBadges];

  const headline = scrubHomeownerFacingCopy(
    pick(content?.headline, defaults.headline, 200),
  ) || pick(content?.headline, defaults.headline, 200);
  const subheadline = scrubHomeownerFacingCopy(
    pick(content?.subheadline, defaults.subheadline, 300),
  ) || pick(content?.subheadline, defaults.subheadline, 300);
  const aboutText = scrubHomeownerFacingCopy(
    pick(content?.aboutText, defaults.aboutText, 2000),
  ) || pick(content?.aboutText, defaults.aboutText, 2000);
  const ctaText =
    scrubHomeownerFacingCopy(pick(content?.ctaText, defaults.ctaText, 100)) ||
    pick(content?.ctaText, defaults.ctaText, 100);

  return {
    headline,
    subheadline,
    aboutText,
    ctaText,
    themeColor: content?.themeColor || defaults.themeColor,
    services,
    testimonials,
    trustBadges,
  };
}

export function createDefaultHeroPhotoSlots(pack) {
  const presets = pack.imagePresets || [];
  return Array.from({ length: HERO_SLOT_COUNT }, (_, index) => ({
    id: `hero-${index}`,
    src: getIndustryStockImageUrl(pack, index),
    alt: pack.label ? `${pack.label} project ${index + 1}` : `Project ${index + 1}`,
    prompt: presets[index % presets.length] || presets[0] || "",
  }));
}

export function normalizeHeroPhotos(rawSlots, pack) {
  const defaults = createDefaultHeroPhotoSlots(pack);
  const list = Array.isArray(rawSlots) ? rawSlots : [];
  return defaults.map((slot, index) => {
    const incoming = list[index] || list.find((p) => p?.id === slot.id) || {};
    const src = String(incoming?.src || "").trim();
    const persistedSrc =
      src.startsWith("data:image/") || /^https?:\/\//i.test(src) ? src : "";
    return {
      id: slot.id,
      src: persistedSrc,
      alt: String(incoming?.alt || slot.alt).slice(0, 160),
      prompt: String(incoming?.prompt || slot.prompt).slice(0, 320),
    };
  });
}

export function getWebsiteBuilderPack(industryKey) {
  const key = resolveWebsiteIndustryKey(industryKey);
  return PACKS[key] || PACKS[DEFAULT_KEY];
}

export function buildIndustryWebsiteDefaults(pack, companyProfile = {}) {
  const companyName =
    String(companyProfile?.publicDisplayName || companyProfile?.companyName || "Our Company").trim() ||
    "Our Company";
  const city = String(companyProfile?.businessCity || companyProfile?.city || "").trim();
  const locationSuffix = city ? ` serving ${city} and nearby areas` : "";
  const hasBrand = companyName && companyName !== "Our Company";

  const headline = pack.defaultHeadline;
  const subheadline = `${pack.defaultSubheadline}${locationSuffix}`;
  const aboutText = hasBrand
    ? `${pack.defaultAbout} Proudly serving you as ${companyName}.`
    : pack.defaultAbout;

  return {
    headline,
    subheadline,
    aboutText,
    ctaText: pack.ctaOptions[0] || "Request Estimate",
    themeColor: pack.defaultThemeColor,
    services: pack.defaultServices.map((s) => ({ ...s })),
    testimonials: [],
    trustBadges: [...pack.trustBadges],
    imagePresets: [...pack.imagePresets],
    requestServices: [...pack.requestServices],
    heroPhotos: createDefaultHeroPhotoSlots(pack),
  };
}

export function personalizeGeneratedContent(parsed, pack, companyProfile = {}) {
  return sanitizeIndustryWebsiteContent(
    {
      headline: parsed?.headline,
      subheadline: parsed?.subheadline,
      aboutText: parsed?.aboutText,
      ctaText: parsed?.ctaText,
      services: parsed?.services,
      testimonials: parsed?.testimonials,
      trustBadges: parsed?.trustBadges,
      themeColor: pack.defaultThemeColor,
    },
    pack,
    companyProfile,
  );
}

export function buildIndustryAiSystemPrompt(pack) {
  const forbidden = (CROSS_INDUSTRY_FORBIDDEN[pack.key] || []).slice(0, 12).join(", ");
  return [
    `You write website copy ONLY for ${pack.label} (${pack.key}) home service businesses.`,
    `NEVER mention: ${forbidden || "unrelated trades"}.`,
    `Use terminology like: ${pack.requestServices.slice(0, 5).join(", ")}.`,
    `Tone: ${pack.tone}.`,
    "Return only valid JSON exactly as requested.",
  ].join(" ");
}

export function listWebsiteIndustryPacks() {
  return Object.values(PACKS).map((p) => ({ key: p.key, label: p.label, icon: p.icon }));
}
