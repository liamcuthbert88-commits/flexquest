import { useEffect, useRef, useState } from "react";
import { Animated, Text, type StyleProp, type TextStyle } from "react-native";

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  prefix?: string;
};

const COUNT_DURATION_MS = 400;

/** Smoothly tweens the displayed text from the previous value to the new one
 * instead of snapping — the "alive" count-up read of a premium tycoon HUD.
 * A full rolling-digit odometer would need the number split into a per-digit
 * array with independent scroll animations; this single-value tween gets
 * most of the same feel for far less code, and only runs for ~400ms bursts
 * whenever `value` actually changes (idle tick, tap bonus, purchase). */
export function AnimatedCashCounter({ value, style, prefix = "$" }: Props) {
  const [displayValue, setDisplayValue] = useState(value);
  const animRef = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    const listenerId = animRef.addListener(({ value: v }) => setDisplayValue(v));
    return () => animRef.removeListener(listenerId);
  }, [animRef]);

  useEffect(() => {
    Animated.timing(animRef, {
      toValue: value,
      duration: COUNT_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [value, animRef]);

  return (
    <Text style={style}>
      {prefix}
      {displayValue.toFixed(0)}
    </Text>
  );
}
