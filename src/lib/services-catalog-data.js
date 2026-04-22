export const SERVICE_CATEGORY_ORDER = [
  "landscaping",
  "hardscaping",
  "interior-maintenance",
  "exterior-maintenance",
  "seasonal-specialty",
  "concrete-paving",
];

export const SERVICE_CATEGORY_META = {
  landscaping: {
    icon: "LS",
    title: "Landscaping",
    description: "Tree work, irrigation, drainage, and landscape lighting templates.",
  },
  hardscaping: {
    icon: "HS",
    title: "Hardscaping",
    description: "Outdoor build support, demo, hauling, and deck or patio work.",
  },
  "interior-maintenance": {
    icon: "IM",
    title: "Interior Maintenance",
    description: "Core indoor systems, finish trades, and repair service templates.",
  },
  "exterior-maintenance": {
    icon: "EM",
    title: "Exterior Maintenance",
    description: "Exterior cleaning, repair, pool, siding, and access-related work.",
  },
  "seasonal-specialty": {
    icon: "SS",
    title: "Seasonal & Specialty",
    description: "Seasonal jobs, remediation, specialty trades, and one-off work.",
  },
  "concrete-paving": {
    icon: "CP",
    title: "Concrete & Paving",
    description: "Paving, striping, polishing, and asphalt surface maintenance.",
  },
};

function template(name, description) {
  return {
    name,
    description,
    price: "",
    addOns: "",
    notes: "",
    unit: "service",
  };
}

export const DEFAULT_CATEGORY_SERVICES = {
  landscaping: [
    template("Tree Services", "Trimming, removal, pruning, haul-away, and site cleanup."),
    template("Irrigation", "Sprinkler, drip, valve, and controller service work."),
    template("Drainage", "Yard drainage correction, trenching, and runoff control."),
    template("Landscape Lighting", "Low-voltage landscape lighting install and repair."),
  ],
  hardscaping: [
    template("Deck & Patio", "Patio, deck, and outdoor living surface service work."),
    template("Demolition", "Selective demolition, tear-out, and debris staging."),
    template("Moving / Hauling", "Labor and truck support for moving and heavy hauling."),
  ],
  "interior-maintenance": [
    template("HVAC", "Heating, cooling, ventilation, tune-ups, and repair service."),
    template("Plumbing", "Fixture, drain, leak, and line service for homes and shops."),
    template("Electrical", "Panel, wiring, outlet, lighting, and troubleshooting service."),
    template("Flooring & Carpet", "Flooring repair, install, patching, and carpet work."),
    template("Kitchen & Bath Remodeling", "Small remodel scopes, fixture swaps, and finish updates."),
    template("Handyman", "General punch-list, repair, and multi-trade support work."),
    template("Drywall", "Drywall patching, hanging, finishing, and texture repair."),
    template("Appliance Repair", "Diagnosis and repair for residential appliances."),
    template("Locksmith", "Lock changes, rekeying, hardware installs, and access repair."),
    template("Insulation", "Attic, wall, crawlspace, and air-sealing insulation work."),
  ],
  "exterior-maintenance": [
    template("Pressure Washing", "Surface washing for exteriors, flatwork, and site cleanup."),
    template("Window Cleaning", "Interior and exterior glass cleaning with screen service."),
    template("Gutter Cleaning", "Debris removal, flush-out, and downspout clearing."),
    template("Pool Maintenance", "Routine cleaning, chemical balancing, and equipment checks."),
    template("Siding", "Siding repair, replacement, sealing, and trim touch-up."),
    template("Garage Door Repair", "Door, spring, opener, and track repair service."),
    template("Septic Services", "Septic inspection, pumping coordination, and repair support."),
  ],
  "seasonal-specialty": [
    template("Pest Control", "Routine pest treatment, exclusion, and infestation response."),
    template("Holiday Lighting", "Seasonal lighting install, maintenance, and takedown."),
    template("Chimney Sweep", "Sweep, inspection, soot cleanup, and vent maintenance."),
    template("Solar Installation", "Solar mounting, panel install, and system service support."),
    template("Junk Removal", "Material haul-off, cleanout, and disposal service."),
    template("Carpet Cleaning", "Deep extraction cleaning, stain treatment, and deodorizing."),
    template("Mold Remediation", "Containment, removal, treatment, and prevention work."),
    template("Water & Fire Restoration", "Dry-out, cleanup, demo, and restoration response work."),
    template("Snow Removal", "Snow clearing, salting, plowing, and winter response work."),
  ],
  "concrete-paving": [
    template("Sealcoating", "Asphalt sealcoating and surface protection service."),
    template("Driveway Paving", "Driveway paving, patching, resurfacing, and repair."),
    template("Line Striping", "Parking lot striping, layout refresh, and marking updates."),
    template("Concrete Polishing", "Concrete grinding, polishing, sealing, and finish prep."),
  ],
};