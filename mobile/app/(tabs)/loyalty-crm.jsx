/**
 * Loyalty & CRM — "Rewards & campaigns".
 * Expo 54 · RN 0.81 · expo-router 6 · React 19 · Reanimated 4 · FlashList 2
 *
 * A 3-tab console for the outlet's customer programme:
 *   • Overview  — CRM KPIs (customers / active / at-risk / points) + upcoming
 *                 birthdays with a "Send birthday offer" action.
 *   • Loyalty   — read + edit the points programme config, and top loyalty
 *                 members with a quick +/− points adjust.
 *   • Campaigns — list past/scheduled campaigns + a "New Campaign" composer.
 *
 * Data + pure transforms live in src/hooks/useLoyaltyCrm.js. All money uses
 * useCurrency; every fetch is scoped to the SELECTED outlet.
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
  ScrollView,
  ActivityIndicator,
  Switch,
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
  useCrmDashboard,
  useBirthdays,
  useCampaigns,
  useLoyaltyConfig,
  useCrmCustomers,
  useSendBirthdayCampaign,
  useCreateCampaign,
  useUpdateLoyaltyConfig,
  useAdjustPoints,
  normalizeCrm,
  buildBirthdayRows,
  topLoyaltyMembers,
  buildCampaignRows,
  configToForm,
  formToConfigPayload,
  buildCampaignPayload,
  LOYALTY_FIELDS,
  CAMPAIGN_TYPES,
  SEGMENTS,
} from '../../src/hooks/useLoyaltyCrm';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'stats-chart-outline' },
  { key: 'loyalty', label: 'Loyalty', icon: 'ribbon-outline' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone-outline' },
];

const DEFAULT_BDAY_MSG =
  'Happy Birthday {name}! 🎂 Enjoy 10% off your next visit with code BDAY10. From Team MS-RM!';

const SEGMENT_TONE = {
  vip: 'accent',
  regular: 'success',
  new: 'warning',
  lapsed: 'error',
};

// ─── Shared bits ────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, tone, colors, s }) {
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: (tone || colors.accent) + '18' }]}>
        <Ionicons name={icon} size={16} color={tone || colors.accent} />
      </View>
      <Text style={[s.kpiValue, tone && { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SectionHead({ title, count, s }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {count != null ? <Text style={s.sectionCount}>{count}</Text> : null}
    </View>
  );
}

function Skeleton({ s, rows = 5 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={s.skelStrip}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.skelKpi} />
        ))}
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={s.skelRow}>
          <View style={s.skelIcon} />
          <View style={{ flex: 1 }}>
            <View style={[s.skelBar, { width: '55%' }]} />
            <View style={[s.skelBar, { width: '32%', marginTop: 8, height: 10 }]} />
          </View>
          <View style={[s.skelBar, { width: 44, height: 22 }]} />
        </View>
      ))}
    </View>
  );
}

function EmptyBlock({ icon, title, sub, colors, s }) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={s.emptyWrap}>
      <View style={s.emptyIconCircle}>
        <Ionicons name={icon} size={40} color={colors.accent} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {sub ? <Text style={s.emptySub}>{sub}</Text> : null}
    </Animated.View>
  );
}

function ErrorBlock({ onRetry, colors, s }) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={s.emptyWrap}>
      <View style={[s.emptyIconCircle, { backgroundColor: colors.error + '18' }]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.error} />
      </View>
      <Text style={s.emptyTitle}>Couldn’t load data</Text>
      <Text style={s.emptySub}>Check your connection and try again.</Text>
      <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={s.retryText}>Retry</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────────
function OverviewTab({ colors, s, symbol, fmtFull }) {
  const dashQ = useCrmDashboard();
  const bdayQ = useBirthdays(14);
  const sendBday = useSendBirthdayCampaign();

  const kpis = useMemo(() => normalizeCrm(dashQ.data), [dashQ.data]);
  const birthdays = useMemo(() => buildBirthdayRows(bdayQ.data), [bdayQ.data]);

  const [bdayModal, setBdayModal] = useState(false);
  const [bdayMsg, setBdayMsg] = useState(DEFAULT_BDAY_MSG);

  const onRefresh = useCallback(() => {
    dashQ.refetch();
    bdayQ.refetch();
  }, [dashQ, bdayQ]);

  const confirmSend = useCallback(() => {
    sendBday.mutate(bdayMsg.trim() || DEFAULT_BDAY_MSG, {
      onSuccess: (res) => {
        setBdayModal(false);
        const sent = res?.data?.sent ?? res?.sent ?? 0;
        Alert.alert(
          'Birthday offer',
          sent > 0 ? `Sent to ${sent} customer${sent === 1 ? '' : 's'} with a birthday today.` : 'No customers have a birthday today.',
        );
      },
      onError: (err) => Alert.alert('Could not send', err?.message || 'Please try again.'),
    });
  }, [bdayMsg, sendBday]);

  if (dashQ.isLoading) return <Skeleton s={s} />;
  if (dashQ.isError) return <ErrorBlock onRetry={onRefresh} colors={colors} s={s} />;

  return (
    <>
      <FlashList
        data={birthdays}
        keyExtractor={(r) => String(r.id)}
        estimatedItemSize={64}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={dashQ.isRefetching || bdayQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(280) : undefined}>
            <View style={s.kpiGrid}>
              <KpiCard label="Customers" value={kpis.totalCustomers} icon="people-outline" colors={colors} s={s} />
              <KpiCard label="Active" value={kpis.activeCount} icon="pulse-outline" tone={colors.success} colors={colors} s={s} />
              <KpiCard label="At risk" value={kpis.atRiskCount} icon="alert-circle-outline" tone={colors.warning} colors={colors} s={s} />
              <KpiCard label="VIPs" value={kpis.vipCount} icon="star-outline" tone={colors.accent} colors={colors} s={s} />
            </View>

            <View style={s.pointsCard}>
              <View style={s.pointsCol}>
                <Text style={s.pointsValue}>{kpis.pointsOutstanding.toLocaleString()}</Text>
                <Text style={s.pointsLabel}>Points outstanding</Text>
              </View>
              <View style={s.pointsDivider} />
              <View style={s.pointsCol}>
                <Text style={[s.pointsValue, { color: colors.success }]}>{kpis.pointsEarned.toLocaleString()}</Text>
                <Text style={s.pointsLabel}>Issued</Text>
              </View>
              <View style={s.pointsDivider} />
              <View style={s.pointsCol}>
                <Text style={[s.pointsValue, { color: colors.warning }]}>{kpis.pointsRedeemed.toLocaleString()}</Text>
                <Text style={s.pointsLabel}>Redeemed</Text>
              </View>
            </View>

            <View style={s.bdayCta}>
              <View style={{ flex: 1 }}>
                <Text style={s.bdayCtaTitle}>Birthday offers</Text>
                <Text style={s.bdayCtaSub}>Send today’s birthday guests a treat.</Text>
              </View>
              <TouchableOpacity
                style={s.bdayCtaBtn}
                onPress={() => setBdayModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="gift-outline" size={16} color="#fff" />
                <Text style={s.bdayCtaBtnText}>Send offer</Text>
              </TouchableOpacity>
            </View>

            <SectionHead title="Upcoming birthdays" count={birthdays.length} s={s} />
          </Animated.View>
        }
        ListEmptyComponent={
          bdayQ.isLoading ? (
            <View style={{ paddingHorizontal: 16 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={s.skelRow}>
                  <View style={s.skelIcon} />
                  <View style={{ flex: 1 }}>
                    <View style={[s.skelBar, { width: '50%' }]} />
                    <View style={[s.skelBar, { width: '30%', marginTop: 8, height: 10 }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyBlock
              icon="balloon-outline"
              title="No upcoming birthdays"
              sub="Capture birth dates at the POS to unlock birthday campaigns."
              colors={colors}
              s={s}
            />
          )
        }
        renderItem={({ item }) => (
          <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(200) : undefined}>
            <View style={s.row}>
              <View style={[s.rowIconWrap, item.isToday && { backgroundColor: colors.accent + '22' }]}>
                <Ionicons
                  name={item.isToday ? 'gift' : 'gift-outline'}
                  size={18}
                  color={item.isToday ? colors.accent : colors.textMuted}
                />
              </View>
              <View style={s.rowMain}>
                <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>{item.phone || 'No phone'} · {item.dobLabel}</Text>
              </View>
              <View style={[s.datePill, item.isToday && { backgroundColor: colors.accent + '22' }]}>
                <Text style={[s.datePillText, item.isToday && { color: colors.accent }]}>{item.label}</Text>
              </View>
            </View>
          </Animated.View>
        )}
      />

      {/* Birthday campaign composer */}
      <Modal visible={bdayModal} animationType="slide" transparent onRequestClose={() => setBdayModal(false)}>
        <View style={s.sheetOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Send birthday offer</Text>
                <TouchableOpacity onPress={() => setBdayModal(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={s.fieldLabel}>Message</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={bdayMsg}
                onChangeText={setBdayMsg}
                multiline
                placeholder={DEFAULT_BDAY_MSG}
                placeholderTextColor={colors.textMuted}
                maxLength={500}
              />
              <Text style={s.fieldHint}>Sent to everyone whose birthday is today. Use {'{name}'} to personalise.</Text>
              <TouchableOpacity
                style={[s.primaryBtn, sendBday.isPending && { opacity: 0.6 }]}
                onPress={confirmSend}
                disabled={sendBday.isPending}
                activeOpacity={0.85}
              >
                {sendBday.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={s.primaryBtnText}>Send now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Loyalty tab ─────────────────────────────────────────────────────────────
function LoyaltyTab({ colors, s, symbol, fmtFull }) {
  const configQ = useLoyaltyConfig();
  const customersQ = useCrmCustomers();
  const saveConfig = useUpdateLoyaltyConfig();
  const adjust = useAdjustPoints();

  const members = useMemo(() => topLoyaltyMembers(customersQ.data), [customersQ.data]);

  const [form, setForm] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState(false);

  // Seed the form once config arrives.
  React.useEffect(() => {
    if (configQ.data) {
      setForm(configToForm(configQ.data));
      setEnabled(configQ.data.enabled !== false);
    }
  }, [configQ.data]);

  // Adjust-points modal state.
  const [member, setMember] = useState(null);
  const [adjSign, setAdjSign] = useState(1);
  const [adjPoints, setAdjPoints] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const setField = useCallback((key, val) => {
    setForm((prev) => ({ ...(prev || {}), [key]: val.replace(/[^0-9.]/g, '') }));
  }, []);

  const onSaveConfig = useCallback(() => {
    const payload = formToConfigPayload(form, enabled);
    saveConfig.mutate(payload, {
      onSuccess: () => {
        setEditing(false);
        Alert.alert('Saved', 'Loyalty programme updated.');
      },
      onError: (err) => Alert.alert('Could not save', err?.message || 'Please try again.'),
    });
  }, [form, enabled, saveConfig]);

  const openAdjust = useCallback((m) => {
    setMember(m);
    setAdjSign(1);
    setAdjPoints('');
    setAdjReason('');
  }, []);

  const confirmAdjust = useCallback(() => {
    const pts = Math.round(Number(adjPoints));
    if (!pts || pts <= 0) {
      Alert.alert('Enter points', 'Add a whole number of points to adjust.');
      return;
    }
    if (!adjReason.trim()) {
      Alert.alert('Add a reason', 'A reason is required for manual adjustments.');
      return;
    }
    adjust.mutate(
      { customerId: member.id, points: pts * adjSign, reason: adjReason.trim() },
      {
        onSuccess: () => {
          setMember(null);
          Alert.alert('Done', `${adjSign > 0 ? 'Added' : 'Deducted'} ${pts} points for ${member.name}.`);
        },
        onError: (err) => Alert.alert('Could not adjust', err?.message || 'Please try again.'),
      },
    );
  }, [adjPoints, adjReason, adjSign, member, adjust]);

  const onRefresh = useCallback(() => {
    configQ.refetch();
    customersQ.refetch();
  }, [configQ, customersQ]);

  if (configQ.isLoading || !form) return <Skeleton s={s} rows={4} />;
  if (configQ.isError) return <ErrorBlock onRetry={onRefresh} colors={colors} s={s} />;

  return (
    <>
      <FlashList
        data={members}
        keyExtractor={(m) => String(m.id)}
        estimatedItemSize={68}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={configQ.isRefetching || customersQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <Animated.View entering={Platform.OS !== 'web' ? FadeInDown.duration(280) : undefined}>
            {/* Config card */}
            <View style={s.configCard}>
              <View style={s.configTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.configTitle}>Points programme</Text>
                  <Text style={s.configSub}>
                    {enabled
                      ? `Earn ${form.earn_rate || 0} pt / ${symbol}${form.earn_per_amount || 0} · 1 pt = ${symbol}${form.redeem_value || 0}`
                      : 'Programme is turned off'}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => { setEnabled(v); setEditing(true); }}
                  trackColor={{ true: colors.accent, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>

              {editing ? (
                <View style={s.configForm}>
                  {LOYALTY_FIELDS.map((f) => (
                    <View key={f.key} style={s.configField}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>{f.label}</Text>
                        <Text style={s.fieldHint} numberOfLines={1}>{f.hint}</Text>
                      </View>
                      <TextInput
                        style={s.configInput}
                        value={String(form[f.key] ?? '')}
                        onChangeText={(t) => setField(f.key, t)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  ))}
                  <View style={s.configActions}>
                    <TouchableOpacity
                      style={s.ghostBtn}
                      onPress={() => {
                        setForm(configToForm(configQ.data));
                        setEnabled(configQ.data.enabled !== false);
                        setEditing(false);
                      }}
                    >
                      <Text style={s.ghostBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.primaryBtn, { flex: 1 }, saveConfig.isPending && { opacity: 0.6 }]}
                      onPress={onSaveConfig}
                      disabled={saveConfig.isPending}
                      activeOpacity={0.85}
                    >
                      {saveConfig.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="save-outline" size={16} color="#fff" />
                          <Text style={s.primaryBtnText}>Save config</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.editConfigBtn} onPress={() => setEditing(true)}>
                  <Ionicons name="create-outline" size={15} color={colors.accent} />
                  <Text style={s.editConfigText}>Edit configuration</Text>
                </TouchableOpacity>
              )}
            </View>

            <SectionHead title="Top loyalty members" count={members.length} s={s} />
          </Animated.View>
        }
        ListEmptyComponent={
          customersQ.isLoading ? (
            <View style={{ paddingHorizontal: 16 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={s.skelRow}>
                  <View style={s.skelIcon} />
                  <View style={{ flex: 1 }}>
                    <View style={[s.skelBar, { width: '48%' }]} />
                    <View style={[s.skelBar, { width: '28%', marginTop: 8, height: 10 }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyBlock
              icon="ribbon-outline"
              title="No loyalty members yet"
              sub="Members appear here once customers start earning points."
              colors={colors}
              s={s}
            />
          )
        }
        renderItem={({ item, index }) => {
          const tone = colors[SEGMENT_TONE[item.segment]] || colors.textMuted;
          return (
            <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(200) : undefined}>
              <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => openAdjust(item)}>
                <View style={s.rankWrap}>
                  <Text style={s.rankText}>{index + 1}</Text>
                </View>
                <View style={s.rowMain}>
                  <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                  <View style={s.rowMetaLine}>
                    <View style={[s.segPill, { backgroundColor: tone + '22' }]}>
                      <Text style={[s.segPillText, { color: tone }]}>{item.segment}</Text>
                    </View>
                    <Text style={s.rowMeta} numberOfLines={1}>{fmtFull(item.totalSpend)} · {item.visits} visits</Text>
                  </View>
                </View>
                <View style={s.rowRight}>
                  <Text style={s.pointsBig}>{item.points.toLocaleString()}</Text>
                  <Text style={s.pointsSmall}>points</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />

      {/* Adjust points modal */}
      <Modal visible={!!member} animationType="slide" transparent onRequestClose={() => setMember(null)}>
        <View style={s.sheetOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <View>
                  <Text style={s.sheetTitle}>Adjust points</Text>
                  {member ? <Text style={s.sheetSub}>{member.name} · {member.points.toLocaleString()} pts</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setMember(null)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={s.signRow}>
                <TouchableOpacity
                  style={[s.signBtn, adjSign > 0 && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => setAdjSign(1)}
                >
                  <Ionicons name="add" size={16} color={adjSign > 0 ? '#fff' : colors.textSecondary} />
                  <Text style={[s.signBtnText, adjSign > 0 && { color: '#fff' }]}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.signBtn, adjSign < 0 && { backgroundColor: colors.error, borderColor: colors.error }]}
                  onPress={() => setAdjSign(-1)}
                >
                  <Ionicons name="remove" size={16} color={adjSign < 0 ? '#fff' : colors.textSecondary} />
                  <Text style={[s.signBtnText, adjSign < 0 && { color: '#fff' }]}>Deduct</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>Points</Text>
              <TextInput
                style={s.input}
                value={adjPoints}
                onChangeText={(t) => setAdjPoints(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="e.g. 100"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Reason</Text>
              <TextInput
                style={s.input}
                value={adjReason}
                onChangeText={setAdjReason}
                placeholder="e.g. Goodwill gesture"
                placeholderTextColor={colors.textMuted}
                maxLength={255}
              />
              <TouchableOpacity
                style={[s.primaryBtn, adjust.isPending && { opacity: 0.6 }]}
                onPress={confirmAdjust}
                disabled={adjust.isPending}
                activeOpacity={0.85}
              >
                {adjust.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={s.primaryBtnText}>{adjSign > 0 ? 'Add points' : 'Deduct points'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Campaigns tab ───────────────────────────────────────────────────────────
function CampaignsTab({ colors, s, symbol, fmtDate }) {
  const campaignsQ = useCampaigns();
  const createCampaign = useCreateCampaign();

  const rows = useMemo(() => buildCampaignRows(campaignsQ.data), [campaignsQ.data]);

  const [composer, setComposer] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('sms');
  const [segment, setSegment] = useState('all');

  const resetForm = useCallback(() => {
    setName('');
    setMessage('');
    setType('sms');
    setSegment('all');
  }, []);

  const onCreate = useCallback(() => {
    let payload;
    try {
      payload = buildCampaignPayload({ name, message, type, target_segment: segment });
    } catch (e) {
      Alert.alert('Check the form', e.message);
      return;
    }
    createCampaign.mutate(payload, {
      onSuccess: (res) => {
        setComposer(false);
        resetForm();
        const recipients = res?.data?.total_recipients ?? res?.data?.sent_count ?? 0;
        Alert.alert('Campaign sent', recipients ? `Delivered to ${recipients} customers.` : 'Your campaign is on its way.');
      },
      onError: (err) => Alert.alert('Could not send', err?.message || 'Please try again.'),
    });
  }, [name, message, type, segment, createCampaign, resetForm]);

  const onRefresh = useCallback(() => campaignsQ.refetch(), [campaignsQ]);

  return (
    <>
      {campaignsQ.isLoading ? (
        <Skeleton s={s} rows={5} />
      ) : campaignsQ.isError ? (
        <ErrorBlock onRetry={onRefresh} colors={colors} s={s} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          estimatedItemSize={92}
          contentContainerStyle={{ paddingBottom: 96, paddingTop: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={campaignsQ.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyBlock
              icon="megaphone-outline"
              title="No campaigns yet"
              sub="Create your first SMS, WhatsApp or email blast to bring guests back."
              colors={colors}
              s={s}
            />
          }
          renderItem={({ item }) => {
            const tone = colors[item.statusTone] || colors.textMuted;
            const channel = CAMPAIGN_TYPES.find((t) => t.key === item.type) || CAMPAIGN_TYPES[0];
            return (
              <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(200) : undefined}>
                <View style={s.campaignCard}>
                  <View style={s.campaignTop}>
                    <View style={s.channelIcon}>
                      <Ionicons name={channel.icon} size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.campaignName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.campaignMeta} numberOfLines={1}>
                        {channel.label} · {item.audience}
                      </Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: tone + '22' }]}>
                      <Text style={[s.statusPillText, { color: tone }]}>{item.statusLabel}</Text>
                    </View>
                  </View>
                  {item.message ? (
                    <Text style={s.campaignMsg} numberOfLines={2}>{item.message}</Text>
                  ) : null}
                  <View style={s.campaignFoot}>
                    <View style={s.campaignStat}>
                      <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                      <Text style={s.campaignStatText}>{item.recipients} sent</Text>
                    </View>
                    {item.delivered ? (
                      <View style={s.campaignStat}>
                        <Ionicons name="checkmark-done-outline" size={13} color={colors.success} />
                        <Text style={s.campaignStatText}>{item.delivered} delivered</Text>
                      </View>
                    ) : null}
                    {item.sentAt ? (
                      <Text style={s.campaignDate}>{fmtDate(item.sentAt)}</Text>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            );
          }}
        />
      )}

      {/* New campaign FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setComposer(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Composer modal */}
      <Modal visible={composer} animationType="slide" onRequestClose={() => setComposer(false)}>
        <SafeAreaView style={s.composerRoot} edges={['top']}>
          <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
          <View style={s.composerHeader}>
            <TouchableOpacity onPress={() => setComposer(false)} hitSlop={10}>
              <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={s.composerTitle}>New campaign</Text>
            <View style={{ width: 26 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Campaign name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Weekend Feast 20% off"
                placeholderTextColor={colors.textMuted}
                maxLength={100}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Channel</Text>
              <View style={s.chipRow}>
                {CAMPAIGN_TYPES.map((t) => {
                  const active = type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[s.chip, active && s.chipActive]}
                      onPress={() => setType(t.key)}
                    >
                      <Ionicons name={t.icon} size={15} color={active ? '#fff' : colors.textSecondary} />
                      <Text style={[s.chipText, active && s.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Audience</Text>
              <View style={s.chipRow}>
                {SEGMENTS.map((seg) => {
                  const active = segment === seg.key;
                  return (
                    <TouchableOpacity
                      key={seg.key}
                      style={[s.chip, active && s.chipActive]}
                      onPress={() => setSegment(seg.key)}
                    >
                      <Text style={[s.chipText, active && s.chipTextActive]}>{seg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Message</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="Write your offer… Use {name} to personalise."
                placeholderTextColor={colors.textMuted}
                maxLength={1000}
              />
              <Text style={s.fieldHint}>{message.length}/1000 characters</Text>
            </ScrollView>

            <View style={s.composerFoot}>
              <TouchableOpacity
                style={[s.primaryBtn, createCampaign.isPending && { opacity: 0.6 }]}
                onPress={onCreate}
                disabled={createCampaign.isPending}
                activeOpacity={0.85}
              >
                {createCampaign.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={s.primaryBtnText}>Send campaign</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function LoyaltyCrmScreen() {
  const { colors } = useTheme();
  const { symbol, fmtFull, fmtDate } = useCurrency();
  const { currentOutlet } = useOutlet();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState('overview');

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.bg === '#0f172a' ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MS RM · CRM</Text>
            <Text style={s.title}>Rewards & Campaigns</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              Loyalty & marketing{currentOutlet?.name ? ` · ${currentOutlet.name}` : ''}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.tabBtn, active && s.tabBtnActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={t.icon} size={16} color={active ? colors.accent : colors.textMuted} />
                <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <View style={{ flex: 1 }}>
        {tab === 'overview' && <OverviewTab colors={colors} s={s} symbol={symbol} fmtFull={fmtFull} />}
        {tab === 'loyalty' && <LoyaltyTab colors={colors} s={s} symbol={symbol} fmtFull={fmtFull} />}
        {tab === 'campaigns' && <CampaignsTab colors={colors} s={s} symbol={symbol} fmtDate={fmtDate} />}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: c.headerBg,
    },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.textMuted, marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2, fontWeight: '500' },

    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 8,
      backgroundColor: c.headerBg,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.pillBg,
    },
    tabBtnActive: { backgroundColor: c.accent + '18' },
    tabText: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    tabTextActive: { color: c.accent },

    // KPI grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
    kpiCard: {
      width: '47.4%',
      flexGrow: 1,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 12,
    },
    kpiIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    kpiValue: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    kpiLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginTop: 1 },

    // Points strip
    pointsCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
    },
    pointsCol: { flex: 1, alignItems: 'center' },
    pointsDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    pointsValue: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
    pointsLabel: { fontSize: 10, color: c.textMuted, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 },

    // Birthday CTA
    bdayCta: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
    },
    bdayCtaTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    bdayCtaSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    bdayCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    bdayCtaBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Section header
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginTop: 22,
      marginBottom: 6,
      gap: 8,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    sectionCount: {
      fontSize: 12,
      fontWeight: '800',
      color: c.textMuted,
      backgroundColor: c.pillBg,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: 'hidden',
    },

    // Generic row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      marginHorizontal: 12,
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
    rankWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.accent + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { fontSize: 13, fontWeight: '800', color: c.accent },
    rowMain: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 15, fontWeight: '700', color: c.text },
    rowMeta: { fontSize: 12, color: c.textMuted, marginTop: 2, flexShrink: 1 },
    rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    rowRight: { alignItems: 'flex-end' },
    pointsBig: { fontSize: 16, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
    pointsSmall: { fontSize: 10, color: c.textMuted, fontWeight: '600' },

    segPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    segPillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },

    datePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: c.pillBg },
    datePillText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },

    // Loyalty config
    configCard: {
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    configTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    configTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    configSub: { fontSize: 12, color: c.textSecondary, marginTop: 3 },
    editConfigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
    editConfigText: { fontSize: 13, fontWeight: '700', color: c.accent },
    configForm: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
    configField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 8,
    },
    configInput: {
      width: 90,
      height: 42,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    configActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },

    // Buttons
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.accent,
      height: 50,
      borderRadius: 14,
      marginTop: 16,
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    ghostBtn: {
      paddingHorizontal: 18,
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: 15 },

    // Fields
    fieldLabel: { fontSize: 12, color: c.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    fieldHint: { fontSize: 11, color: c.textMuted, marginTop: 4 },
    input: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 46,
      fontSize: 15,
      color: c.text,
      marginTop: 6,
    },
    textarea: { height: 110, paddingTop: 12, textAlignVertical: 'top' },

    // Chips
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: c.pillBg,
    },
    chipActive: { backgroundColor: c.accent },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#fff', fontWeight: '700' },

    // Sign toggle
    signRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 4 },
    signBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.pillBg,
    },
    signBtnText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

    // Campaign card
    campaignCard: {
      backgroundColor: c.card,
      marginHorizontal: 12,
      marginVertical: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    campaignTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    channelIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.accent + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    campaignName: { fontSize: 15, fontWeight: '800', color: c.text },
    campaignMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusPillText: { fontSize: 11, fontWeight: '800' },
    campaignMsg: { fontSize: 13, color: c.textSecondary, marginTop: 10, lineHeight: 18 },
    campaignFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    campaignStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    campaignStatText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    campaignDate: { fontSize: 11, color: c.textMuted, marginLeft: 'auto' },

    // FAB
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },

    // Composer modal
    composerRoot: { flex: 1, backgroundColor: c.bg },
    composerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.headerBg,
    },
    composerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    composerFoot: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.headerBg,
    },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    sheetSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

    // Skeleton
    skelStrip: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    skelKpi: { flex: 1, height: 78, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
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
    emptyWrap: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 56 },
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
    emptySub: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
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
  });
}
