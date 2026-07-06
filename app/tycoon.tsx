import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedCashCounter } from "@/components/AnimatedCashCounter";
import { AnimatedProgressBar } from "@/components/AnimatedProgressBar";
import { EmpireSnapshotModal } from "@/components/EmpireSnapshotModal";
import { FloatingCashPopupLayer, type CashPopup } from "@/components/FloatingCashPopup";
import { GymBottomNav, type GymPageKey } from "@/components/GymBottomNav";
import { GymFloor3D, type Selection } from "@/components/GymFloor3D";
import { GymTopBar } from "@/components/GymTopBar";
import { NPC_NAMES } from "@/components/GymNpcs";
import { InspectorPanel } from "@/components/InspectorPanel";
import { PrestigeModal } from "@/components/PrestigeModal";
import { ShopItemCard } from "@/components/ShopItemCard";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { EQUIPMENT_CATALOG } from "@/constants/equipment";
import { UPGRADE_CATALOG } from "@/constants/upgrades";
import { MANAGER_CATALOG } from "@/constants/managers";
import { QUEST_CATALOG } from "@/constants/quests";
import { LOCATION_CATALOG } from "@/constants/locations";
import { ZONE_CATALOG } from "@/constants/zones";
import { STAFF_CATALOG } from "@/constants/staff";
import { MOCK_LEADERBOARD, sanitizeLeaderboardEntry } from "@/constants/leaderboard";
import { useUser, type PurchaseResult } from "@/contexts/UserContext";

type ShopTabKey = "equipment" | "upgrades" | "managers" | "zones" | "staff";

const SHOP_TABS: { key: ShopTabKey; label: string }[] = [
  { key: "equipment", label: "Equipment 🏋️" },
  { key: "upgrades", label: "Facility Upgrades ⚡" },
  { key: "managers", label: "Staff Managers 👥" },
  { key: "zones", label: "Facility Expansion Center 🏗️" },
  { key: "staff", label: "Staff Roster 🎖️" },
];

const TAP_BONUS_CASH = 5;

