const fs = require('fs');
const path = require('path');

const products = JSON.parse(fs.readFileSync('all_products.json', 'utf8'));
const outputDir = path.join(__dirname, '..', 'app', 'public', 'products');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to generate SVG content based on product sku and name
function generateSvg(p) {
  const { sku, name, category } = p;
  const s = sku.toUpperCase();
  const n = name.toLowerCase();

  // Pick glyph based on keyword matching
  let glyph = '';

  if (s.includes('COF') || n.includes('coffee') || n.includes('beans')) {
    // Coffee cup & steam
    glyph = `
      <!-- Coffee Cup -->
      <path d="M70 85 h60 v35 a30 30 0 0 1 -60 0 z" fill="#24221C" stroke="#E6E2D8" stroke-width="4" stroke-linejoin="round"/>
      <path d="M130 92 h14 a12 12 0 0 1 0 24 h-14" fill="none" stroke="#E6E2D8" stroke-width="4"/>
      <path d="M85 70 q 5 -10 0 -18" fill="none" stroke="#F97316" stroke-width="3" stroke-linecap="round"/>
      <path d="M100 68 q 5 -12 0 -20" fill="none" stroke="#F97316" stroke-width="3" stroke-linecap="round"/>
      <path d="M115 70 q 5 -10 0 -18" fill="none" stroke="#F97316" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="130" x2="140" y2="130" stroke="#8C867A" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (s.includes('MAT-CEREM') || n.includes('matcha')) {
    // Matcha bowl & whisk
    glyph = `
      <path d="M60 95 q 40 45 80 0 h-80 z" fill="#1C241D" stroke="#A3E635" stroke-width="4"/>
      <ellipse cx="100" cy="95" rx="40" ry="10" fill="#2E4A28" stroke="#A3E635" stroke-width="3"/>
      <line x1="90" y1="65" x2="110" y2="90" stroke="#E6E2D8" stroke-width="4" stroke-linecap="round"/>
      <line x1="100" y1="60" x2="100" y2="90" stroke="#E6E2D8" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (s.includes('CHOC') || n.includes('chocolate')) {
    // Chocolate bar
    glyph = `
      <rect x="70" y="60" width="60" height="80" rx="8" fill="#231A16" stroke="#D97706" stroke-width="4"/>
      <line x1="70" y1="87" x2="130" y2="87" stroke="#D97706" stroke-width="3"/>
      <line x1="70" y1="113" x2="130" y2="113" stroke="#D97706" stroke-width="3"/>
      <line x1="100" y1="60" x2="100" y2="140" stroke="#D97706" stroke-width="3"/>
    `;
  } else if (s.includes('TEA') || n.includes('tea') || n.includes('chamomile')) {
    // Tea leaf & cup
    glyph = `
      <path d="M70 90 h60 v30 a30 30 0 0 1 -60 0 z" fill="#1F241C" stroke="#E6E2D8" stroke-width="4"/>
      <path d="M100 55 q 20 15 0 30 q -20 -15 0 -30 z" fill="#10B981" stroke="#A7F3D0" stroke-width="2"/>
    `;
  } else if (s.includes('HON') || n.includes('honey')) {
    // Honey jar
    glyph = `
      <rect x="75" y="70" width="50" height="15" rx="4" fill="#3D2E14" stroke="#FBBF24" stroke-width="3"/>
      <rect x="70" y="85" width="60" height="55" rx="12" fill="#261E0F" stroke="#FBBF24" stroke-width="4"/>
      <circle cx="100" cy="112" r="14" fill="#3D2E14" stroke="#F59E0B" stroke-width="2"/>
    `;
  } else if (s.includes('OIL') || n.includes('evoo') || n.includes('oil')) {
    // Oil bottle
    glyph = `
      <rect x="92" y="55" width="16" height="25" rx="3" fill="#242B1A" stroke="#84CC16" stroke-width="3"/>
      <path d="M85 80 h30 l10 20 v40 h-50 v-40 z" fill="#1A2113" stroke="#84CC16" stroke-width="4"/>
    `;
  } else if (s.includes('GAN') || (n.includes('charger') && n.includes('gan'))) {
    // GaN charger
    glyph = `
      <rect x="65" y="65" width="70" height="70" rx="14" fill="#1F1E1A" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="80" y="82" width="18" height="8" rx="3" fill="#F97316"/>
      <rect x="80" y="96" width="18" height="8" rx="3" fill="#F97316"/>
      <rect x="80" y="110" width="18" height="10" rx="3" fill="#6B7280"/>
      <path d="M112 85 l-6 16 h8 l-4 14" fill="none" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else if (s.includes('CBL') || n.includes('cable')) {
    // Braided cable
    glyph = `
      <path d="M60 120 c 20 -60 60 60 80 0" fill="none" stroke="#8C867A" stroke-width="8" stroke-linecap="round"/>
      <rect x="52" y="115" width="18" height="12" rx="4" fill="#24221C" stroke="#F97316" stroke-width="3"/>
      <rect x="130" y="115" width="18" height="12" rx="4" fill="#24221C" stroke="#F97316" stroke-width="3"/>
    `;
  } else if (s.includes('HUB') || n.includes('hub')) {
    // Multiport hub
    glyph = `
      <rect x="55" y="80" width="90" height="40" rx="8" fill="#22201C" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="68" y="94" width="14" height="6" rx="2" fill="#F97316"/>
      <rect x="88" y="94" width="14" height="6" rx="2" fill="#60A5FA"/>
      <rect x="108" y="94" width="14" height="6" rx="2" fill="#60A5FA"/>
      <rect x="128" y="94" width="8" height="12" rx="2" fill="#A8A29E"/>
    `;
  } else if (s.includes('CAM') || n.includes('webcam') || n.includes('camera')) {
    // Camera lens
    glyph = `
      <rect x="65" y="70" width="70" height="60" rx="14" fill="#1C1B18" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="100" cy="100" r="20" fill="#282620" stroke="#F97316" stroke-width="4"/>
      <circle cx="100" cy="100" r="10" fill="#0F0E0C" stroke="#60A5FA" stroke-width="3"/>
      <circle cx="122" cy="80" r="3" fill="#22C55E"/>
    `;
  } else if (s.includes('KB') || n.includes('keyboard')) {
    // Keyboard
    glyph = `
      <rect x="50" y="75" width="100" height="50" rx="8" fill="#1F1D19" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="60" y1="88" x2="140" y2="88" stroke="#8C867A" stroke-width="4" stroke-dasharray="8 4"/>
      <line x1="60" y1="100" x2="140" y2="100" stroke="#8C867A" stroke-width="4" stroke-dasharray="8 4"/>
      <line x1="75" y1="112" x2="125" y2="112" stroke="#F97316" stroke-width="4"/>
    `;
  } else if (s.includes('MS-ERGO') || n.includes('mouse')) {
    // Ergonomic mouse
    glyph = `
      <path d="M75 125 c -15 -30 0 -60 25 -60 c 25 0 35 30 25 60 z" fill="#22201B" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="100" y1="65" x2="100" y2="90" stroke="#F97316" stroke-width="3"/>
      <rect x="97" y="75" width="6" height="12" rx="3" fill="#F97316"/>
    `;
  } else if (s.includes('BNK') || n.includes('power bank')) {
    // Power bank
    glyph = `
      <rect x="65" y="60" width="70" height="80" rx="10" fill="#201E1A" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="85" cy="76" r="3" fill="#22C55E"/>
      <circle cx="95" cy="76" r="3" fill="#22C55E"/>
      <circle cx="105" cy="76" r="3" fill="#22C55E"/>
      <circle cx="115" cy="76" r="3" fill="#22C55E"/>
      <rect x="80" y="115" width="18" height="8" rx="2" fill="#F97316"/>
      <rect x="102" y="115" width="18" height="8" rx="2" fill="#6B7280"/>
    `;
  } else if (s.includes('STAND-MAG') || n.includes('magsafe')) {
    // MagSafe stand
    glyph = `
      <ellipse cx="100" cy="130" rx="35" ry="12" fill="#24221C" stroke="#8C867A" stroke-width="3"/>
      <line x1="100" y1="130" x2="100" y2="80" stroke="#E6E2D8" stroke-width="6"/>
      <circle cx="100" cy="75" r="24" fill="#24221C" stroke="#F97316" stroke-width="4"/>
      <circle cx="100" cy="75" r="14" fill="none" stroke="#E6E2D8" stroke-width="2" stroke-dasharray="4 3"/>
    `;
  } else if (s.includes('SPK') || n.includes('speaker')) {
    // Bluetooth speaker
    glyph = `
      <rect x="75" y="60" width="50" height="80" rx="16" fill="#1F1D19" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="100" cy="85" r="16" fill="#2A2722" stroke="#F97316" stroke-width="3"/>
      <circle cx="100" cy="118" r="10" fill="#2A2722" stroke="#8C867A" stroke-width="2"/>
    `;
  } else if (s.includes('EAR') || n.includes('earbuds')) {
    // Earbuds
    glyph = `
      <rect x="65" y="70" width="70" height="60" rx="20" fill="#1F1E1A" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="65" y1="95" x2="135" y2="95" stroke="#8C867A" stroke-width="2"/>
      <circle cx="100" cy="108" r="3" fill="#22C55E"/>
    `;
  } else if (s.includes('PLUG') || n.includes('plug')) {
    // Smart plug
    glyph = `
      <rect x="70" y="65" width="60" height="70" rx="14" fill="#211F1B" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="85" y="85" width="8" height="16" rx="2" fill="#F97316"/>
      <rect x="107" y="85" width="8" height="16" rx="2" fill="#F97316"/>
      <circle cx="100" cy="115" r="4" fill="#6B7280"/>
    `;
  } else if (s.includes('HDMI') || n.includes('hdmi')) {
    // HDMI cable
    glyph = `
      <path d="M80 65 h40 l-8 30 h-24 z" fill="#26231E" stroke="#F97316" stroke-width="3"/>
      <rect x="75" y="95" width="50" height="40" rx="6" fill="#1C1A16" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="100" y1="135" x2="100" y2="150" stroke="#8C867A" stroke-width="8" stroke-linecap="round"/>
    `;
  } else if (s.includes('SMART-DB') || n.includes('doorbell')) {
    // Video doorbell
    glyph = `
      <rect x="80" y="55" width="40" height="90" rx="12" fill="#1C1B18" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="100" cy="78" r="10" fill="#2D2A24" stroke="#60A5FA" stroke-width="3"/>
      <circle cx="100" cy="122" r="10" fill="#2D2A24" stroke="#F97316" stroke-width="3"/>
    `;
  } else if (s.includes('SMART-LCK') || n.includes('lock')) {
    // Door lock
    glyph = `
      <rect x="80" y="60" width="40" height="80" rx="8" fill="#1E1D19" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="100" cy="85" r="10" fill="#2E2B25" stroke="#F97316" stroke-width="3"/>
      <line x1="90" y1="115" x2="110" y2="115" stroke="#E6E2D8" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (s.includes('MUG') || n.includes('mug')) {
    // Mug
    glyph = `
      <rect x="70" y="75" width="60" height="55" rx="10" fill="#26241F" stroke="#E6E2D8" stroke-width="4"/>
      <path d="M130 85 h14 a10 10 0 0 1 0 20 h-14" fill="none" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="60" y1="135" x2="140" y2="135" stroke="#8C867A" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (s.includes('PRS') || n.includes('press')) {
    // French press
    glyph = `
      <rect x="75" y="70" width="50" height="70" rx="6" fill="#1E1C18" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="100" y1="50" x2="100" y2="100" stroke="#F97316" stroke-width="3"/>
      <circle cx="100" cy="48" r="6" fill="#F97316"/>
      <line x1="75" y1="100" x2="125" y2="100" stroke="#8C867A" stroke-width="4"/>
      <path d="M125 78 h14 v40 h-14" fill="none" stroke="#E6E2D8" stroke-width="4"/>
    `;
  } else if (s.includes('KTL') || n.includes('kettle')) {
    // Gooseneck kettle
    glyph = `
      <path d="M75 80 h50 l10 45 h-70 z" fill="#24221C" stroke="#E6E2D8" stroke-width="4"/>
      <path d="M65 110 c -25 -5 -15 -45 5 -40" fill="none" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
      <path d="M130 85 h12 v35 h-8" fill="none" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="100" cy="74" r="5" fill="#F97316"/>
    `;
  } else if (s.includes('GRND') || n.includes('grinder')) {
    // Coffee grinder
    glyph = `
      <rect x="80" y="80" width="40" height="65" rx="6" fill="#201E1A" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="100" y1="80" x2="100" y2="60" stroke="#8C867A" stroke-width="4"/>
      <line x1="100" y1="60" x2="135" y2="65" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
      <circle cx="135" cy="65" r="5" fill="#E6E2D8"/>
    `;
  } else if (s.includes('KNF') || n.includes('knife')) {
    // Chef knife
    glyph = `
      <path d="M60 90 h70 q 20 0 25 15 l-95 0 z" fill="#E6E2D8" stroke="#FFFFFF" stroke-width="2"/>
      <rect x="40" y="90" width="22" height="14" rx="3" fill="#451A03" stroke="#F97316" stroke-width="2"/>
      <circle cx="48" cy="97" r="2" fill="#FBBF24"/>
      <circle cx="56" cy="97" r="2" fill="#FBBF24"/>
    `;
  } else if (s.includes('TWL') || n.includes('towel')) {
    // Towel
    glyph = `
      <rect x="65" y="70" width="70" height="40" rx="8" fill="#2A2722" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="65" y="95" width="70" height="35" rx="8" fill="#1F1D19" stroke="#8C867A" stroke-width="3"/>
      <line x1="75" y1="120" x2="125" y2="120" stroke="#F97316" stroke-width="3" stroke-dasharray="4 3"/>
    `;
  } else if (s.includes('HUMID') || n.includes('humidifier')) {
    // Humidifier
    glyph = `
      <rect x="75" y="80" width="50" height="60" rx="14" fill="#1C2127" stroke="#60A5FA" stroke-width="4"/>
      <path d="M100 55 q 5 10 0 15" fill="none" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
      <path d="M92 60 q 4 8 0 12" fill="none" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
      <path d="M108 60 q 4 8 0 12" fill="none" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
    `;
  } else if (s.includes('CNDL') || n.includes('candle')) {
    // Candle
    glyph = `
      <rect x="75" y="80" width="50" height="55" rx="6" fill="#382E1E" stroke="#FBBF24" stroke-width="4"/>
      <line x1="100" y1="80" x2="100" y2="70" stroke="#8C867A" stroke-width="3"/>
      <path d="M100 52 q 8 10 0 18 q -8 -8 0 -18 z" fill="#F97316" stroke="#FEF08A" stroke-width="2"/>
    `;
  } else if (s.includes('BOWL') || n.includes('bowl')) {
    // Ramen bowl
    glyph = `
      <path d="M60 90 h80 c 0 35 -20 45 -40 45 s -40 -10 -40 -45 z" fill="#24221C" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="65" y1="80" x2="130" y2="65" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
      <line x1="70" y1="85" x2="135" y2="70" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (s.includes('MAT') || n.includes('mat')) {
    // Mat
    glyph = `
      <rect x="55" y="80" width="90" height="40" rx="6" fill="#26241E" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="70" y1="90" x2="130" y2="90" stroke="#8C867A" stroke-width="2" stroke-dasharray="6 4"/>
      <line x1="70" y1="100" x2="130" y2="100" stroke="#8C867A" stroke-width="2" stroke-dasharray="6 4"/>
      <line x1="70" y1="110" x2="130" y2="110" stroke="#8C867A" stroke-width="2" stroke-dasharray="6 4"/>
    `;
  } else if (s.includes('WIND') || s.includes('TEE') || s.includes('HOD') || n.includes('jacket') || n.includes('shirt') || n.includes('hoodie')) {
    // Apparel / Shirt / Jacket
    glyph = `
      <path d="M75 65 l-20 15 l12 20 l13 -10 v40 h40 v-40 l13 10 l12 -20 l-20 -15 q -25 15 -50 0 z" fill="#23211D" stroke="#E6E2D8" stroke-width="4" stroke-linejoin="round"/>
      <line x1="100" y1="73" x2="100" y2="130" stroke="#F97316" stroke-width="2"/>
    `;
  } else if (s.includes('BEAN') || n.includes('beanie')) {
    // Beanie
    glyph = `
      <path d="M65 110 c 0 -35 20 -45 35 -45 s 35 10 35 45 z" fill="#282620" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="62" y="110" width="76" height="18" rx="4" fill="#1C1B17" stroke="#F97316" stroke-width="3"/>
      <circle cx="100" cy="62" r="6" fill="#8C867A"/>
    `;
  } else if (s.includes('BPK') || n.includes('backpack')) {
    // Backpack
    glyph = `
      <rect x="70" y="65" width="60" height="75" rx="14" fill="#24221D" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="80" y="95" width="40" height="35" rx="6" fill="#1A1916" stroke="#8C867A" stroke-width="3"/>
      <line x1="100" y1="95" x2="100" y2="130" stroke="#F97316" stroke-width="2"/>
      <path d="M88 65 v-10 a12 12 0 0 1 24 0 v10" fill="none" stroke="#E6E2D8" stroke-width="3"/>
    `;
  } else if (s.includes('TOTE') || n.includes('tote')) {
    // Tote bag
    glyph = `
      <path d="M70 85 l5 50 h50 l5 -50 z" fill="#28251F" stroke="#E6E2D8" stroke-width="4"/>
      <path d="M85 85 v-20 a15 15 0 0 1 30 0 v20" fill="none" stroke="#F97316" stroke-width="3"/>
    `;
  } else if (s.includes('SUN') || n.includes('sunglasses')) {
    // Sunglasses
    glyph = `
      <rect x="55" y="90" width="38" height="26" rx="8" fill="#100F0D" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="107" y="90" width="38" height="26" rx="8" fill="#100F0D" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="93" y1="98" x2="107" y2="98" stroke="#F97316" stroke-width="4"/>
      <line x1="45" y1="93" x2="55" y2="93" stroke="#8C867A" stroke-width="3"/>
      <line x1="145" y1="93" x2="155" y2="93" stroke="#8C867A" stroke-width="3"/>
    `;
  } else if (s.includes('BTL') || n.includes('bottle')) {
    // Water bottle
    glyph = `
      <rect x="88" y="55" width="24" height="15" rx="3" fill="#3D3A32" stroke="#E6E2D8" stroke-width="3"/>
      <rect x="75" y="70" width="50" height="75" rx="14" fill="#24221C" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="75" y1="95" x2="125" y2="95" stroke="#F97316" stroke-width="3"/>
    `;
  } else if (s.includes('BAND') || n.includes('bands')) {
    // Fitness bands
    glyph = `
      <ellipse cx="100" cy="80" rx="40" ry="14" fill="none" stroke="#F97316" stroke-width="5"/>
      <ellipse cx="100" cy="100" rx="40" ry="14" fill="none" stroke="#3B82F6" stroke-width="5"/>
      <ellipse cx="100" cy="120" rx="40" ry="14" fill="none" stroke="#22C55E" stroke-width="5"/>
    `;
  } else if (s.includes('NOTE') || n.includes('journal') || n.includes('notes')) {
    // Journal
    glyph = `
      <rect x="70" y="60" width="60" height="80" rx="6" fill="#211F1B" stroke="#E6E2D8" stroke-width="4"/>
      <line x1="82" y1="60" x2="82" y2="140" stroke="#8C867A" stroke-width="3"/>
      <line x1="92" y1="80" x2="120" y2="80" stroke="#8C867A" stroke-width="2"/>
      <line x1="92" y1="95" x2="120" y2="95" stroke="#8C867A" stroke-width="2"/>
      <line x1="92" y1="110" x2="115" y2="110" stroke="#F97316" stroke-width="2"/>
    `;
  } else if (s.includes('PEN') || n.includes('pen')) {
    // Solid brass pen
    glyph = `
      <line x1="70" y1="130" x2="130" y2="70" stroke="#FBBF24" stroke-width="6" stroke-linecap="round"/>
      <polygon points="65,135 68,126 74,132" fill="#E6E2D8"/>
      <line x1="118" y1="82" x2="124" y2="76" stroke="#451A03" stroke-width="8"/>
    `;
  } else if (s.includes('SRM') || s.includes('SUN') || s.includes('BALM') || s.includes('SOAP') || category === 'beauty') {
    // Beauty / serum / balm
    glyph = `
      <rect x="80" y="75" width="40" height="65" rx="10" fill="#24211D" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="90" y="60" width="20" height="15" rx="3" fill="#3B3830" stroke="#F97316" stroke-width="2"/>
      <circle cx="100" cy="105" r="10" fill="#2E2A24" stroke="#F43F5E" stroke-width="2"/>
    `;
  } else if (s.includes('KEY') || n.includes('keychain')) {
    // Keychain
    glyph = `
      <circle cx="85" cy="75" r="15" fill="none" stroke="#E6E2D8" stroke-width="4"/>
      <circle cx="115" cy="110" r="22" fill="#24211C" stroke="#F97316" stroke-width="4"/>
      <line x1="95" y1="85" x2="105" y2="95" stroke="#8C867A" stroke-width="3"/>
    `;
  } else if (s.includes('PIN') || n.includes('pin')) {
    // Enamel pin
    glyph = `
      <polygon points="100,65 125,85 115,120 85,120 75,85" fill="#25221B" stroke="#FBBF24" stroke-width="4"/>
      <circle cx="100" cy="95" r="10" fill="#F97316" stroke="#E6E2D8" stroke-width="2"/>
    `;
  } else {
    // Generic sleek industrial product box with category initial
    const catInitial = (category || 'P').charAt(0).toUpperCase();
    glyph = `
      <rect x="65" y="65" width="70" height="70" rx="14" fill="#211F1B" stroke="#E6E2D8" stroke-width="4"/>
      <rect x="80" y="80" width="40" height="40" rx="8" fill="#181714" stroke="#8C867A" stroke-width="2"/>
      <text x="100" y="107" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="22" fill="#F97316">${catInitial}</text>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="${name.replace(/"/g, '&quot;')}">
  <defs>
    <radialGradient id="grad-${sku}" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#23211C"/>
      <stop offset="100%" stop-color="#141310"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" rx="20" fill="url(#grad-${sku})" stroke="#2B2923" stroke-width="2"/>
  <rect x="6" y="6" width="188" height="188" rx="16" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  
  <!-- Subtle SKU Watermark -->
  <text x="16" y="28" font-family="monospace" font-size="9" fill="#5E594D" letter-spacing="0.5">${sku}</text>
  
  <!-- Graphic Glyph -->
  <g>
    ${glyph}
  </g>
</svg>`;
}

let generated = 0;
for (const p of products) {
  const svg = generateSvg(p);
  const filePath = path.join(outputDir, `${p.sku}.svg`);
  fs.writeFileSync(filePath, svg, 'utf8');
  generated++;
}

console.log(`Successfully generated ${generated} SVG product icons in ${outputDir}`);
