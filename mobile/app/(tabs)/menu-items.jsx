import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  StatusBar,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { PressCard } from '../../src/components/PressCard';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  border: '#EAEAEA',
  text1: '#000000',
  text2: '#444444',
  text3: '#888888',
  gold: '#F5A623',
  indigo: '#0070F3',
  success: '#00B341',
  error: '#EE0000',
};

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Category Config ──────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  'Starters',
  'Mains',
  'Breads',
  'Rice',
  'Desserts',
  'Drinks',
  'Specials',
];

const CATEGORY_COLORS = {
  Starters: '#E07843',
  Mains: '#4CAF82',
  Breads: '#D4A027',
  Rice: '#9B59B6',
  Desserts: '#E91E63',
  Drinks: '#2196F3',
  Specials: '#FF5722',
};

const CATEGORY_BG = {
  Starters: '#FFF3E0',
  Mains: '#FCE4EC',
  Breads: '#F3E5F5',
  Rice: '#E8F5E9',
  Desserts: '#FFF8E1',
  Drinks: '#E3F2FD',
  Specials: '#FBE9E7',
};

function catColor(cat) {
  return CATEGORY_COLORS[cat] ?? C.text3;
}
function catBg(cat) {
  return CATEGORY_BG[cat] ?? '#F0F0F0';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_MENU = [
  {
    id: 'm1',
    name: 'Paneer Butter Masala',
    category: 'Mains',
    price: 320,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: true,
    description: 'Creamy tomato based curry with fresh paneer',
    rating: 4.5,
    orders: 142,
    variants: [
      { id: 'v1', name: 'Half', price: 180 },
      { id: 'v2', name: 'Full', price: 320 },
    ],
    addons: [{ id: 'a1', name: 'Extra Butter', price: 20 }],
  },
  {
    id: 'm2',
    name: 'Dal Makhani',
    category: 'Mains',
    price: 280,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Slow cooked black lentils with cream',
    rating: 4.7,
    orders: 98,
    variants: [],
    addons: [],
  },
  {
    id: 'm3',
    name: 'Chicken Tikka Masala',
    category: 'Mains',
    price: 380,
    available: true,
    isVeg: false,
    isSeasonal: false,
    isSpecial: true,
    description: 'Tandoor grilled chicken in rich masala',
    rating: 4.6,
    orders: 87,
    variants: [
      { id: 'v3', name: 'Half', price: 220 },
      { id: 'v4', name: 'Full', price: 380 },
    ],
    addons: [{ id: 'a2', name: 'Extra Gravy', price: 30 }],
  },
  {
    id: 'm4',
    name: 'Garlic Naan',
    category: 'Breads',
    price: 60,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Soft naan with garlic and butter',
    rating: 4.8,
    orders: 210,
    variants: [],
    addons: [{ id: 'a3', name: 'Extra Butter', price: 10 }],
  },
  {
    id: 'm5',
    name: 'Laccha Paratha',
    category: 'Breads',
    price: 50,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Flaky layered whole wheat bread',
    rating: 4.5,
    orders: 130,
    variants: [],
    addons: [],
  },
  {
    id: 'm6',
    name: 'Jeera Rice',
    category: 'Rice',
    price: 120,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Cumin flavored basmati rice',
    rating: 4.4,
    orders: 76,
    variants: [],
    addons: [],
  },
  {
    id: 'm7',
    name: 'Chicken Biryani',
    category: 'Rice',
    price: 320,
    available: true,
    isVeg: false,
    isSeasonal: false,
    isSpecial: true,
    description: 'Aromatic basmati with spiced chicken',
    rating: 4.7,
    orders: 156,
    variants: [
      { id: 'v5', name: 'Half', price: 180 },
      { id: 'v6', name: 'Full', price: 320 },
    ],
    addons: [
      { id: 'a4', name: 'Raita', price: 40 },
      { id: 'a5', name: 'Salan', price: 30 },
    ],
  },
  {
    id: 'm8',
    name: 'Samosa (2 pcs)',
    category: 'Starters',
    price: 60,
    available: false,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Crispy fried pastry with spiced filling',
    rating: 4.3,
    orders: 65,
    variants: [],
    addons: [{ id: 'a6', name: 'Extra Chutney', price: 10 }],
  },
  {
    id: 'm9',
    name: 'Veg Spring Roll',
    category: 'Starters',
    price: 120,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Crispy rolls with mixed vegetables',
    rating: 4.2,
    orders: 45,
    variants: [],
    addons: [],
  },
  {
    id: 'm10',
    name: 'Chicken 65',
    category: 'Starters',
    price: 220,
    available: true,
    isVeg: false,
    isSeasonal: false,
    isSpecial: false,
    description: 'Spicy deep-fried chicken appetizer',
    rating: 4.6,
    orders: 110,
    variants: [],
    addons: [],
  },
  {
    id: 'm11',
    name: 'Gulab Jamun',
    category: 'Desserts',
    price: 80,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Soft milk solids in warm sugar syrup',
    rating: 4.6,
    orders: 89,
    variants: [
      { id: 'v7', name: '2 pcs', price: 80 },
      { id: 'v8', name: '4 pcs', price: 140 },
    ],
    addons: [],
  },
  {
    id: 'm12',
    name: 'Kulfi Falooda',
    category: 'Desserts',
    price: 110,
    available: false,
    isVeg: true,
    isSeasonal: true,
    isSpecial: false,
    description: 'Chilled kulfi with rose falooda',
    rating: 4.8,
    orders: 55,
    variants: [],
    addons: [],
  },
  {
    id: 'm13',
    name: 'Masala Chai',
    category: 'Drinks',
    price: 40,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Spiced milk tea with ginger and cardamom',
    rating: 4.9,
    orders: 312,
    variants: [],
    addons: [],
  },
  {
    id: 'm14',
    name: 'Mango Lassi',
    category: 'Drinks',
    price: 80,
    available: true,
    isVeg: true,
    isSeasonal: true,
    isSpecial: false,
    description: 'Chilled mango yogurt drink',
    rating: 4.8,
    orders: 134,
    variants: [
      { id: 'v9', name: 'Regular', price: 80 },
      { id: 'v10', name: 'Large', price: 120 },
    ],
    addons: [],
  },
  {
    id: 'm15',
    name: 'Chef\'s Special Thali',
    category: 'Specials',
    price: 450,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: true,
    description: 'Complete meal — dal, sabzi, roti, rice, dessert',
    rating: 4.9,
    orders: 203,
    variants: [],
    addons: [
      { id: 'a7', name: 'Extra Roti', price: 15 },
      { id: 'a8', name: 'Extra Sweet', price: 40 },
    ],
  },
  {
    id: 'm16',
    name: 'Butter Chicken',
    category: 'Mains',
    price: 360,
    available: true,
    isVeg: false,
    isSeasonal: false,
    isSpecial: false,
    description: 'Tender chicken in rich butter tomato sauce',
    rating: 4.8,
    orders: 201,
    variants: [
      { id: 'v11', name: 'Half', price: 210 },
      { id: 'v12', name: 'Full', price: 360 },
    ],
    addons: [{ id: 'a9', name: 'Extra Cream', price: 25 }],
  },
  {
    id: 'm17',
    name: 'Veg Fried Rice',
    category: 'Rice',
    price: 160,
    available: true,
    isVeg: true,
    isSeasonal: false,
    isSpecial: false,
    description: 'Wok tossed rice with fresh vegetables',
    rating: 4.3,
    orders: 68,
    variants: [],
    addons: [],
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRect({ width, height, radius = 6 }) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: '#ECECEC',
      }}
    />
  );
}