export default function TycoonScreen() {
  const router = useRouter();
  const {
    level,
    cash,
    cashPerSecond,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    buyEquipment,
    buyUpgrade,
    hireManager,
    upgradeEquipment,
    hiredStaffIds,
    hireStaff,
    buyZone,
    unlockedZones,
    renownPoints,
    renownToNextGymLevel,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    currentLocation,
    addCash,
    injectDevRiches,
    resetProgress,
    setEquipmentColor,
    rotateEquipment,
    pendingOfflineEarnings,
    clearPendingOfflineEarnings,
  } = useUser();
  const [activePage, setActivePage] = useState<GymPageKey>("gymFloor");
  const [activeShopTab, setActiveShopTab] = useState<ShopTabKey>("equipment");
  const [isPrestigeModalVisible, setPrestigeModalVisible] = useState(false);
  const [isSnapshotModalVisible, setSnapshotModalVisible] = useState(false);
  const [cashPopups, setCashPopups] = useState<CashPopup[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isEditingEquipment, setIsEditingEquipment] = useState(false);
  const [placingEquipmentId, setPlacingEquipmentId] = useState<string | null>(null);

  const renownFillPercent = Math.min(100, Math.max(0, (renownPoints / renownToNextGymLevel) * 100));

  const currentLocationIndex = LOCATION_CATALOG.findIndex((loc) => loc.id === currentLocationId);
  const nextLocation = LOCATION_CATALOG[currentLocationIndex + 1];
  const canPrestige =
    !!nextLocation &&
    gymLevel >= nextLocation.requiredLevel &&
    prestigeCount + 1 >= nextLocation.requiredPrestige;

  const leaderboardEntries = [...MOCK_LEADERBOARD, { name: "You", renownPoints, prestigeCount }]
    .map(sanitizeLeaderboardEntry)
    .sort((a, b) => b.renownPoints - a.renownPoints || b.prestigeCount - a.prestigeCount);

  function handlePurchaseResult(result: PurchaseResult) {
    if (!result.success) return;

    const lines: string[] = [];
    for (const quest of result.newlyCompleted) {
      lines.push(`🏆 ${quest.title} Complete! +$${quest.rewardCash} · +${quest.rewardRenown} Renown`);
    }
    if (result.gymLevelUp) {
      lines.push(`🌟 Gym Level Up! Now Level ${result.gymLevelUp.newGymLevel}`);
    }
    if (lines.length > 0) {
      Alert.alert("Nice!", lines.join("\n"));
    }
  }

  function handleCollectTap(event: GestureResponderEvent) {
    const { locationX, locationY } = event.nativeEvent;
    addCash(TAP_BONUS_CASH);
    setCashPopups((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, x: locationX, y: locationY, amount: TAP_BONUS_CASH },
    ]);
  }

  function handleUpgradeEquipment(equipmentId: string) {
    handlePurchaseResult(upgradeEquipment(equipmentId));
  }

  function handlePopupComplete(id: string) {
    setCashPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function handleDevRiches() {
    injectDevRiches();
    const message = "Sandbox Mode Activated: +$10M";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(message);
    } else {
      Alert.alert(message, "+$10,000,000 cash and +5,000 Renown injected.");
    }
  }

  function handleDevReset() {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Reset all progress back to level one?")) {
        resetProgress();
      }
    } else {
      Alert.alert("Reset Progress?", "This wipes cash, level, equipment, and quests back to a fresh start.", [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => resetProgress() },
      ]);
    }
  }

  useEffect(() => {
    if (pendingOfflineEarnings == null) return;
    const message = `+$${pendingOfflineEarnings} earned while you were away.`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(message);
    } else {
      Alert.alert("Welcome Back!", message);
    }
    clearPendingOfflineEarnings();
  }, [pendingOfflineEarnings, clearPendingOfflineEarnings]);

  /** Leaving the Gym Floor tab clears the 3D selection rather than leaving it
   * stale: GymFloor3D fully unmounts when its tab isn't active (see below),
   * so its own internal selection ring resets to nothing on remount — if
   * this screen's `selection` weren't also cleared, returning to the tab
   * would show the Inspector Panel for an item with no visible highlight in
   * the freshly-mounted scene, an inconsistent state. */
  function handleSelectPage(page: GymPageKey) {
    if (page !== "gymFloor") {
      setSelection(null);
      setIsEditingEquipment(false);
    }
    setActivePage(page);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <GymTopBar
        cash={cash}
        gymLevel={gymLevel}
        memberCount={NPC_NAMES.length}
        onBack={() => router.back()}
        onSnapshot={() => setSnapshotModalVisible(true)}
        onDevRiches={handleDevRiches}
        onDevReset={handleDevReset}
      />

      <View style={styles.pageContainer}>
        {activePage === "gymFloor" && (
          <View style={styles.gymFloorPage}>
            {/* Conditionally mounted, not just hidden — while any other tab is
             * active there is no Canvas, no GL context, and no useFrame loop
             * running at all for the 3D scene: the most complete "pause"
             * available, satisfying the battery-life goal literally rather
             * than approximately. The trade-off is that NPC positions, camera
             * angle/zoom, and any 3D selection reset each time you return —
             * expected tab-switch behavior, not a bug. The core economic tick
             * (cashPerSecond) lives in UserContext, mounted at the app root,
             * and is completely unaffected by this — it isn't tied to NPCs
             * actually being simulated. The one real side effect: the Clerk's
             * small Smoothie-Bar-recharge cash bonus pauses along with NPC
             * simulation while away from this tab, since that requires an
             * NPC to actually complete a recharge cycle to fire. */}
            <GymFloor3D
              onSelect={(next) => {
                setSelection(next);
                setIsEditingEquipment(false);
              }}
              placingEquipmentId={placingEquipmentId}
              onPlacementSettled={() => setPlacingEquipmentId(null)}
            />
            <InspectorPanel
              selection={selection}
              onClose={() => {
                setSelection(null);
                setIsEditingEquipment(false);
              }}
              isEditing={isEditingEquipment}
              onToggleEdit={() => setIsEditingEquipment((prev) => !prev)}
              onSetColor={setEquipmentColor}
              onRotate={rotateEquipment}
              onStartMove={(equipmentId) => setPlacingEquipmentId(equipmentId)}
              onUpgrade={handleUpgradeEquipment}
            />
          </View>
        )}

        {activePage === "shop" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.gymLevelCard}>
              <View style={styles.gymLevelTopRow}>
                <View>
                  <Text style={typography.label}>{currentLocation.name.toUpperCase()}</Text>
                  <Text style={styles.gymLevelValue}>Level {gymLevel}</Text>
                </View>
                <View style={styles.gymLevelBadge}>
                  <Ionicons name="star" size={22} color={colors.accentRenown} />
                </View>
              </View>

              <View style={styles.renownRow}>
                <AnimatedProgressBar percent={renownFillPercent} color={colors.accentRenown} />
                <Text style={styles.renownLabel}>
                  {renownPoints} / {renownToNextGymLevel} Renown
                </Text>
              </View>

              {canPrestige && (
                <Pressable style={styles.prestigeButton} onPress={() => setPrestigeModalVisible(true)}>
                  <Ionicons name="trending-up" size={16} color={colors.background} />
                  <Text style={styles.prestigeButtonText}>Prestige Available: {nextLocation.name}</Text>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.cashCard} onPress={handleCollectTap}>
              <Text style={typography.label}>CASH BALANCE</Text>
              <AnimatedCashCounter value={cash} style={styles.cashValue} />
              {cashPerSecond > 0 && (
                <Text style={styles.cashRate}>+${cashPerSecond.toFixed(1)}/sec idle income</Text>
              )}
              <Text style={styles.cashTapHint}>Tap to collect +${TAP_BONUS_CASH}</Text>
              <FloatingCashPopupLayer popups={cashPopups} onPopupComplete={handlePopupComplete} />
            </Pressable>

            <View style={styles.tabRow}>
              {SHOP_TABS.map((tab) => {
                const isActive = tab.key === activeShopTab;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveShopTab(tab.key)}
                    style={[styles.tabPill, isActive && styles.tabPillActive]}
                  >
                    <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeShopTab === "equipment" && (
              <View style={styles.itemList}>
                {EQUIPMENT_CATALOG.map((item) => {
                  const isOwned = purchasedEquipmentIds.includes(item.id);
                  const isLevelLocked = level < item.requiredLevel;
                  return (
                    <ShopItemCard
                      key={item.id}
                      icon="barbell-outline"
                      name={item.name}
                      subtitle={`$${item.cost} · +$${item.cashPerSecond}/sec`}
                      cost={item.cost}
                      isOwned={isOwned}
                      lockedReason={isLevelLocked ? `Requires Lv ${item.requiredLevel}` : undefined}
                      canAfford={cash >= item.cost}
                      onBuy={() => handlePurchaseResult(buyEquipment(item.id))}
                    />
                  );
                })}
              </View>
            )}

            {activeShopTab === "upgrades" && (
              <View style={styles.itemList}>
                {UPGRADE_CATALOG.map((item) => {
                  const isOwned = purchasedUpgradeIds.includes(item.id);
                  return (
                    <ShopItemCard
                      key={item.id}
                      icon="flash-outline"
                      name={item.name}
                      subtitle={`$${item.cost} · +${item.cashBonus * 100}% workout cash`}
                      cost={item.cost}
                      isOwned={isOwned}
                      canAfford={cash >= item.cost}
                      onBuy={() => handlePurchaseResult(buyUpgrade(item.id))}
                    />
                  );
                })}
              </View>
            )}

            {activeShopTab === "managers" && (
              <View style={styles.itemList}>
                {MANAGER_CATALOG.map((item) => {
                  const isOwned = hiredManagerIds.includes(item.id);
                  return (
                    <ShopItemCard
                      key={item.id}
                      icon="people-outline"
                      name={item.name}
                      subtitle={`$${item.cost} · +$${item.cashPerSecond}/sec`}
                      cost={item.cost}
                      isOwned={isOwned}
                      canAfford={cash >= item.cost}
                      onBuy={() => handlePurchaseResult(hireManager(item.id))}
                    />
                  );
                })}
              </View>
            )}

            {activeShopTab === "zones" && (
              <View style={styles.itemList}>
                {ZONE_CATALOG.map((zone) => {
                  const isOwned = unlockedZones.includes(zone.id);
                  const isLevelLocked = gymLevel < zone.requiredLevel;
                  return (
                    <ShopItemCard
                      key={zone.id}
                      icon="business-outline"
                      name={zone.name}
                      subtitle={`$${zone.cost}`}
                      cost={zone.cost}
                      isOwned={isOwned}
                      lockedReason={isLevelLocked ? `Requires Gym Lv ${zone.requiredLevel}` : undefined}
                      canAfford={cash >= zone.cost}
                      onBuy={() => handlePurchaseResult(buyZone(zone.id))}
                    />
                  );
                })}
              </View>
            )}

            {activeShopTab === "staff" && (
              <View style={styles.itemList}>
                {STAFF_CATALOG.map((staff) => {
                  const isOwned = hiredStaffIds.includes(staff.id);
                  return (
                    <ShopItemCard
                      key={staff.id}
                      icon="ribbon-outline"
                      name={`${staff.role} — ${staff.name}`}
                      subtitle={`${staff.operationalZone} · ${staff.description}`}
                      cost={staff.cost}
                      isOwned={isOwned}
                      canAfford={cash >= staff.cost}
                      onBuy={() => handlePurchaseResult(hireStaff(staff.id))}
                    />
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {activePage === "leaderboard" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={typography.label}>GLOBAL LEADERBOARD 🏆</Text>
              <View style={styles.leaderboardList}>
                {leaderboardEntries.map((entry, index) => {
                  const isPlayer = entry.name === "You";
                  return (
                    <View
                      key={`${entry.name}-${index}`}
                      style={[styles.leaderboardRow, isPlayer && styles.leaderboardRowPlayer]}
                    >
                      <Text style={[styles.leaderboardRank, isPlayer && styles.leaderboardTextPlayer]}>
                        #{index + 1}
                      </Text>
                      <Text
                        style={[styles.leaderboardName, isPlayer && styles.leaderboardTextPlayer]}
                        numberOfLines={1}
                      >
                        {entry.name}
                      </Text>
                      <Text style={[styles.leaderboardStat, isPlayer && styles.leaderboardTextPlayer]}>
                        {entry.renownPoints} Renown
                      </Text>
                      <Text style={[styles.leaderboardStat, isPlayer && styles.leaderboardTextPlayer]}>
                        Prestige {entry.prestigeCount}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}

        {activePage === "challenges" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={typography.label}>ACTIVE CHALLENGES 🎯</Text>
              <View style={styles.questList}>
                {QUEST_CATALOG.map((quest) => {
                  const isComplete = completedQuestIds.includes(quest.id);
                  const progress = quest.getProgress({
                    purchasedEquipmentIds,
                    hiredManagerIds,
                    cashPerSecond,
                    finishedWorkoutExerciseNames: [],
                  });

                  return (
                    <View
                      key={quest.id}
                      style={[styles.questCard, isComplete && styles.questCardComplete]}
                    >
                      <View style={styles.questIconBadge}>
                        <Ionicons
                          name={isComplete ? "checkmark-circle" : "flag-outline"}
                          size={20}
                          color={isComplete ? colors.success : colors.accentRenown}
                        />
                      </View>

                      <View style={styles.questInfo}>
                        <Text style={styles.questTitle}>{quest.title}</Text>
                        <Text style={styles.questDescription}>{quest.description}</Text>
                        <Text style={styles.questProgress}>
                          {isComplete
                            ? "Reward claimed!"
                            : `${progress.current}/${progress.target}`}
                        </Text>
                      </View>

                      <View style={styles.questReward}>
                        <Text style={styles.questRewardCash}>${quest.rewardCash}</Text>
                        <Text style={styles.questRewardRenown}>+{quest.rewardRenown} Renown</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      <GymBottomNav activePage={activePage} onSelectPage={handleSelectPage} />

      <PrestigeModal
        visible={isPrestigeModalVisible}
        onClose={() => setPrestigeModalVisible(false)}
      />
      <EmpireSnapshotModal
        visible={isSnapshotModalVisible}
        onClose={() => setSnapshotModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageContainer: {
    flex: 1,
  },
  gymFloorPage: {
    flex: 1,
    position: "relative",
  },
  gymLevelCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    gap: spacing.sm,
  },
  prestigeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentRenown,
  },
  prestigeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.background,
  },
  gymLevelTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gymLevelValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  gymLevelBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentRenownMuted,
    borderWidth: 1.5,
    borderColor: colors.accentRenown,
  },
  renownRow: {
    gap: spacing.xs,
  },
  renownLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
    alignSelf: "flex-end",
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  questList: {
    gap: spacing.sm,
  },
  questCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  questCardComplete: {
    borderColor: colors.success,
    backgroundColor: "rgba(52, 211, 153, 0.08)",
  },
  questIconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentRenownMuted,
  },
  questInfo: {
    flex: 1,
    gap: 2,
  },
  questTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  questDescription: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  questProgress: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentRenown,
    marginTop: 2,
  },
  questReward: {
    alignItems: "flex-end",
    gap: 2,
  },
  questRewardCash: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  questRewardRenown: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.accentRenown,
  },
  cashCard: {
    position: "relative",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cashTapHint: {
    marginTop: spacing.xs,
    fontSize: 11,
    fontWeight: "600",
    color: colors.accentPrimary,
  },
  cashValue: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  cashRate: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.success,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabPillActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimaryMuted,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  tabPillTextActive: {
    color: colors.accentPrimary,
  },
  itemList: {
    gap: spacing.md,
  },
  leaderboardList: {
    gap: spacing.xs,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leaderboardRowPlayer: {
    borderColor: colors.accentRenown,
    backgroundColor: colors.accentRenownMuted,
  },
  leaderboardRank: {
    width: 32,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  leaderboardName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  leaderboardStat: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  leaderboardTextPlayer: {
    color: colors.accentRenown,
  },
});
