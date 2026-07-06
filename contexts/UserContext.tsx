import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EQUIPMENT_CATALOG, type EquipmentCustomization } from "@/constants/equipment";
import { isValidCell, getOccupiedCells } from "@/constants/equipmentGrid";
import { UPGRADE_CATALOG } from "@/constants/upgrades";
import { MANAGER_CATALOG } from "@/constants/managers";
import { QUEST_CATALOG, type Quest, type QuestContext } from "@/constants/quests";
import { LOCATION_CATALOG, getLocation, type Location } from "@/constants/locations";
import { ZONE_CATALOG, MAIN_FLOOR_ZONE_ID, getPlayAreaBounds } from "@/constants/zones";
import {
  STAFF_CATALOG,
  TRAINER_IRON_VAULT_MULTIPLIER,
  EQUIPMENT_TECHNICIAN_BONUS,
  MARKETING_SPECIALIST_BONUS,
  HEAD_TRAINER_EQUIPMENT_BONUS,
  HEAD_TRAINER_WORKOUT_BONUS,
} from "@/constants/staff";
import { createDebouncedSaver, loadJSON } from "@/lib/storage";

export const XP_PER_LEVEL = 100;
export const RENOWN_PER_GYM_LEVEL = 100;
const STARTING_CASH = 100;
const STORAGE_KEY = "@flexquest/user";
const SAVE_DEBOUNCE_MS = 1500;

type AddXpResult = {
  leveledUp: boolean;
  newLevel: number;
};

type QuestCheckResult = {
  newlyCompleted: Quest[];
  gymLevelUp?: { newGymLevel: number };
};

export type PurchaseResult = QuestCheckResult & {
  success: boolean;
};

type PersistedUserStats = {
  level: number;
  xp: number;
  cash: number;
  purchasedEquipmentIds: string[];
  purchasedUpgradeIds: string[];
  hiredManagerIds: string[];
  renownPoints: number;
  gymLevel: number;
  completedQuestIds: string[];
  prestigeCount: number;
  currentLocationId: string;
  lifetimeCashEarned: number;
  unlockedZones: string[];
  equipmentLevels: Record<string, number>;
  hiredStaffIds: string[];
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};

function isValidPersistedStats(value: unknown): value is PersistedUserStats {
  if (typeof value !== "object" || value === null) return false;
  const stats = value as Record<string, unknown>;
  return (
    typeof stats.level === "number" &&
    typeof stats.xp === "number" &&
    typeof stats.cash === "number" &&
    Array.isArray(stats.purchasedEquipmentIds) &&
    Array.isArray(stats.purchasedUpgradeIds) &&
    Array.isArray(stats.hiredManagerIds) &&
    typeof stats.renownPoints === "number" &&
    typeof stats.gymLevel === "number" &&
    Array.isArray(stats.completedQuestIds) &&
    typeof stats.prestigeCount === "number" &&
    typeof stats.currentLocationId === "string" &&
    typeof stats.lifetimeCashEarned === "number" &&
    Array.isArray(stats.unlockedZones) &&
    typeof stats.equipmentLevels === "object" &&
    stats.equipmentLevels !== null &&
    Array.isArray(stats.hiredStaffIds) &&
    typeof stats.equipmentCustomizations === "object" &&
    stats.equipmentCustomizations !== null
  );
}