function MenuSkeleton() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {[80, 70, 60, 80].map((w, i) => (
          <SkeletonRect key={i} width={w} height={34} radius={999} />
        ))}
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 14,
          }}
        >
          <SkeletonRect width={72} height={72} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonRect width="70%" height={15} />
            <SkeletonRect width="40%" height={12} />
            <SkeletonRect width="30%" height={18} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Menu Item Card ───────────────────────────────────────────────────────────
function MenuItemCard({
  item,
  index,
  onToggleAvailable,
  onEdit,
  selectionMode,
  selected,
  onLongPress,
  onSelectToggle,
}) {
  const isWeb = Platform.OS === 'web';
  const opacity = useSharedValue(isWeb ? 1 : 0);
  const translateY = useSharedValue(isWeb ? 0 : 18);

  useEffect(() => {
    if (isWeb) return;
    const delay = Math.min(index * 40, 400);
    opacity.value = withDelay(delay, withTiming(1, { duration: 280 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 130 }));
  }, []);

  const cardAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const color = catColor(item.category);

  const handleToggle = useCallback(
    (val) => {
      if (!selectionMode) onToggleAvailable(item.id, val);
    },
    [item.id, onToggleAvailable, selectionMode]
  );

  const handlePress = useCallback(() => {
    if (selectionMode) {
      onSelectToggle(item.id);
    } else {
      onEdit(item);
    }
  }, [selectionMode, item, onEdit, onSelectToggle]);

  return (
    <Animated.View style={[cardAnim, { marginBottom: 10 }]}>
      <PressCard
        scaleDown={0.97}
        onPress={handlePress}
        onLongPress={() => onLongPress(item.id)}
        style={[
          styles.card,
          !item.available && styles.cardUnavailable,
          selected && styles.cardSelected,
        ]}
      >
        {/* Left color accent border */}
        <View style={[styles.cardAccent, { backgroundColor: color }]} />

        <View style={styles.cardInner}>
          {/* Selection checkbox */}
          {selectionMode && (
            <View
              style={[
                styles.checkbox,
                selected && { backgroundColor: C.indigo, borderColor: C.indigo },
              ]}
            >
              {selected && <Ionicons name="checkmark" size={13} color="#FFF" />}
            </View>
          )}

          {/* Photo placeholder */}
          <View style={[styles.photoPlaceholder, { backgroundColor: catBg(item.category) }]}>
            <Text style={styles.photoEmoji}>{item.isVeg ? '🥗' : '🍗'}</Text>
            {item.isSpecial && (
              <View style={styles.specialBadge}>
                <Text style={{ fontSize: 9 }}>⭐</Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            {/* Name row */}
            <View style={styles.nameRow}>
              <View
                style={[
                  styles.vegDot,
                  { backgroundColor: item.isVeg ? C.success : C.error },
                ]}
              />
              <Text
                style={[styles.itemName, !item.available && styles.itemNameDimmed]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.isSeasonal && (
                <View style={styles.seasonalBadge}>
                  <Text style={styles.seasonalText}>SEASONAL</Text>
                </View>
              )}
            </View>

            {/* Category tag */}
            <View style={styles.tagsRow}>
              <View style={[styles.catTag, { backgroundColor: color + '18' }]}>
                <Text style={[styles.catTagText, { color }]}>{item.category}</Text>
              </View>
              {item.variants.length > 0 && (
                <View style={styles.variantBadge}>
                  <Text style={styles.variantBadgeText}>
                    {item.variants.length} variants
                  </Text>
                </View>
              )}
              {!item.available && (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableBadgeText}>Out of Stock</Text>
                </View>
              )}
            </View>

            {/* Rating + orders */}
            <View style={styles.metaRow}>
              <Ionicons name="star" size={11} color={C.gold} />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.orderCountText}>{item.orders} orders</Text>
            </View>
          </View>

          {/* Right: price + toggle */}
          <View style={styles.cardRight}>
            <Text style={styles.priceText}>₹{item.price}</Text>
            {!selectionMode && (
              <Switch
                value={item.available}
                onValueChange={handleToggle}
                trackColor={{ false: '#DDDDDD', true: C.success + '55' }}
                thumbColor={item.available ? C.success : '#AAAAAA'}
                style={styles.availSwitch}
              />
            )}
          </View>
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Variant / Add-on Row ─────────────────────────────────────────────────────
function LineItemRow({ item, onDelete, onChangeName, onChangePrice }) {
  return (
    <View style={ms.lineItemRow}>
      <TextInput
        style={[ms.input, { flex: 1 }]}
        placeholder="Name"
        placeholderTextColor="#AAAAAA"
        value={item.name}
        onChangeText={onChangeName}
      />
      <View style={ms.priceInputWrap}>
        <Text style={ms.rupeePrefix}>₹</Text>
        <TextInput
          style={[ms.input, ms.priceInput]}
          placeholder="0"
          placeholderTextColor="#AAAAAA"
          value={String(item.price === 0 ? '' : item.price)}
          onChangeText={onChangePrice}
          keyboardType="decimal-pad"
        />
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={ms.deleteRowBtn}>
        <Ionicons name="close-circle" size={20} color={C.error} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function MenuItemModal({ visible, item, categories, onClose, onSave, onDelete }) {
  const isEdit = !!item;
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [available, setAvailable] = useState(true);
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [isSpecial, setIsSpecial] = useState(false);
  const [variants, setVariants] = useState([]);
  const [addons, setAddons] = useState([]);

  useEffect(() => {
    if (visible) {
      if (item) {
        setName(item.name ?? '');
        setDescription(item.description ?? '');
        setPrice(String(item.price ?? ''));
        setCategory(item.category ?? '');
        setIsVeg(item.isVeg !== false);
        setAvailable(item.available !== false);
        setIsSeasonal(!!item.isSeasonal);
        setIsSpecial(!!item.isSpecial);
        setVariants((item.variants ?? []).map((v) => ({ ...v })));
        setAddons((item.addons ?? []).map((a) => ({ ...a })));
      } else {
        setName('');
        setDescription('');
        setPrice('');
        setCategory('');
        setIsVeg(true);
        setAvailable(true);
        setIsSeasonal(false);
        setIsSpecial(false);
        setVariants([]);
        setAddons([]);
      }
    }
  }, [visible, item]);

  const addVariant = useCallback(() => {
    setVariants((prev) => [
      ...prev,
      { id: 'nv_' + Date.now(), name: '', price: 0 },
    ]);
  }, []);

  const removeVariant = useCallback((id) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const updateVariant = useCallback((id, field, value) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, [field]: field === 'price' ? parseFloat(value) || 0 : value }
          : v
      )
    );
  }, []);

  const addAddon = useCallback(() => {
    setAddons((prev) => [
      ...prev,
      { id: 'na_' + Date.now(), name: '', price: 0 },
    ]);
  }, []);

  const removeAddon = useCallback((id) => {
    setAddons((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateAddon = useCallback((id, field, value) => {
    setAddons((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, [field]: field === 'price' ? parseFloat(value) || 0 : value }
          : a
      )
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Item name is required.');
      return;
    }
    if (!category) {
      Alert.alert('Validation', 'Please select a category.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Validation', 'Please enter a valid price.');
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      category,
      isVeg,
      available,
      isSeasonal,
      isSpecial,
      variants: variants.filter((v) => v.name.trim()),
      addons: addons.filter((a) => a.name.trim()),
    });
  }, [name, description, price, category, isVeg, available, isSeasonal, isSpecial, variants, addons, onSave]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Delete Item',
      `Remove "${name}" from the menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  }, [name, onDelete]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={ms.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={ms.handleBar} />

          {/* Header */}
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>
              {isEdit ? 'Edit Item' : 'New Menu Item'}
            </Text>
            <TouchableOpacity onPress={onClose} style={ms.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.text1} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ms.scrollContent}
          >
            {/* Photo placeholder */}
            <TouchableOpacity style={ms.photoPlaceholder} activeOpacity={0.75}>
              <Ionicons name="camera-outline" size={28} color={C.text3} />
              <Text style={ms.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>

            {/* Item Name */}
            <View style={ms.fieldGroup}>
              <Text style={ms.fieldLabel}>ITEM NAME</Text>
              <TextInput
                style={ms.input}
                placeholder="e.g. Paneer Butter Masala"
                placeholderTextColor="#AAAAAA"
                value={name}
                onChangeText={setName}
                returnKeyType="next"
              />
            </View>

            {/* Description */}
            <View style={ms.fieldGroup}>
              <Text style={ms.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={[ms.input, ms.textArea]}
                placeholder="Short description of the dish…"
                placeholderTextColor="#AAAAAA"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={120}
                returnKeyType="done"
              />
              <Text style={ms.charCount}>{description.length}/120</Text>
            </View>

            {/* Price */}
            <View style={ms.fieldGroup}>
              <Text style={ms.fieldLabel}>BASE PRICE</Text>
              <View style={ms.priceInputWrap}>
                <Text style={ms.rupeePrefix}>₹</Text>
                <TextInput
                  style={[ms.input, ms.priceInput]}
                  placeholder="0"
                  placeholderTextColor="#AAAAAA"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Category selector */}
            <View style={ms.fieldGroup}>
              <Text style={ms.fieldLabel}>CATEGORY</Text>
              <View style={ms.pillsRow}>
                {categories.map((cat) => {
                  const active = category === cat;
                  const cc = catColor(cat);
                  return (
                    <PressCard
                      key={cat}
                      scaleDown={0.93}
                      onPress={() => setCategory(cat)}
                      style={[
                        ms.categoryPill,
                        active && { backgroundColor: cc, borderColor: cc },
                      ]}
                    >
                      <Text
                        style={[
                          ms.categoryPillText,
                          active && ms.categoryPillTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </PressCard>
                  );
                })}
              </View>
            </View>

            {/* Veg / Non-Veg */}
            <View style={ms.fieldGroup}>
              <Text style={ms.fieldLabel}>TYPE</Text>
              <View style={ms.twoButtonRow}>
                <TouchableOpacity
                  style={[ms.typeBtn, isVeg && { backgroundColor: C.success, borderColor: C.success }]}
                  onPress={() => setIsVeg(true)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      ms.vegDotBtn,
                      { backgroundColor: isVeg ? '#FFF' : C.success },
                    ]}
                  />
                  <Text style={[ms.typeBtnText, isVeg && { color: '#FFF' }]}>
                    Veg
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.typeBtn, !isVeg && { backgroundColor: C.error, borderColor: C.error }]}
                  onPress={() => setIsVeg(false)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      ms.vegDotBtn,
                      { backgroundColor: !isVeg ? '#FFF' : C.error },
                    ]}
                  />
                  <Text style={[ms.typeBtnText, !isVeg && { color: '#FFF' }]}>
                    Non-Veg
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Toggle rows */}
            <View style={ms.togglesCard}>
              <ToggleRow
                label="Available"
                sub="Show to customers"
                value={available}
                onChange={setAvailable}
                separator
              />
              <ToggleRow
                label="Seasonal"
                sub='Shows "SEASONAL" badge'
                value={isSeasonal}
                onChange={setIsSeasonal}
                separator
              />
              <ToggleRow
                label="Chef's Special"
                sub="Shows ⭐ on card"
                value={isSpecial}
                onChange={setIsSpecial}
                separator={false}
              />
            </View>

            {/* Variants */}
            <View style={ms.fieldGroup}>
              <View style={ms.sectionHeader}>
                <Text style={ms.sectionTitle}>VARIANTS</Text>
                <Text style={ms.sectionSub}>e.g. Half / Full</Text>
              </View>
              {variants.map((v) => (
                <LineItemRow
                  key={v.id}
                  item={v}
                  onDelete={() => removeVariant(v.id)}
                  onChangeName={(val) => updateVariant(v.id, 'name', val)}
                  onChangePrice={(val) => updateVariant(v.id, 'price', val)}
                />
              ))}
              <TouchableOpacity
                style={ms.addLineBtn}
                onPress={addVariant}
                activeOpacity={0.75}
              >
                <Ionicons name="add-circle-outline" size={17} color={C.indigo} />
                <Text style={ms.addLineBtnText}>Add Variant</Text>
              </TouchableOpacity>
            </View>

            {/* Add-ons */}
            <View style={ms.fieldGroup}>
              <View style={ms.sectionHeader}>
                <Text style={ms.sectionTitle}>ADD-ONS</Text>
                <Text style={ms.sectionSub}>e.g. Extra Cheese +₹30</Text>
              </View>
              {addons.map((a) => (
                <LineItemRow
                  key={a.id}
                  item={a}
                  onDelete={() => removeAddon(a.id)}
                  onChangeName={(val) => updateAddon(a.id, 'name', val)}
                  onChangePrice={(val) => updateAddon(a.id, 'price', val)}
                />
              ))}
              <TouchableOpacity
                style={ms.addLineBtn}
                onPress={addAddon}
                activeOpacity={0.75}
              >
                <Ionicons name="add-circle-outline" size={17} color={C.indigo} />
                <Text style={ms.addLineBtnText}>Add Add-on</Text>
              </TouchableOpacity>
            </View>

            {/* Save */}
            <TouchableOpacity
              style={ms.saveBtn}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={ms.saveBtnText}>
                {isEdit ? 'Save Changes' : 'Add to Menu'}
              </Text>
            </TouchableOpacity>

            {/* Delete (edit only) */}
            {isEdit && (
              <TouchableOpacity
                style={ms.deleteBtn}
                onPress={confirmDelete}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={16} color={C.error} />
                <Text style={ms.deleteBtnText}>Delete Item</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Toggle Row helper ────────────────────────────────────────────────────────
function ToggleRow({ label, sub, value, onChange, separator }) {
  return (
    <>
      <View style={ms.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={ms.toggleLabel}>{label}</Text>
          {sub ? <Text style={ms.toggleSub}>{sub}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#DDDDDD', true: C.success + '55' }}
          thumbColor={value ? C.success : '#AAAAAA'}
        />
      </View>
      {separator && <View style={ms.toggleSep} />}
    </>
  );
}

// ─── Category Management Modal ────────────────────────────────────────────────
function CategoryModal({ visible, categories, itemCounts, onClose, onSave }) {
  const [cats, setCats] = useState([]);

  useEffect(() => {
    if (visible) setCats([...categories]);
  }, [visible, categories]);

  const [newCat, setNewCat] = useState('');

  const addCat = useCallback(() => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    if (cats.includes(trimmed)) {
      Alert.alert('Duplicate', 'Category already exists.');
      return;
    }
    setCats((prev) => [...prev, trimmed]);
    setNewCat('');
  }, [newCat, cats]);

  const removeCat = useCallback((cat) => {
    if ((itemCounts[cat] ?? 0) > 0) {
      Alert.alert(
        'Cannot Delete',
        `"${cat}" has ${itemCounts[cat]} item(s). Reassign them first.`
      );
      return;
    }
    setCats((prev) => prev.filter((c) => c !== cat));
  }, [itemCounts]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={cm.overlay} onPress={onClose} />
      <View style={cm.sheet}>
        <View style={cm.handleBar} />
        <View style={cm.sheetHeader}>
          <Text style={cm.sheetTitle}>Manage Categories</Text>
          <TouchableOpacity onPress={onClose} style={cm.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={18} color={C.text1} />
          </TouchableOpacity>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={cm.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {cats.map((cat) => (
            <View key={cat} style={cm.catRow}>
              <View
                style={[cm.catDot, { backgroundColor: catColor(cat) }]}
              />
              <Text style={cm.catName}>{cat}</Text>
              <View style={cm.catCount}>
                <Text style={cm.catCountText}>{itemCounts[cat] ?? 0}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeCat(cat)}
                hitSlop={8}
                style={cm.catDeleteBtn}
              >
                <Ionicons name="trash-outline" size={16} color={C.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new category */}
          <View style={cm.addCatRow}>
            <TextInput
              style={[cm.input, { flex: 1 }]}
              placeholder="New category name…"
              placeholderTextColor="#AAAAAA"
              value={newCat}
              onChangeText={setNewCat}
              returnKeyType="done"
              onSubmitEditing={addCat}
            />
            <TouchableOpacity
              style={cm.addCatBtn}
              onPress={addCat}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={cm.saveBtn}
            onPress={() => onSave(cats)}
            activeOpacity={0.85}
          >
            <Text style={cm.saveBtnText}>Save Categories</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress, bottomOffset }) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 160 }));
  }, []);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.fab, { bottom: 28 + bottomOffset }, fabStyle]}>
      <PressCard scaleDown={0.91} onPress={onPress} style={styles.fabShadow}>
        <View style={styles.fabBg}>
          <Ionicons name="add" size={28} color="#FFF" />
        </View>
      </PressCard>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MenuItemsScreen() {
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState(MOCK_MENU);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  // Modals
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [catModalVisible, setCatModalVisible] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  // Stats
  const totalItems = items.length;
  const availableCount = useMemo(() => items.filter((i) => i.available).length, [items]);
  const outOfStockCount = totalItems - availableCount;

  // Item counts per category
  const itemCounts = useMemo(() => {
    const counts = {};
    for (const cat of categories) {
      counts[cat] = items.filter((i) => i.category === cat).length;
    }
    return counts;
  }, [items, categories]);

  // Filtered list
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeCategory !== 'All') {
      list = list.filter((i) => i.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, activeCategory, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleAvailable = useCallback((id, val) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, available: val } : i))
    );
  }, []);

  const openAddModal = useCallback(() => {
    setEditingItem(null);
    setItemModalVisible(true);
  }, []);

  const openEditModal = useCallback((item) => {
    setEditingItem(item);
    setItemModalVisible(true);
  }, []);

  const closeItemModal = useCallback(() => {
    setItemModalVisible(false);
    setEditingItem(null);
  }, []);

  const handleSave = useCallback(
    (formData) => {
      if (editingItem) {
        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? { ...i, ...formData } : i))
        );
      } else {
        setItems((prev) => [
          {
            ...formData,
            id: 'm' + Date.now(),
            rating: 0,
            orders: 0,
          },
          ...prev,
        ]);
      }
      closeItemModal();
    },
    [editingItem, closeItemModal]
  );

  const handleDeleteItem = useCallback(() => {
    if (editingItem) {
      setItems((prev) => prev.filter((i) => i.id !== editingItem.id));
    }
    closeItemModal();
  }, [editingItem, closeItemModal]);

  // Selection
  const handleLongPress = useCallback((id) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handleSelectToggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const bulkMarkOutOfStock = useCallback(() => {
    setItems((prev) =>
      prev.map((i) =>
        selectedIds.has(i.id) ? { ...i, available: false } : i
      )
    );
    exitSelection();
  }, [selectedIds, exitSelection]);

  const bulkDelete = useCallback(() => {
    Alert.alert(
      'Delete Items',
      `Delete ${selectedIds.size} selected item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
            exitSelection();
          },
        },
      ]
    );
  }, [selectedIds, exitSelection]);

  const handleSaveCategories = useCallback((newCats) => {
    setCategories(newCats);
    // Reset active category if it was removed
    if (activeCategory !== 'All' && !newCats.includes(activeCategory)) {
      setActiveCategory('All');
    }
    setCatModalVisible(false);
  }, [activeCategory]);

  const allCategoryTabs = useMemo(() => ['All', ...categories], [categories]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Title + actions */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Menu</Text>
            <Text style={styles.headerSubtitle}>{totalItems} items</Text>
          </View>
          <View style={styles.headerActions}>
            {selectionMode ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={exitSelection}
                activeOpacity={0.75}
              >
                <Ionicons name="close-outline" size={20} color={C.text1} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => setCatModalVisible(true)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pencil-outline" size={18} color={C.text1} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={openAddModal}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={C.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu…"
            placeholderTextColor={C.text3}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={6}>
              <Ionicons name="close-circle" size={15} color={C.text3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats mini-bar */}
        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: C.indigo + '12' }]}>
            <Text style={[styles.statNum, { color: C.indigo }]}>{totalItems}</Text>
            <Text style={[styles.statLabel, { color: C.indigo }]}>Total</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: C.success + '12' }]}>
            <Text style={[styles.statNum, { color: C.success }]}>{availableCount}</Text>
            <Text style={[styles.statLabel, { color: C.success }]}>Available</Text>
          </View>
          <View
            style={[
              styles.statPill,
              { backgroundColor: outOfStockCount > 0 ? C.error + '12' : '#F0F0F0' },
            ]}
          >
            <Text
              style={[
                styles.statNum,
                { color: outOfStockCount > 0 ? C.error : C.text3 },
              ]}
            >
              {outOfStockCount}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: outOfStockCount > 0 ? C.error : C.text3 },
              ]}
            >
              Out of Stock
            </Text>
          </View>
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          {allCategoryTabs.map((cat) => {
            const isActive = activeCategory === cat;
            const count = cat === 'All' ? items.length : (itemCounts[cat] ?? 0);
            return (
              <PressCard
                key={cat}
                scaleDown={0.93}
                onPress={() => setActiveCategory(cat)}
                style={[styles.catPill, isActive && styles.catPillActive]}
              >
                <Text style={[styles.catPillText, isActive && styles.catPillTextActive]}>
                  {cat}
                </Text>
                <View
                  style={[
                    styles.catCountBadge,
                    isActive
                      ? { backgroundColor: 'rgba(255,255,255,0.22)' }
                      : { backgroundColor: C.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.catCountBadgeText,
                      isActive && { color: '#FFF' },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </PressCard>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Selection hint ───────────────────────────────────────────────── */}
      {selectionMode && (
        <View style={styles.selectionHint}>
          <Ionicons name="checkmark-circle" size={15} color={C.indigo} />
          <Text style={styles.selectionHintText}>
            {selectedIds.size} selected — tap items to toggle
          </Text>
        </View>
      )}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <MenuSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 120 + insets.bottom,
          }}
        >
          {filteredItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>No items found</Text>
              <Text style={styles.emptySub}>
                Try a different category or search term
              </Text>
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={openAddModal}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyActionText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredItems.map((item, index) => (
              <MenuItemCard
                key={item.id}
                item={item}
                index={index}
                onToggleAvailable={handleToggleAvailable}
                onEdit={openEditModal}
                selectionMode={selectionMode}
                selected={selectedIds.has(item.id)}
                onLongPress={handleLongPress}
                onSelectToggle={handleSelectToggle}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ── Bulk Action Bar ──────────────────────────────────────────────── */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.bulkBar, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.bulkBtn, { backgroundColor: C.error + '14', borderColor: C.error + '44' }]}
            onPress={bulkMarkOutOfStock}
            activeOpacity={0.8}
          >
            <Ionicons name="ban-outline" size={15} color={C.error} />
            <Text style={[styles.bulkBtnText, { color: C.error }]}>
              Mark Out of Stock
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, { backgroundColor: C.error, borderColor: C.error }]}
            onPress={bulkDelete}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={15} color="#FFF" />
            <Text style={[styles.bulkBtnText, { color: '#FFF' }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      {!selectionMode && (
        <FAB onPress={openAddModal} bottomOffset={insets.bottom} />
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <MenuItemModal
        visible={itemModalVisible}
        item={editingItem}
        categories={categories}
        onClose={closeItemModal}
        onSave={handleSave}
        onDelete={handleDeleteItem}
      />
      <CategoryModal
        visible={catModalVisible}
        categories={categories}
        itemCounts={itemCounts}
        onClose={() => setCatModalVisible(false)}
        onSave={handleSaveCategories}
      />
    </View>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text1,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: C.text3,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.text1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.text1,
    padding: 0,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statNum: {
    fontSize: 14,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Category pills
  pillsScroll: {
    gap: 8,
    paddingRight: 4,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  catPillActive: {
    backgroundColor: C.text1,
    borderColor: C.text1,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text3,
  },
  catPillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  catCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  catCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text3,
  },

  // Selection hint
  selectionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: C.indigo + '0E',
    borderBottomWidth: 1,
    borderBottomColor: C.indigo + '22',
  },
  selectionHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.indigo,
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardUnavailable: {
    opacity: 0.7,
  },
  cardSelected: {
    borderColor: C.indigo,
    borderWidth: 1.5,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 12,
    paddingVertical: 14,
    gap: 12,
    minHeight: 88,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  photoPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  photoEmoji: {
    fontSize: 28,
  },
  specialBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  vegDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
    flexShrink: 0,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
    flex: 1,
    letterSpacing: -0.2,
  },
  itemNameDimmed: {
    color: C.text3,
  },
  seasonalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.gold + '20',
  },
  seasonalText: {
    fontSize: 8,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  catTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  variantBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.indigo + '14',
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.indigo,
  },
  unavailableBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#FFF0F0',
  },
  unavailableBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.error,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gold,
  },
  orderCountText: {
    fontSize: 11,
    color: C.text3,
  },
  metaDot: {
    fontSize: 11,
    color: C.text3,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: C.text1,
  },
  availSwitch: {
    transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }],
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text1,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: C.text3,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyAction: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.text1,
    borderRadius: 999,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  // Bulk bar
  bulkBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  bulkBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
  },
  fabShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  fabBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.text1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Menu Item Modal Styles ───────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: C.text1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 18,
    paddingBottom: 24,
  },

  // Photo placeholder
  photoPlaceholder: {
    height: 90,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPhotoText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text3,
  },

  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.text1,
    backgroundColor: C.surface,
  },
  textArea: {
    height: 80,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: C.text3,
    alignSelf: 'flex-end',
  },

  // Price input
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  rupeePrefix: {
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    color: C.text2,
    backgroundColor: C.bg,
    alignSelf: 'stretch',
    textAlignVertical: 'center',
    lineHeight: 44,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  priceInput: {
    flex: 1,
    borderWidth: 0,
    height: 44,
  },

  // Category pills
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
  },
  categoryPillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },

  // Type buttons
  twoButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  vegDotBtn: {
    width: 11,
    height: 11,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text2,
  },

  // Toggles card
  togglesCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  toggleSep: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 14,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
  },
  toggleSub: {
    fontSize: 11,
    color: C.text3,
    marginTop: 1,
  },

  // Section headers (Variants / Add-ons)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text3,
    letterSpacing: 0.6,
  },
  sectionSub: {
    fontSize: 11,
    color: C.text3,
    fontStyle: 'italic',
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  deleteRowBtn: {
    padding: 2,
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addLineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.indigo,
  },

  // Save / Delete
  saveBtn: {
    height: 50,
    backgroundColor: C.text1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  deleteBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.error + '66',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.error,
  },
});

// ─── Category Modal Styles ────────────────────────────────────────────────────
const cm = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: C.text1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 10,
    paddingBottom: 8,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
  },
  catName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: C.text1,
  },
  catCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  catCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text2,
  },
  catDeleteBtn: {
    padding: 4,
  },
  addCatRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.text1,
    backgroundColor: C.surface,
  },
  addCatBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.text1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    height: 48,
    backgroundColor: C.text1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
