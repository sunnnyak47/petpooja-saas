/**
 * Recipe Manager — "Standard recipes".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated 4 · FlashList 2
 *
 * Lists every menu item with its recipe status + computed cost (outlet currency),
 * and lets you tap an item to build/edit its standard recipe: pick inventory
 * ingredients, set quantity + unit, and see LIVE food cost + gross margin vs the
 * item's price before saving.
 *
 * Data + pure transforms live in src/hooks/useRecipes.js.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { useOutlet } from '../../src/context/OutletContext';
import {
  useRecipes,
  useRecipeMenu,
  useRecipeIngredients,
  useSaveRecipe,
  buildRecipeRows,
  filterRows,
  summarize,
  recipeCost,
  marginPercent,
  marginValue,
  linesToPayload,
  RECIPE_UNITS,
} from '../../src/hooks/useRecipes';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'with', label: 'With Recipe' },
  { key: 'without', label: 'No Recipe' },
];

// Margin health → color band.
function marginTone(colors, margin) {
  if (margin == null) return colors.textMuted;
  if (margin >= 60) return colors.success;
  if (margin >= 35) return colors.warning;
  return colors.error;
}

// ─── Summary strip ────────────────────────────────────────────────────────────
function SummaryStrip({ stats, colors, s }) {
  return (
    <View style={s.summaryRow}>
      <View style={s.summaryCard}>
        <Text style={s.summaryValue}>{stats.total}</Text>
        <Text style={s.summaryLabel}>Menu Items</Text>
      </View>
      <View style={s.summaryCard}>
        <Text style={[s.summaryValue, { color: colors.success }]}>{stats.withCount}</Text>
        <Text style={s.summaryLabel}>With Recipe</Text>
      </View>
      <View style={s.summaryCard}>
        <Text style={[s.summaryValue, { color: colors.warning }]}>{stats.withoutCount}</Text>
        <Text style={s.summaryLabel}>No Recipe</Text>
      </View>
      <View style={s.summaryCard}>
        <Text style={[s.summaryValue, { color: marginTone(colors, stats.avgMargin) }]}>
          {stats.avgMargin}%
        </Text>
        <Text style={s.summaryLabel}>Avg Margin</Text>
      </View>
    </View>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────
function RecipeRow({ row, symbol, colors, s, onPress }) {
  const tone = marginTone(colors, row.margin);
  return (
    <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(220) : undefined}>
      <TouchableOpacity activeOpacity={0.7} style={s.row} onPress={() => onPress(row)}>
        <View style={s.rowIconWrap}>
          <Ionicons
            name={row.hasRecipe ? 'restaurant' : 'restaurant-outline'}
            size={20}
            color={row.hasRecipe ? colors.accent : colors.textMuted}
          />
        </View>

        <View style={s.rowMain}>
          <Text style={s.rowName} numberOfLines={1}>{row.name}</Text>
          <View style={s.rowMetaLine}>
            {row.category ? <Text style={s.rowCat} numberOfLines={1}>{row.category}</Text> : null}
            <Text style={s.rowPrice}>{symbol}{row.price.toFixed(2)}</Text>
          </View>
        </View>

        <View style={s.rowRight}>
          {row.hasRecipe ? (
            <>
              <Text style={s.rowCost}>{symbol}{row.cost.toFixed(2)}</Text>
              <View style={[s.marginPill, { backgroundColor: tone + '22' }]}>
                <Text style={[s.marginPillText, { color: tone }]}>{row.margin}%</Text>
              </View>
              <Text style={s.rowIngCount}>{row.ingredientCount} ing.</Text>
            </>
          ) : (
            <View style={s.noRecipeBadge}>
              <Ionicons name="add-circle-outline" size={14} color={colors.accent} />
              <Text style={s.noRecipeText}>Add recipe</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ s }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={s.skelIcon} />
          <View style={{ flex: 1 }}>
            <View style={[s.skelBar, { width: '55%' }]} />
            <View style={[s.skelBar, { width: '30%', marginTop: 8, height: 10 }]} />
          </View>
          <View style={[s.skelBar, { width: 48, height: 22 }]} />
        </View>
      ))}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ colors, s, filter, hasItems }) {
  const noItems = !hasItems;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.emptyWrap}>
      <View style={s.emptyIconCircle}>
        <Ionicons name="reader-outline" size={44} color={colors.accent} />
      </View>
      <Text style={s.emptyTitle}>
        {noItems ? 'No menu items yet' : filter === 'with' ? 'No recipes yet' : 'Nothing to show'}
      </Text>
      <Text style={s.emptySub}>
        {noItems
          ? 'Add items in Menu first, then define their standard recipes here.'
          : filter === 'with'
            ? 'Tap any menu item to define its standard recipe and start tracking food cost.'
            : 'Try a different filter or search term.'}
      </Text>
    </Animated.View>
  );
}

// ─── Ingredient picker (nested modal) ─────────────────────────────────────────
function IngredientPicker({ visible, onClose, ingredients, existingIds, onAdd, colors, s, symbol }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (ingredients || []).filter(
      (it) => !existingIds.includes(it.id) && (!query || it.name.toLowerCase().includes(query)),
    );
  }, [ingredients, existingIds, q]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.pickerOverlay}>
        <View style={s.pickerSheet}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>Add Ingredient</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search inventory items"
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
              autoFocus
            />
          </View>

          <FlashList
            data={list}
            keyExtractor={(it) => String(it.id)}
            estimatedItemSize={56}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={s.pickerEmpty}>
                <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
                <Text style={s.pickerEmptyText}>
                  {ingredients?.length ? 'No matching items' : 'No inventory items found'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={s.pickerRow} onPress={() => onAdd(item)} activeOpacity={0.7}>
                <View style={s.pickerRowMain}>
                  <Text style={s.pickerRowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.pickerRowMeta}>
                    {symbol}{item.cost_per_unit.toFixed(2)} / {item.unit} · {item.current_stock} in stock
                  </Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.accent} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Recipe editor (modal) ────────────────────────────────────────────────────
function RecipeEditor({ visible, row, ingredients, onClose, onSaved, colors, s, symbol }) {
  const insets = useSafeAreaInsets();
  const saveRecipe = useSaveRecipe();
  const [lines, setLines] = useState([]);
  const [recipeName, setRecipeName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [yieldUnit, setYieldUnit] = useState('pcs');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Seed editor state each time a new item opens.
  React.useEffect(() => {
    if (row) {
      setLines(row.lines.map((l) => ({ ...l })));
      setRecipeName(row.recipeName || row.name || '');
      setYieldQty(String(row.yieldQuantity || 1));
      setYieldUnit(row.yieldUnit || 'pcs');
    }
  }, [row?.id, visible]);

  const cost = useMemo(() => recipeCost(lines), [lines]);
  const price = row?.price ?? 0;
  const margin = marginPercent(price, cost);
  const profit = marginValue(price, cost);
  const tone = marginTone(colors, lines.length ? margin : null);
  const existingIds = lines.map((l) => l.inventory_item_id);

  const addIngredient = useCallback((item) => {
    setLines((prev) => [
      ...prev,
      {
        inventory_item_id: item.id,
        name: item.name,
        unit: item.unit || 'pcs',
        quantity: 1,
        cost_per_unit: item.cost_per_unit,
      },
    ]);
    setPickerOpen(false);
  }, []);

  const updateQty = useCallback((id, text) => {
    const val = text.replace(/[^0-9.]/g, '');
    setLines((prev) =>
      prev.map((l) => (l.inventory_item_id === id ? { ...l, quantity: val } : l)),
    );
  }, []);

  const cycleUnit = useCallback((id) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.inventory_item_id !== id) return l;
        const idx = RECIPE_UNITS.indexOf(l.unit);
        return { ...l, unit: RECIPE_UNITS[(idx + 1) % RECIPE_UNITS.length] };
      }),
    );
  }, []);

  const removeLine = useCallback((id) => {
    setLines((prev) => prev.filter((l) => l.inventory_item_id !== id));
  }, []);

  const handleSave = useCallback(() => {
    const payload = linesToPayload(lines, {
      name: recipeName,
      yieldQuantity: Number(yieldQty) || 1,
      yieldUnit,
    });
    if (!payload.ingredients.length) {
      Alert.alert('Add ingredients', 'A recipe needs at least one ingredient with a quantity.');
      return;
    }
    saveRecipe.mutate(
      { menuItemId: row.id, payload },
      {
        onSuccess: () => {
          onSaved?.();
          onClose();
        },
        onError: (err) => {
          Alert.alert(
            'Could not save',
            err?.response?.data?.message || err?.message || 'Please try again.',
          );
        },
      },
    );
  }, [lines, recipeName, yieldQty, yieldUnit, row, saveRecipe, onSaved, onClose]);

  if (!row) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.editorRoot} edges={['top']}>
        <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
        {/* Editor header */}
        <View style={s.editorHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={s.editorClose}>
            <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.editorTitle} numberOfLines={1}>{row.name}</Text>
            <Text style={s.editorSub}>Standard recipe · {symbol}{price.toFixed(2)} sell price</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          <FlashList
            data={lines}
            keyExtractor={(l) => String(l.inventory_item_id)}
            estimatedItemSize={64}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            ListHeaderComponent={
              <View>
                {/* Live cost / margin card */}
                <View style={s.costCard}>
                  <View style={s.costCol}>
                    <Text style={s.costLabel}>Food Cost</Text>
                    <Text style={s.costValue}>{symbol}{cost.toFixed(2)}</Text>
                  </View>
                  <View style={s.costDivider} />
                  <View style={s.costCol}>
                    <Text style={s.costLabel}>Margin</Text>
                    <Text style={[s.costValue, { color: tone }]}>
                      {lines.length ? `${margin}%` : '—'}
                    </Text>
                  </View>
                  <View style={s.costDivider} />
                  <View style={s.costCol}>
                    <Text style={s.costLabel}>Profit / item</Text>
                    <Text style={[s.costValue, { color: tone }]}>
                      {lines.length ? `${symbol}${profit.toFixed(2)}` : '—'}
                    </Text>
                  </View>
                </View>

                {/* Recipe meta */}
                <View style={s.metaCard}>
                  <Text style={s.metaLabel}>Recipe name</Text>
                  <TextInput
                    style={s.metaInput}
                    value={recipeName}
                    onChangeText={setRecipeName}
                    placeholder={row.name}
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={s.metaYieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.metaLabel}>Yield qty</Text>
                      <TextInput
                        style={s.metaInput}
                        value={yieldQty}
                        onChangeText={(t) => setYieldQty(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.metaLabel}>Yield unit</Text>
                      <TouchableOpacity
                        style={[s.metaInput, s.unitToggle]}
                        onPress={() =>
                          setYieldUnit(
                            RECIPE_UNITS[(RECIPE_UNITS.indexOf(yieldUnit) + 1) % RECIPE_UNITS.length],
                          )
                        }
                      >
                        <Text style={s.unitToggleText}>{yieldUnit}</Text>
                        <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>Ingredients ({lines.length})</Text>
                  <TouchableOpacity style={s.addBtn} onPress={() => setPickerOpen(true)}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={s.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={s.editorEmpty}>
                <Ionicons name="nutrition-outline" size={34} color={colors.textMuted} />
                <Text style={s.editorEmptyText}>No ingredients yet</Text>
                <Text style={s.editorEmptySub}>Tap “Add” to pick from inventory.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.ingRow}>
                <View style={s.ingMain}>
                  <Text style={s.ingName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.ingMeta}>
                    {symbol}{Number(item.cost_per_unit).toFixed(2)}/{item.unit} · line {symbol}
                    {(Number(item.quantity) * Number(item.cost_per_unit) || 0).toFixed(2)}
                  </Text>
                </View>
                <TextInput
                  style={s.ingQty}
                  value={String(item.quantity)}
                  onChangeText={(t) => updateQty(item.inventory_item_id, t)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={s.ingUnit}
                  onPress={() => cycleUnit(item.inventory_item_id)}
                >
                  <Text style={s.ingUnitText}>{item.unit}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeLine(item.inventory_item_id)}
                  hitSlop={8}
                  style={s.ingDelete}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
          />
        </KeyboardAvoidingView>

        {/* Save bar */}
        <View style={[s.saveBar, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[s.saveBtn, saveRecipe.isPending && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saveRecipe.isPending}
            activeOpacity={0.85}
          >
            {saveRecipe.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Save Recipe</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <IngredientPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          ingredients={ingredients}
          existingIds={existingIds}
          onAdd={addIngredient}
          colors={colors}
          s={s}
          symbol={symbol}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecipeManagerScreen() {
  const { colors } = useTheme();
  const { symbol } = useCurrency();
  const { outletId } = useOutlet();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editorRow, setEditorRow] = useState(null);

  const recipesQ = useRecipes();
  const menuQ = useRecipeMenu();
  const ingredientsQ = useRecipeIngredients();

  const rows = useMemo(
    () => buildRecipeRows(menuQ.data, recipesQ.data),
    [menuQ.data, recipesQ.data],
  );
  const stats = useMemo(() => summarize(rows), [rows]);
  const visible = useMemo(() => filterRows(rows, { query, filter }), [rows, query, filter]);

  const isLoading = menuQ.isLoading || recipesQ.isLoading;
  const isError = menuQ.isError && recipesQ.isError;
  const isRefetching = menuQ.isRefetching || recipesQ.isRefetching;

  const onRefresh = useCallback(() => {
    recipesQ.refetch();
    menuQ.refetch();
    ingredientsQ.refetch();
  }, [recipesQ, menuQ, ingredientsQ]);

  const openEditor = useCallback((row) => setEditorRow(row), []);

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · KITCHEN</Text>
            <Text style={s.title}>Recipe Manager</Text>
            <Text style={s.subtitle}>
              Standard recipes · {stats.withCount}/{stats.total} costed
            </Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={s.refreshBtn} hitSlop={8}>
            <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Search */}
      <View style={s.searchBarWrap}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search menu items"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter pills */}
      <View style={s.pillRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.pill, active && s.pillActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Body */}
      {isLoading ? (
        <Skeleton s={s} />
      ) : isError ? (
        <Animated.View entering={FadeIn.duration(300)} style={s.emptyWrap}>
          <View style={[s.emptyIconCircle, { backgroundColor: colors.error + '18' }]}>
            <Ionicons name="cloud-offline-outline" size={44} color={colors.error} />
          </View>
          <Text style={s.emptyTitle}>Couldn’t load recipes</Text>
          <Text style={s.emptySub}>Check your connection and try again.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(r) => String(r.id)}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
          ListHeaderComponent={
            rows.length ? (
              <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(300) : undefined}>
                <SummaryStrip stats={stats} colors={colors} s={s} />
              </Animated.View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState colors={colors} s={s} filter={filter} hasItems={rows.length > 0} />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <RecipeRow
              row={item}
              symbol={symbol}
              colors={colors}
              s={s}
              onPress={openEditor}
            />
          )}
        />
      )}

      <RecipeEditor
        visible={!!editorRow}
        row={editorRow}
        ingredients={ingredientsQ.data}
        onClose={() => setEditorRow(null)}
        onSaved={onRefresh}
        colors={colors}
        s={s}
        symbol={symbol}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      backgroundColor: c.headerBg,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: c.textMuted,
      marginBottom: 2,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },
    refreshBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.pillBg,
    },

    searchBarWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, backgroundColor: c.bg },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text, padding: 0 },

    pillRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: c.pillBg,
    },
    pillActive: { backgroundColor: c.accent },
    pillText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    pillTextActive: { color: '#fff', fontWeight: '700' },

    // Summary
    summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
    summaryCard: {
      flex: 1,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    summaryValue: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    summaryLabel: { fontSize: 10, color: c.textMuted, fontWeight: '600', marginTop: 2, textAlign: 'center' },

    // Row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 12,
    },
    rowIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.pillBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowMain: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 15, fontWeight: '700', color: c.text },
    rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    rowCat: { fontSize: 12, color: c.textMuted, maxWidth: '55%' },
    rowPrice: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    rowRight: { alignItems: 'flex-end', gap: 3, minWidth: 66 },
    rowCost: { fontSize: 14, fontWeight: '800', color: c.text },
    rowIngCount: { fontSize: 10, color: c.textMuted },
    marginPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    marginPillText: { fontSize: 12, fontWeight: '800' },
    noRecipeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    noRecipeText: { fontSize: 12, fontWeight: '700', color: c.accent },

    // Skeleton
    skelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginVertical: 4,
      gap: 12,
    },
    skelIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.border },
    skelBar: { height: 13, borderRadius: 6, backgroundColor: c.border },

    // Empty / error
    emptyWrap: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
    emptyIconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.accent + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    emptySub: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accent,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: 12,
      marginTop: 20,
    },
    retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Editor
    editorRoot: { flex: 1, backgroundColor: c.bg },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.headerBg,
      gap: 4,
    },
    editorClose: { padding: 4 },
    editorTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    editorSub: { fontSize: 12, color: c.textSecondary, marginTop: 1 },

    costCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
    },
    costCol: { flex: 1, alignItems: 'center' },
    costDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    costLabel: { fontSize: 10, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    costValue: { fontSize: 18, fontWeight: '800', color: c.text, marginTop: 4, letterSpacing: -0.4 },

    metaCard: {
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    metaLabel: { fontSize: 11, color: c.textMuted, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
    metaInput: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: 15,
      color: c.text,
    },
    metaYieldRow: { flexDirection: 'row', marginTop: 12 },
    unitToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    unitToggleText: { fontSize: 15, color: c.text, fontWeight: '600' },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    ingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      gap: 8,
    },
    ingMain: { flex: 1, minWidth: 0 },
    ingName: { fontSize: 14, fontWeight: '700', color: c.text },
    ingMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    ingQty: {
      width: 56,
      height: 40,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    ingUnit: {
      minWidth: 44,
      height: 40,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: c.pillBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ingUnitText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    ingDelete: { padding: 4 },

    editorEmpty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 30 },
    editorEmptyText: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginTop: 10 },
    editorEmptySub: { fontSize: 13, color: c.textMuted, marginTop: 4 },

    saveBar: {
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.headerBg,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.accent,
      height: 50,
      borderRadius: 14,
    },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    // Ingredient picker
    pickerOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    pickerSheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: '78%',
      paddingTop: 8,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    pickerTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    pickerRowMain: { flex: 1, minWidth: 0 },
    pickerRowName: { fontSize: 15, fontWeight: '700', color: c.text },
    pickerRowMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    pickerEmpty: { alignItems: 'center', paddingVertical: 50 },
    pickerEmptyText: { fontSize: 14, color: c.textMuted, marginTop: 10 },
  });
}