type UserContextValue = {
  level: number;
  xp: number;
  xpToNextLevel: number;
  addXp: (amount: number) => AddXpResult;
  cash: number;
  addCash: (amount: number) => void;
  purchasedEquipmentIds: string[];
  purchasedUpgradeIds: string[];
  hiredManagerIds: string[];
  /** Every owned machine's current tier — starts at 1, no cap. */
  equipmentLevels: Record<string, number>;
  /** Effective passive income, already including the prestige/location global multiplier. */
  cashPerSecond: number;
  /** Applied to lump-sum workout cash rewards, e.g. 1.2 = +20%. Never affects idle income. */
  cashRewardMultiplier: number;
  buyEquipment: (equipmentId: string) => PurchaseResult;
  buyUpgrade: (upgradeId: string) => PurchaseResult;
  hireManager: (managerId: string) => PurchaseResult;
  upgradeEquipment: (equipmentId: string) => PurchaseResult;
  /** Front Desk Clerk, Personal Trainer, Facility Janitor — contextual
   * multiplier bonuses, distinct from the flat +$/sec Staff Managers above. */
  hiredStaffIds: string[];
  hireStaff: (staffId: string) => PurchaseResult;
  /** Dev-sandbox cheat — no-ops outside dev builds. */
  injectDevRiches: () => void;
  renownPoints: number;
  renownToNextGymLevel: number;
  gymLevel: number;
  completedQuestIds: string[];
  checkQuests: (finishedWorkoutExerciseNames?: string[]) => QuestCheckResult;
  prestigeCount: number;
  currentLocationId: string;
  currentLocation: Location;
  /** (1 + prestigeCount * 0.5) * currentLocation.multiplier — applied to idle income and workout cash payouts. */
  globalMultiplier: number;
  prestigeReset: (targetLocationId: string) => boolean;
  /** Cumulative cash ever earned — unlike `cash`, never decreases (not even on prestige reset). */
  lifetimeCashEarned: number;
  unlockedZones: string[];
  buyZone: (zoneId: string) => PurchaseResult;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
  setEquipmentColor: (equipmentId: string, color: string) => void;
  rotateEquipment: (equipmentId: string) => void;
  moveEquipment: (equipmentId: string, row: number, col: number) => boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [cash, setCash] = useState(STARTING_CASH);
  const [purchasedEquipmentIds, setPurchasedEquipmentIds] = useState<string[]>([]);
  const [purchasedUpgradeIds, setPurchasedUpgradeIds] = useState<string[]>([]);
  const [hiredManagerIds, setHiredManagerIds] = useState<string[]>([]);
  const [renownPoints, setRenownPoints] = useState(0);
  const [gymLevel, setGymLevel] = useState(1);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [prestigeCount, setPrestigeCount] = useState(0);
  const [currentLocationId, setCurrentLocationId] = useState("garage");
  const [lifetimeCashEarned, setLifetimeCashEarned] = useState(0);
  const [unlockedZones, setUnlockedZones] = useState<string[]>([MAIN_FLOOR_ZONE_ID]);
  const [equipmentLevels, setEquipmentLevels] = useState<Record<string, number>>({});
  const [hiredStaffIds, setHiredStaffIds] = useState<string[]>([]);
  const [equipmentCustomizations, setEquipmentCustomizations] = useState<
    Record<string, EquipmentCustomization>
  >({});
  const [isHydrated, setIsHydrated] = useState(false);
  const debouncedSave = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;

  useEffect(() => {
    let cancelled = false;

    loadJSON<PersistedUserStats>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored && isValidPersistedStats(stored)) {
        setLevel(stored.level);
        setXp(stored.xp);
        setCash(stored.cash);
        setPurchasedEquipmentIds(stored.purchasedEquipmentIds);
        setPurchasedUpgradeIds(stored.purchasedUpgradeIds);
        setHiredManagerIds(stored.hiredManagerIds);
        setRenownPoints(stored.renownPoints);
        setGymLevel(stored.gymLevel);
        setCompletedQuestIds(stored.completedQuestIds);
        setPrestigeCount(stored.prestigeCount);
        setCurrentLocationId(stored.currentLocationId);
        setLifetimeCashEarned(stored.lifetimeCashEarned);
        setUnlockedZones(stored.unlockedZones);
        setEquipmentLevels(stored.equipmentLevels);
        setHiredStaffIds(stored.hiredStaffIds);
        setEquipmentCustomizations(stored.equipmentCustomizations);
      }
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const stats: PersistedUserStats = {
      level,
      xp,
      cash,
      purchasedEquipmentIds,
      purchasedUpgradeIds,
      hiredManagerIds,
      renownPoints,
      gymLevel,
      completedQuestIds,
      prestigeCount,
      currentLocationId,
      lifetimeCashEarned,
      unlockedZones,
      equipmentLevels,
      hiredStaffIds,
      equipmentCustomizations,
    };
    debouncedSave(stats);
  }, [
    level,
    xp,
    cash,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    renownPoints,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    lifetimeCashEarned,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    equipmentCustomizations,
    isHydrated,
    debouncedSave,
  ]);

  function addXp(amount: number): AddXpResult {
    const totalXp = xp + amount;
    const levelsGained = Math.floor(totalXp / XP_PER_LEVEL);
    const remainderXp = totalXp % XP_PER_LEVEL;

    setXp(remainderXp);

    if (levelsGained > 0) {
      const newLevel = level + levelsGained;
      setLevel(newLevel);
      return { leveledUp: true, newLevel };
    }

    return { leveledUp: false, newLevel: level };
  }

  /** Adds earned cash and tracks it toward lifetime earnings. Purchases and
   * the prestige reset touch `cash` directly instead, since spending/resetting
   * isn't "earning". */
  function creditCash(amount: number) {
    setCash((prev) => prev + amount);
    setLifetimeCashEarned((prev) => prev + amount);
  }

  function addCash(amount: number) {
    creditCash(amount);
  }

  function addRenown(amount: number): { leveledUp: boolean; newGymLevel: number } {
    const totalRenown = renownPoints + amount;
    const levelsGained = Math.floor(totalRenown / RENOWN_PER_GYM_LEVEL);
    const remainderRenown = totalRenown % RENOWN_PER_GYM_LEVEL;

    setRenownPoints(remainderRenown);

    if (levelsGained > 0) {
      const newGymLevel = gymLevel + levelsGained;
      setGymLevel(newGymLevel);
      return { leveledUp: true, newGymLevel };
    }

    return { leveledUp: false, newGymLevel: gymLevel };
  }

  const DEV_CASH_INJECTION = 10_000_000;
  const DEV_RENOWN_INJECTION = 5000;
  /** Highest requiredLevel across EQUIPMENT_CATALOG/LOCATION_CATALOG today —
   * kept as a floor (not an additive amount) so every shop lock reads true. */
  const DEV_LEVEL_FLOOR = 20;

  /** Dev-only sandbox cheat for testing late-game pricing/configurations
   * without grinding. Bypasses `creditCash` (this isn't "earned") and reuses
   * `addRenown`'s existing rollover math so a big renown injection correctly
   * fast-forwards `gymLevel` too. Equipment purchases gate on the *separate*
   * `level` stat (workout XP), not `gymLevel` — only bumping renown left
   * Treadmill/Cable Crossover/Lat Pulldown still locked, so `level` gets an
   * explicit floor here too. No-ops outside dev builds regardless of caller. */
  function injectDevRiches() {
    if (!__DEV__) return;
    setCash((prev) => prev + DEV_CASH_INJECTION);
    addRenown(DEV_RENOWN_INJECTION);
    setLevel((prev) => Math.max(prev, DEV_LEVEL_FLOOR));
    setGymLevel((prev) => Math.max(prev, DEV_LEVEL_FLOOR));
  }

  /** Evaluates quests against an explicit context (rather than reading state
   * directly) so callers that just changed state this tick — e.g. a purchase
   * that hasn't re-rendered yet — can pass the *post-change* values instead
   * of a stale snapshot. */
  function evaluateQuests(ctx: QuestContext): QuestCheckResult {
    const newlyCompleted = QUEST_CATALOG.filter(
      (quest) => !completedQuestIds.includes(quest.id) && quest.isComplete(ctx)
    );

    if (newlyCompleted.length === 0) {
      return { newlyCompleted: [] };
    }

    const totalCash = newlyCompleted.reduce((sum, quest) => sum + quest.rewardCash, 0);
    const totalRenown = newlyCompleted.reduce((sum, quest) => sum + quest.rewardRenown, 0);

    creditCash(totalCash);
    setCompletedQuestIds((prev) => [...prev, ...newlyCompleted.map((quest) => quest.id)]);
    const renownResult = addRenown(totalRenown);

    return {
      newlyCompleted,
      gymLevelUp: renownResult.leveledUp ? { newGymLevel: renownResult.newGymLevel } : undefined,
    };
  }

  function checkQuests(finishedWorkoutExerciseNames: string[] = []): QuestCheckResult {
    return evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames,
    });
  }

  const currentLocation = useMemo(() => getLocation(currentLocationId), [currentLocationId]);

  const globalMultiplier = useMemo(
    () => (1 + prestigeCount * 0.5) * currentLocation.multiplier,
    [prestigeCount, currentLocation]
  );

  const rawCashPerSecond = useMemo(() => {
    const hasIronVaultTrainer = hiredStaffIds.includes("coach_sarah");
    const staffEquipmentBonusMultiplier =
      1 +
      (hiredStaffIds.includes("tech_alex") ? EQUIPMENT_TECHNICIAN_BONUS : 0) +
      (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_EQUIPMENT_BONUS : 0);

    const equipmentIncome = EQUIPMENT_CATALOG.filter((item) =>
      purchasedEquipmentIds.includes(item.id)
    ).reduce((total, item) => {
      const base = item.cashPerSecond * (equipmentLevels[item.id] ?? 1);
      const ironVaultBonus = item.zoneId === "iron_vault" && hasIronVaultTrainer
        ? TRAINER_IRON_VAULT_MULTIPLIER
        : 1;
      return total + base * ironVaultBonus * staffEquipmentBonusMultiplier;
    }, 0);

    const managerIncome = MANAGER_CATALOG.filter((manager) =>
      hiredManagerIds.includes(manager.id)
    ).reduce((total, manager) => total + manager.cashPerSecond, 0);

    return equipmentIncome + managerIncome;
  }, [purchasedEquipmentIds, hiredManagerIds, equipmentLevels, hiredStaffIds]);

  const cashPerSecond = rawCashPerSecond * globalMultiplier;

  const cashRewardMultiplier = useMemo(() => {
    const upgradeBonus = UPGRADE_CATALOG.filter((upgrade) =>
      purchasedUpgradeIds.includes(upgrade.id)
    ).reduce((total, upgrade) => total + upgrade.cashBonus, 0);

    const staffWorkoutBonus =
      (hiredStaffIds.includes("marketer_jess") ? MARKETING_SPECIALIST_BONUS : 0) +
      (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_WORKOUT_BONUS : 0);

    return 1 + upgradeBonus + staffWorkoutBonus;
  }, [purchasedUpgradeIds, hiredStaffIds]);

  useEffect(() => {
    if (cashPerSecond <= 0) return;
    const interval = setInterval(() => {
      creditCash(cashPerSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [cashPerSecond]);

  function buyEquipment(equipmentId: string): PurchaseResult {
    const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
    if (!item) return { success: false, newlyCompleted: [] };
    if (purchasedEquipmentIds.includes(equipmentId)) return { success: false, newlyCompleted: [] };
    if (level < item.requiredLevel) return { success: false, newlyCompleted: [] };
    if (cash < item.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - item.cost);
    const nextEquipmentIds = [...purchasedEquipmentIds, equipmentId];
    setPurchasedEquipmentIds(nextEquipmentIds);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: 1 }));

    const nextRawCashPerSecond = rawCashPerSecond + item.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds: nextEquipmentIds,
      hiredManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  function upgradeEquipment(equipmentId: string): PurchaseResult {
    const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
    if (!item) return { success: false, newlyCompleted: [] };
    if (!purchasedEquipmentIds.includes(equipmentId)) return { success: false, newlyCompleted: [] };

    const currentLevel = equipmentLevels[equipmentId] ?? 1;
    const cost = Math.round(item.cost * Math.pow(1.5, currentLevel));
    if (cash < cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - cost);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: currentLevel + 1 }));

    const nextRawCashPerSecond = rawCashPerSecond + item.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  function setEquipmentColor(equipmentId: string, color: string): void {
    if (!purchasedEquipmentIds.includes(equipmentId)) return;
    setEquipmentCustomizations((prev) => {
      const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
      if (!item) return prev;
      const existing = prev[equipmentId];
      return {
        ...prev,
        [equipmentId]: {
          row: existing?.row ?? item.gridPosition.row,
          col: existing?.col ?? item.gridPosition.col,
          rotationStep: existing?.rotationStep ?? 0,
          color,
        },
      };
    });
  }

  function rotateEquipment(equipmentId: string): void {
    if (!purchasedEquipmentIds.includes(equipmentId)) return;
    setEquipmentCustomizations((prev) => {
      const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
      if (!item) return prev;
      const existing = prev[equipmentId];
      const currentStep = existing?.rotationStep ?? 0;
      const nextStep = ((currentStep + 1) % 4) as 0 | 1 | 2 | 3;
      return {
        ...prev,
        [equipmentId]: {
          row: existing?.row ?? item.gridPosition.row,
          col: existing?.col ?? item.gridPosition.col,
          color: existing?.color ?? item.color,
          rotationStep: nextStep,
        },
      };
    });
  }

  /** Returns whether the move was accepted. Rejects (no-op) if the target
   * cell fails validity (out of bounds, on a landmark, or occupied by
   * another owned item) — the caller (GymFloor3D's drag handler) should
   * snap its ghost preview back to the item's prior cell when this returns
   * false. */
  function moveEquipment(equipmentId: string, row: number, col: number): boolean {
    if (!purchasedEquipmentIds.includes(equipmentId)) return false;
    const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
    if (!item) return false;

    const bounds = getPlayAreaBounds(unlockedZones);
    const ownedEquipment = EQUIPMENT_CATALOG.filter((entry) =>
      purchasedEquipmentIds.includes(entry.id)
    );
    const occupied = getOccupiedCells(ownedEquipment, equipmentCustomizations, equipmentId);
    if (!isValidCell({ row, col }, bounds, occupied)) return false;

    setEquipmentCustomizations((prev) => {
      const existing = prev[equipmentId];
      return {
        ...prev,
        [equipmentId]: {
          row,
          col,
          color: existing?.color ?? item.color,
          rotationStep: existing?.rotationStep ?? 0,
        },
      };
    });
    return true;
  }

  function buyUpgrade(upgradeId: string): PurchaseResult {
    const upgrade = UPGRADE_CATALOG.find((entry) => entry.id === upgradeId);
    if (!upgrade) return { success: false, newlyCompleted: [] };
    if (purchasedUpgradeIds.includes(upgradeId)) return { success: false, newlyCompleted: [] };
    if (cash < upgrade.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - upgrade.cost);
    setPurchasedUpgradeIds((prev) => [...prev, upgradeId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  function hireManager(managerId: string): PurchaseResult {
    const manager = MANAGER_CATALOG.find((entry) => entry.id === managerId);
    if (!manager) return { success: false, newlyCompleted: [] };
    if (hiredManagerIds.includes(managerId)) return { success: false, newlyCompleted: [] };
    if (cash < manager.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - manager.cost);
    const nextManagerIds = [...hiredManagerIds, managerId];
    setHiredManagerIds(nextManagerIds);

    const nextRawCashPerSecond = rawCashPerSecond + manager.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds: nextManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  function hireStaff(staffId: string): PurchaseResult {
    const staff = STAFF_CATALOG.find((entry) => entry.id === staffId);
    if (!staff) return { success: false, newlyCompleted: [] };
    if (hiredStaffIds.includes(staffId)) return { success: false, newlyCompleted: [] };
    if (cash < staff.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - staff.cost);
    setHiredStaffIds((prev) => [...prev, staffId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  function prestigeReset(targetLocationId: string): boolean {
    const target = LOCATION_CATALOG.find((entry) => entry.id === targetLocationId);
    if (!target) return false;
    if (gymLevel < target.requiredLevel) return false;
    if (prestigeCount + 1 < target.requiredPrestige) return false;

    setCash(STARTING_CASH);
    setPurchasedEquipmentIds([]);
    setEquipmentLevels({});
    setEquipmentCustomizations({});
    setHiredManagerIds([]);
    setHiredStaffIds([]);
    setPrestigeCount((prev) => prev + 1);
    setCurrentLocationId(targetLocationId);

    return true;
  }

  function buyZone(zoneId: string): PurchaseResult {
    const zone = ZONE_CATALOG.find((entry) => entry.id === zoneId);
    if (!zone) return { success: false, newlyCompleted: [] };
    if (unlockedZones.includes(zoneId)) return { success: false, newlyCompleted: [] };
    if (gymLevel < zone.requiredLevel) return { success: false, newlyCompleted: [] };
    if (cash < zone.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - zone.cost);
    setUnlockedZones((prev) => [...prev, zoneId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
  }

  const value = useMemo(
    () => ({
      level,
      xp,
      xpToNextLevel: XP_PER_LEVEL,
      addXp,
      cash,
      addCash,
      purchasedEquipmentIds,
      purchasedUpgradeIds,
      hiredManagerIds,
      equipmentLevels,
      cashPerSecond,
      cashRewardMultiplier,
      buyEquipment,
      buyUpgrade,
      hireManager,
      upgradeEquipment,
      renownPoints,
      renownToNextGymLevel: RENOWN_PER_GYM_LEVEL,
      gymLevel,
      completedQuestIds,
      checkQuests,
      prestigeCount,
      currentLocationId,
      currentLocation,
      globalMultiplier,
      prestigeReset,
      lifetimeCashEarned,
      unlockedZones,
      buyZone,
      hiredStaffIds,
      hireStaff,
      injectDevRiches,
      equipmentCustomizations,
      setEquipmentColor,
      rotateEquipment,
      moveEquipment,
    }),
    [
      level,
      xp,
      cash,
      purchasedEquipmentIds,
      purchasedUpgradeIds,
      hiredManagerIds,
      equipmentLevels,
      cashPerSecond,
      cashRewardMultiplier,
      renownPoints,
      gymLevel,
      completedQuestIds,
      prestigeCount,
      currentLocationId,
      currentLocation,
      globalMultiplier,
      lifetimeCashEarned,
      unlockedZones,
      hiredStaffIds,
      equipmentCustomizations,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
