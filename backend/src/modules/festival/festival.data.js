/**
 * @fileoverview Master festival calendar for India (all states) and Australia.
 * Dates use dynamic computation for lunar/Hindu calendar approximations
 * and fixed Gregorian dates where applicable.
 */

/**
 * Returns YYYY-MM-DD string for a given year/month/day.
 */
function d(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/**
 * Approximate lunar festival dates for 2024-2027.
 * Real production would use an astronomy library (ephem/hijri-js).
 * Dates are approximate ±1 day (official govt holidays).
 */
const LUNAR_DATES = {
  diwali:        { 2024: [2024,11,1],  2025: [2025,10,20], 2026: [2026,11,8],  2027: [2027,10,29] },
  holi:          { 2024: [2024,3,25],  2025: [2025,3,14],  2026: [2026,3,3],   2027: [2027,3,22]  },
  eid_ul_fitr:   { 2024: [2024,4,10],  2025: [2025,3,31],  2026: [2026,3,20],  2027: [2027,3,9]   },
  eid_ul_adha:   { 2024: [2024,6,17],  2025: [2025,6,7],   2026: [2026,5,27],  2027: [2027,5,17]  },
  muharram:      { 2024: [2024,7,7],   2025: [2025,6,26],  2026: [2026,6,16],  2027: [2027,6,5]   },
  onam:          { 2024: [2024,9,15],  2025: [2025,9,5],   2026: [2026,8,25],  2027: [2027,9,13]  },
  ganesh_chaturthi:{ 2024:[2024,9,7],  2025:[2025,8,27],   2026:[2026,8,17],   2027:[2027,9,5]    },
  durga_puja:    { 2024: [2024,10,12], 2025: [2025,10,2],  2026: [2026,10,20], 2027: [2027,10,10] },
  navratri:      { 2024: [2024,10,3],  2025: [2025,9,22],  2026: [2026,10,11], 2027: [2027,10,1]  },
  janmashtami:   { 2024: [2024,8,26],  2025: [2025,8,16],  2026: [2026,8,5],   2027: [2027,8,24]  },
  guru_nanak_jayanti: { 2024:[2024,11,15], 2025:[2025,11,5], 2026:[2026,11,24], 2027:[2027,11,13] },
  chinese_new_year: { 2024:[2024,2,10], 2025:[2025,1,29], 2026:[2026,2,17], 2027:[2027,2,6] },
};

function lunarDate(key, year) {
  const map = LUNAR_DATES[key];
  if (!map) return null;
  const arr = map[year] || map[Object.keys(map)[0]];
  return d(...arr);
}

function durationEnd(startStr, days) {
  const dt = new Date(startStr);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0,10);
}

/**
 * Generates the full festival calendar for a given year.
 * @param {number} year
 * @returns {Array<FestivalDef>}
 */
