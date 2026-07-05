import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { colors } from "@/constants/theme";

export type CashPopup = {
  id: string;
  x: number;
  y: number;
  amount: number;
};

type ItemProps = {
  popup: CashPopup;
  onComplete: (id: string) => void;
};

const DRIFT_DISTANCE = 40;
const DURATION_MS = 600;

function FloatingCashPopupItem({ popup, onComplete }: ItemProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -DRIFT_DISTANCE,
        duration: DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete(popup.id));
    // Runs once per mounted popup instance; `popup`/`onComplete` are stable for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.text,
        {
          left: popup.x,
          top: popup.y,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      +${popup.amount}
    </Animated.Text>
  );
}

type LayerProps = {
  popups: CashPopup[];
  onPopupComplete: (id: string) => void;
};

export function FloatingCashPopupLayer({ popups, onPopupComplete }: LayerProps) {
  return (
    <>
      {popups.map((popup) => (
        <FloatingCashPopupItem key={popup.id} popup={popup} onComplete={onPopupComplete} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  text: {
    position: "absolute",
    fontSize: 20,
    fontWeight: "800",
    color: colors.success,
  },
});