function generateCalendar(year) {
  const Y = year;

  const festivals = [
    // ─── PAN-INDIA ────────────────────────────────────────────────
    {
      key: 'diwali',
      name: 'Diwali – Festival of Lights 🪔',
      country: 'IN',
      regions: ['all'],
      start: lunarDate('diwali', Y),
      end:   durationEnd(lunarDate('diwali', Y), 5),
      special_mode: null,
      theme: {
        primary: '#FF6B00', accent: '#FFD700', bg: '#1a0a00',
        emoji: '🪔', banner: 'Happy Diwali! Spread the light.',
        style: 'festive-orange',
      },
      menu_tags: ['sweets', 'mithai', 'namkeen', 'chai', 'paneer', 'dry_fruits'],
      suggested_items: ['Gulab Jamun', 'Kaju Katli', 'Rasgulla', 'Kheer', 'Chakli', 'Mixture', 'Masala Chai', 'Jalebi'],
      offer_structure: { type: 'combo', label: 'Diwali Mithai Box', value: 15, unit: 'percent', min_order: 500 },
      decor_tips: ['Diya string lights banner', 'Rangoli table mats', 'Gold & saffron table drapes'],
      category: 'pan_india',
    },
    {
      key: 'holi',
      name: 'Holi – Festival of Colours 🎨',
      country: 'IN',
      regions: ['all'],
      start: lunarDate('holi', Y),
      end:   durationEnd(lunarDate('holi', Y), 2),
      special_mode: null,
      theme: {
        primary: '#E91E63', accent: '#9C27B0', bg: '#1a001a',
        emoji: '🎨', banner: 'Bura na mano, Holi hai!',
        style: 'festive-pink',
      },
      menu_tags: ['thandai', 'gujiya', 'sweets', 'namkeen', 'beverages'],
      suggested_items: ['Thandai', 'Gujiya', 'Dahi Bhalla', 'Puran Poli', 'Namak Para', 'Malpua', 'Lassi'],
      offer_structure: { type: 'discount', label: 'Holi Special Platter', value: 20, unit: 'percent', min_order: 300 },
      decor_tips: ['Colourful streamers', 'Floral centrepieces', 'Rangoli at entrance'],
      category: 'pan_india',
    },
    {
      key: 'eid_ul_fitr',
      name: 'Eid ul-Fitr – Meethi Eid 🌙',
      country: 'IN',
      regions: ['all'],
      start: lunarDate('eid_ul_fitr', Y),
      end:   durationEnd(lunarDate('eid_ul_fitr', Y), 3),
      special_mode: null,
      theme: {
        primary: '#00897B', accent: '#FFD700', bg: '#001a15',
        emoji: '🌙', banner: 'Eid Mubarak! Khushiyan aur barkat mile.',
        style: 'festive-green',
      },
      menu_tags: ['biryani', 'kebab', 'haleem', 'sheer_khurma', 'non_veg'],
      suggested_items: ['Dum Biryani', 'Seekh Kebab', 'Haleem', 'Sheer Khurma', 'Firni', 'Mutton Rogan Josh', 'Phirni', 'Sewai'],
      offer_structure: { type: 'combo', label: 'Eid Dawat Special', value: 18, unit: 'percent', min_order: 600 },
      decor_tips: ['Crescent & star motifs', 'Green & gold drapes', 'Arabic lanterns'],
      category: 'pan_india',
    },
    {
      key: 'eid_ul_adha',
      name: 'Eid ul-Adha – Bakrid 🐑',
      country: 'IN',
      regions: ['all'],
      start: lunarDate('eid_ul_adha', Y),
      end:   durationEnd(lunarDate('eid_ul_adha', Y), 3),
      special_mode: null,
      theme: {
        primary: '#2E7D32', accent: '#FFD700', bg: '#001500',
        emoji: '🌙', banner: 'Eid ul-Adha Mubarak!',
        style: 'festive-green',
      },
      menu_tags: ['mutton', 'kebab', 'biryani', 'non_veg'],
      suggested_items: ['Mutton Biryani', 'Seekh Kebab', 'Nihari', 'Haleem', 'Mutton Korma', 'Sheer Khurma'],
      offer_structure: { type: 'discount', label: 'Bakrid Feast', value: 15, unit: 'percent', min_order: 500 },
      decor_tips: ['Islamic geometric patterns', 'Star & crescent', 'Gold & green banners'],
      category: 'pan_india',
    },
    {
      key: 'navratri',
      name: 'Navratri – Nine Nights 🪷',
      country: 'IN',
      regions: ['GJ', 'RJ', 'MP', 'MH', 'UP', 'HR', 'PB'],
      start: lunarDate('navratri', Y),
      end:   durationEnd(lunarDate('navratri', Y), 9),
      special_mode: 'satvik',
      theme: {
        primary: '#AB47BC', accent: '#FF8F00', bg: '#1a0020',
        emoji: '🪷', banner: 'Jai Mata Di! Navratri Greetings.',
        style: 'festive-purple',
      },
      menu_tags: ['vrat', 'satvik', 'no_onion_garlic', 'fasting'],
      suggested_items: ['Sabudana Khichdi', 'Kuttu Puri', 'Aloo Ki Subzi (no garlic)', 'Singhara Halwa', 'Makhana Kheer', 'Fruit Chaat', 'Rajgira Paratha'],
      offer_structure: { type: 'thali', label: 'Vrat Thali Special', value: 12, unit: 'percent', min_order: 200 },
      decor_tips: ['Marigold garlands', 'Red dupatta draping', 'Devi images at entrance'],
      category: 'regional',
    },
    {
      key: 'christmas',
      name: 'Christmas 🎄',
      country: 'IN',
      regions: ['all'],
      start: d(Y, 12, 20),
      end:   d(Y, 12, 26),
      special_mode: null,
      theme: {
        primary: '#C62828', accent: '#2E7D32', bg: '#001400',
        emoji: '🎄', banner: 'Merry Christmas & Happy New Year!',
        style: 'festive-red-green',
      },
      menu_tags: ['plum_cake', 'wine', 'roast', 'desserts', 'beverages'],
      suggested_items: ['Plum Cake', 'Gingerbread Cookies', 'Mulled Wine', 'Roast Chicken', 'Yule Log Cake', 'Hot Cocoa', 'Mince Pies'],
      offer_structure: { type: 'bundle', label: 'Christmas Feast Box', value: 20, unit: 'percent', min_order: 800 },
      decor_tips: ['Christmas tree', 'Santa hat table markers', 'Red & green table runners', 'Snowflake fairy lights'],
      category: 'pan_india',
    },

    // ─── SOUTH INDIA ──────────────────────────────────────────────
    {
      key: 'onam',
      name: 'Onam – Harvest Festival 🌸',
      country: 'IN',
      regions: ['KL'],
      start: lunarDate('onam', Y),
      end:   durationEnd(lunarDate('onam', Y), 10),
      special_mode: 'sadhya',
      theme: {
        primary: '#F57F17', accent: '#2E7D32', bg: '#001500',
        emoji: '🌸', banner: 'Onam Ashamsakal! Onasadhya thayar.',
        style: 'festive-golden',
      },
      menu_tags: ['sadhya', 'kerala', 'banana_leaf', 'vegetarian'],
      suggested_items: ['Avial', 'Olan', 'Thoran', 'Erissery', 'Sambar', 'Rasam', 'Payasam', 'Pappadam', 'Pickle', 'Banana Chips', 'Pachadi', 'Kalan'],
      offer_structure: { type: 'sadhya_meal', label: 'Onam Sadhya Thali (26 dishes)', value: 10, unit: 'percent', min_order: 400 },
      decor_tips: ['Pookalam (flower rangoli)', 'Banana leaves as placemats', 'Yellow & green drapes', 'Traditional Kerala lamps (nilavilakku)'],
      category: 'state_specific',
    },
    {
      key: 'pongal',
      name: 'Thai Pongal – Harvest 🌾',
      country: 'IN',
      regions: ['TN'],
      start: d(Y, 1, 14),
      end:   d(Y, 1, 17),
      special_mode: 'pongal_special',
      theme: {
        primary: '#F9A825', accent: '#E65100', bg: '#1a0e00',
        emoji: '🌾', banner: 'Pongal O Pongal! Iniya Thai Pongal!',
        style: 'festive-yellow',
      },
      menu_tags: ['pongal', 'tamil', 'rice', 'jaggery'],
      suggested_items: ['Ven Pongal', 'Sakkarai Pongal', 'Medu Vada', 'Coconut Chutney', 'Sambar', 'Kozhukattai', 'Adhirasam', 'Murukku'],
      offer_structure: { type: 'thali', label: 'Pongal Special Meal', value: 15, unit: 'percent', min_order: 250 },
      decor_tips: ['Sugarcane décor', 'Clay pot Pongal display', 'Kolam at entrance', 'Banana bunches'],
      category: 'state_specific',
    },
    {
      key: 'ugadi',
      name: 'Ugadi – Telugu New Year 🌿',
      country: 'IN',
      regions: ['AP', 'TS', 'KA'],
      start: d(Y, 3, 30), // ~varies, using approx
      end:   d(Y, 4, 1),
      special_mode: null,
      theme: {
        primary: '#558B2F', accent: '#FFD600', bg: '#0a1500',
        emoji: '🌿', banner: 'Ugadi Subhakankshalu!',
        style: 'festive-green',
      },
      menu_tags: ['andhra', 'telangana', 'tamarind', 'jaggery', 'neem'],
      suggested_items: ['Ugadi Pachadi', 'Pulihora', 'Bobbatlu', 'Payasam', 'Pesarattu', 'Gongura Chutney', 'Gulab Jamun'],
      offer_structure: { type: 'discount', label: 'Ugadi Special Combo', value: 12, unit: 'percent', min_order: 300 },
      decor_tips: ['Mango leaf torans', 'Neem flowers', 'Yellow & green decorations'],
      category: 'state_specific',
    },
    {
      key: 'vishu',
      name: 'Vishu – Kerala New Year ✨',
      country: 'IN',
      regions: ['KL'],
      start: d(Y, 4, 14),
      end:   d(Y, 4, 15),
      special_mode: 'sadhya',
      theme: {
        primary: '#F57F17', accent: '#FFD600', bg: '#1a1000',
        emoji: '✨', banner: 'Vishu Ashamsakal! Kanikkonna pookkal!',
        style: 'festive-golden',
      },
      menu_tags: ['kerala', 'sadhya', 'banana_leaf'],
      suggested_items: ['Vishu Kanji', 'Avial', 'Thoran', 'Erissery', 'Payasam', 'Papadom', 'Mango Pickle'],
      offer_structure: { type: 'sadhya_meal', label: 'Vishu Sadhya', value: 10, unit: 'percent', min_order: 350 },
      decor_tips: ['Kani display (fruits, gold, flowers)', 'Kanikkonna garlands', 'Banana leaves'],
      category: 'state_specific',
    },

    // ─── NORTH & WEST INDIA ───────────────────────────────────────
    {
      key: 'lohri',
      name: 'Lohri – Punjabi Harvest Fire 🔥',
      country: 'IN',
      regions: ['PB', 'HR', 'HP', 'JK', 'DL'],
      start: d(Y, 1, 13),
      end:   d(Y, 1, 14),
      special_mode: 'lohri_special',
      theme: {
        primary: '#E53935', accent: '#FF8F00', bg: '#1a0500',
        emoji: '🔥', banner: 'Sunder Mundariye! Happy Lohri!',
        style: 'festive-fire',
      },
      menu_tags: ['punjabi', 'sarson', 'makki', 'butter', 'rewari', 'til'],
      suggested_items: ['Sarson Da Saag', 'Makki Di Roti', 'White Butter', 'Gur Di Kheer', 'Til Ladoo', 'Rewari', 'Peanut Chikki', 'Lassi', 'Pinni'],
      offer_structure: { type: 'combo', label: 'Lohri Dhaba Special', value: 20, unit: 'percent', min_order: 400 },
      decor_tips: ['Bonfire motif, phulkari embroidery', 'Earthen diyas', 'Yellow & orange mustard flowers', 'Jute table runners'],
      category: 'state_specific',
    },
    {
      key: 'baisakhi',
      name: 'Baisakhi – Punjab Harvest 🌾',
      country: 'IN',
      regions: ['PB', 'HR', 'HP', 'DL'],
      start: d(Y, 4, 13),
      end:   d(Y, 4, 14),
      special_mode: 'baisakhi_special',
      theme: {
        primary: '#F57F17', accent: '#1B5E20', bg: '#0a1000',
        emoji: '🌾', banner: 'Wahe Guru! Happy Baisakhi!',
        style: 'festive-yellow',
      },
      menu_tags: ['punjabi', 'amritsari', 'lassi', 'butter', 'sarson'],
      suggested_items: ['Amritsari Chole', 'Makki Roti', 'Sarson Saag', 'Mango Lassi', 'Pinni', 'Gajrela', 'Karah Prashad', 'Langar Daal'],
      offer_structure: { type: 'thali', label: 'Baisakhi Grand Thali', value: 15, unit: 'percent', min_order: 350 },
      decor_tips: ['Bhangra dancer cutouts', 'Wheat stalks bouquets', 'Phulkari banner', 'Yellow & green balloons'],
      category: 'state_specific',
    },
    {
      key: 'ganesh_chaturthi',
      name: 'Ganesh Chaturthi 🐘',
      country: 'IN',
      regions: ['MH', 'GJ', 'KA', 'AP', 'TS'],
      start: lunarDate('ganesh_chaturthi', Y),
      end:   durationEnd(lunarDate('ganesh_chaturthi', Y), 10),
      special_mode: null,
      theme: {
        primary: '#FF8F00', accent: '#E53935', bg: '#1a0a00',
        emoji: '🐘', banner: 'Ganpati Bappa Morya! 🐘',
        style: 'festive-orange',
      },
      menu_tags: ['modak', 'sweets', 'maharashtrian', 'veg'],
      suggested_items: ['Ukadiche Modak', 'Fried Modak', 'Puran Poli', 'Karanji', 'Kothimbir Vadi', 'Shrikhand', 'Batata Vada', 'Coconut Laddoo'],
      offer_structure: { type: 'combo', label: 'Modak Combo Platter', value: 15, unit: 'percent', min_order: 300 },
      decor_tips: ['Ganesh idol centrepiece', 'Marigold garlands', 'Orange & red drapes', 'Banana leaf décor'],
      category: 'state_specific',
    },
    {
      key: 'durga_puja',
      name: 'Durga Puja – Mahasaptami to Vijayadashami 🌺',
      country: 'IN',
      regions: ['WB', 'AS', 'OR', 'TRP'],
      start: lunarDate('durga_puja', Y),
      end:   durationEnd(lunarDate('durga_puja', Y), 5),
      special_mode: null,
      theme: {
        primary: '#C62828', accent: '#FF8F00', bg: '#1a0000',
        emoji: '🌺', banner: 'Subho Bijoya! Durga Puja Greetings.',
        style: 'festive-red',
      },
      menu_tags: ['bengali', 'mishti', 'fish', 'mutton'],
      suggested_items: ['Kosha Mangsho', 'Luchi', 'Mishti Doi', 'Rasgolla', 'Prawn Malai Curry', 'Bhetki Fish Fry', 'Sandesh', 'Chelo Kebab'],
      offer_structure: { type: 'thali', label: 'Pujo Special Bhoj', value: 18, unit: 'percent', min_order: 500 },
      decor_tips: ['Dhunuchi (incense burner)', 'Red & white flowers', 'Bengal cotton saree motifs', 'Dhaak drum display'],
      category: 'state_specific',
    },

    // ─── AUSTRALIA ────────────────────────────────────────────────
    {
      key: 'au_christmas',
      name: 'Christmas – Summer Edition 🎄☀️',
      country: 'AU',
      regions: ['all'],
      start: d(Y, 12, 20),
      end:   d(Y, 12, 27),
      special_mode: 'summer_christmas',
      theme: {
        primary: '#C62828', accent: '#F9A825', bg: '#001400',
        emoji: '🎄', banner: 'Merry Christmas! Summer BBQ special.',
        style: 'festive-red-green',
      },
      menu_tags: ['bbq', 'seafood', 'cold_drinks', 'pavlova', 'roast'],
      suggested_items: ['BBQ Prawns', 'Grilled Barramundi', 'Pavlova', 'Cold Turkey Salad', 'Trifle', 'Mango Sorbet', 'Sparkling Lemonade', 'Summer Sangria'],
      offer_structure: { type: 'bundle', label: 'Christmas BBQ Feast', value: 20, unit: 'percent', min_order: 80 },
      decor_tips: ['Outdoor summer vibes', 'Fairy lights on veranda', 'Beach-themed Christmas', 'Tropical flowers'],
      category: 'australia',
    },
    {
      key: 'au_australia_day',
      name: "Australia Day 🇦🇺",
      country: 'AU',
      regions: ['all'],
      start: d(Y, 1, 26),
      end:   d(Y, 1, 27),
      special_mode: null,
      theme: {
        primary: '#003087', accent: '#FFD700', bg: '#000820',
        emoji: '🇦🇺', banner: "G'day! Celebrate Australia Day.",
        style: 'festive-blue-gold',
      },
      menu_tags: ['bbq', 'lamb', 'beef', 'cold_drinks', 'pies'],
      suggested_items: ['Lamb Chops', 'Beef Burger', 'Sausage Sizzle', 'Tim Tam Slice', 'Meat Pie', 'Vegemite Toast', 'XXXX Gold Beer Battered Fish', 'Lamington'],
      offer_structure: { type: 'discount', label: "Aussie BBQ Special", value: 15, unit: 'percent', min_order: 60 },
      decor_tips: ['Australian flag bunting', 'Green & gold table covers', 'Outdoor BBQ setup'],
      category: 'australia',
    },
    {
      key: 'au_easter',
      name: 'Easter Long Weekend 🐣',
      country: 'AU',
      regions: ['all'],
      start: d(Y, 3, 29), // approximate, varies
      end:   d(Y, 4, 1),
      special_mode: null,
      theme: {
        primary: '#7B1FA2', accent: '#F9A825', bg: '#0d0020',
        emoji: '🐣', banner: 'Happy Easter! Hot cross buns & more.',
        style: 'festive-purple',
      },
      menu_tags: ['hot_cross_buns', 'chocolate', 'seafood', 'lamb'],
      suggested_items: ['Hot Cross Buns', 'Chocolate Fondant', 'Grilled Snapper', 'Roast Lamb', 'Simnel Cake', 'Easter Egg Pancakes', 'Seafood Platter'],
      offer_structure: { type: 'combo', label: 'Easter Brunch Special', value: 18, unit: 'percent', min_order: 70 },
      decor_tips: ['Pastel Easter eggs', 'Bunny figurines', 'Spring flower bouquets', 'Purple & yellow colour scheme'],
      category: 'australia',
    },
    {
      key: 'au_melbourne_cup',
      name: 'Melbourne Cup – Race That Stops a Nation 🏇',
      country: 'AU',
      regions: ['VIC', 'all'],
      start: d(Y, 11, 4), // first Tuesday November approx
      end:   d(Y, 11, 4),
      special_mode: null,
      theme: {
        primary: '#880E4F', accent: '#F9A825', bg: '#1a0010',
        emoji: '🏇', banner: "It's race day! Melbourne Cup specials.",
        style: 'festive-pink-gold',
      },
      menu_tags: ['champagne_food', 'finger_food', 'afternoon_tea', 'canapés'],
      suggested_items: ['Smoked Salmon Blinis', 'Prawn Cocktail', 'Champagne Chicken', 'Strawberry Tart', 'Cheese Platter', 'Devilled Eggs', 'Cucumber Sandwiches'],
      offer_structure: { type: 'bundle', label: 'Cup Day Champagne Package', value: 15, unit: 'percent', min_order: 100 },
      decor_tips: ['Racing silks colour scheme', 'Fascinator hat display', 'Gold & rose gold décor'],
      category: 'australia',
    },
    {
      key: 'au_lunar_new_year',
      name: 'Lunar New Year 🐲',
      country: 'AU',
      regions: ['NSW', 'VIC', 'all'],
      start: lunarDate('chinese_new_year', Y),
      end:   durationEnd(lunarDate('chinese_new_year', Y), 3),
      special_mode: null,
      theme: {
        primary: '#C62828', accent: '#FFD700', bg: '#1a0000',
        emoji: '🐲', banner: 'Gong Xi Fa Cai! Chúc Mừng Năm Mới!',
        style: 'festive-red-gold',
      },
      menu_tags: ['dumplings', 'noodles', 'asian', 'dim_sum', 'lucky_foods'],
      suggested_items: ['Dim Sum Basket', 'Long Life Noodles', 'Peking Duck', 'Spring Rolls', 'Char Siu Bao', 'Mango Pudding', 'Pineapple Cake', 'Longevity Buns'],
      offer_structure: { type: 'combo', label: 'Lucky Feast Combo', value: 12, unit: 'percent', min_order: 80 },
      decor_tips: ['Red lanterns', 'Gold ingots', 'Lucky red envelopes', 'Dragon motifs'],
      category: 'australia',
    },

    // ─── NEW YEAR ─────────────────────────────────────────────────
    {
      key: 'new_year',
      name: "New Year's Eve & Day 🎆",
      country: 'BOTH',
      regions: ['all'],
      start: d(Y, 12, 30),
      end:   d(Y+1, 1, 2),
      special_mode: null,
      theme: {
        primary: '#1A237E', accent: '#FFD700', bg: '#000010',
        emoji: '🎆', banner: "Welcome {nextYear}! New Year, New Beginnings.",
        style: 'festive-midnight',
      },
      menu_tags: ['party', 'cocktails', 'appetizers', 'desserts', 'beverages'],
      suggested_items: ['Champagne Mocktail', 'Cheese Platter', 'Sushi Platter', 'Truffle Pasta', 'Chocolate Fondue', 'Mini Sliders', 'Midnight Cake'],
      offer_structure: { type: 'bundle', label: 'NYE Party Package', value: 25, unit: 'percent', min_order: 1500 },
      decor_tips: ['Balloon arch', 'Countdown timer display', 'Silver & gold table settings', 'Confetti cannons'],
      category: 'pan_india',
    },
  ];

  return festivals;
}

// Region code → state name map (India)
const INDIA_REGIONS = {
  AN: 'Andaman & Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh',
  AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CG: 'Chhattisgarh',
  DL: 'Delhi', DN: 'Dadra & Nagar Haveli', GA: 'Goa', GJ: 'Gujarat',
  HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu & Kashmir',
  JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', PY: 'Puducherry',
  PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu',
  TS: 'Telangana', TRP: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand',
  WB: 'West Bengal',
};

// Australia state codes
const AU_REGIONS = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

module.exports = { generateCalendar, INDIA_REGIONS, AU_REGIONS };
